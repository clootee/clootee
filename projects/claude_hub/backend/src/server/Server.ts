// HTTP + WebSocket 服务（入口层）：只接收请求、转发给 logic_realize，不写业务逻辑
import express, { Request, Response } from 'express';
import * as http from 'http';
import * as path from 'path';
import { WebSocketServer } from 'ws';
import { AppConfig } from '../config/AppConfig';
import { PackageInfo } from '../helper/PackageInfo';
import { Paths } from '../paths';
import { ServerHealth } from '../helper/ServerHealth';
import { Logger } from '../helper/Logger';
import { LifeGuard } from '../logic_realize/LifeGuard';
import { ErrorHandler } from '../helper/ErrorHandler';
import { EventBus } from '../helper/EventBus';
import { RootManager } from '../logic_realize/RootManager';
import { CodexStoreHelper } from '../helper/CodexStoreHelper';
import { SessionList } from '../logic_realize/SessionList';
import { SessionManager } from '../logic_realize/SessionManager';
import { TaskQueue } from '../logic_realize/TaskQueue';
import { CostOptimizer } from '../logic_realize/CostOptimizer';
import { SessionLimit } from '../helper/SessionLimit';
import { AuthManager } from '../logic_realize/AuthManager';
import { LocalAccess } from '../helper/LocalAccess';
import { FsBrowser } from '../logic_realize/FsBrowser';
import { TemplateManager } from '../logic_realize/TemplateManager';
import { SessionFiles } from '../logic_realize/SessionFiles';
import { FileManager } from '../logic_realize/FileManager';
import { Uploader } from '../logic_realize/Uploader';
import { Settings } from '../logic_realize/Settings';
import { CodexProfile } from '../logic_realize/CodexProfile';
import { CodexLogin } from '../logic_realize/CodexLogin';
import { EngineConfig } from '../logic_realize/EngineConfig';
import { EngineUpdater } from '../logic_realize/EngineUpdater';
import { Toolchain } from '../logic_realize/Toolchain';
import { EngineStatus } from '../logic_realize/EngineStatus';
import { Connectivity } from '../logic_realize/Connectivity';
import { ClaudeLogin } from '../logic_realize/ClaudeLogin';
import { ModelManager } from '../logic_realize/ModelManager';
import { GitPusher } from '../logic_realize/GitPusher';
import { GitBin } from '../helper/GitBin';
import { FolderOpener } from '../logic_realize/FolderOpener';
import { TraceStore } from '../logic_realize/TraceStore';
import { CommandRunner } from '../logic_realize/CommandRunner';
import { CommandsConfig } from '../config/CommandsConfig';
import { UpdateChecker } from '../logic_realize/UpdateChecker';
import { ExternalInbox } from '../logic_realize/ExternalInbox';
import { ConsoleAccount } from '../logic_realize/ConsoleAccount';
import { RootLock } from '../logic_realize/RootLock';
import { ApiCost } from '../logic_realize/ApiCost';
import { FrontendAssets } from '../helper/FrontendAssets';

const SERVER_STARTED_AT = Date.now();

export class Server {
  // 慢请求阈值（毫秒）：超过就在日志里留一条 WARN
  private static readonly SLOW_REQUEST_MS = 500;

  static start(): void {
    const app = express();
    app.use(express.json({ limit: '4mb' }));
    FrontendAssets.mount(app);
    const server = http.createServer(app);

    // Optional security password is independent of provider accounts.
    app.get('/api/auth/status', (req, res) =>
      this._wrap(res, 'auth.status', () => ({ needsSetup: false,
        passwordEnabled: AuthManager.passwordEnabled(), legacyCredentials: AuthManager.legacyCredentials(),
        localAccess: this._isLocalRequest(req), recoveryCommand: this._recoveryCommand(),
        version: PackageInfo.version(), instance: `${process.pid}:${SERVER_STARTED_AT}` })),
    );
    app.post('/api/auth/setup', (req, res) =>
      this._wrap(res, 'auth.setup', () => {
        if (!this._isLocalRequest(req)) throw new Error('Set a security password on the computer running Clootee');
        return { token: AuthManager.setup(req.body.password, this._client(req)) };
      }),
    );
    app.post('/api/auth/quickstart', (req, res) =>
      this._wrap(res, 'auth.quickstart', () => {
        if (!this._isLocalRequest(req)) throw new Error('Local access required');
        return { token: AuthManager.quickstart() };
      }),
    );
    app.post('/api/auth/legacy/disable', (req, res) =>
      this._wrap(res, 'auth.legacyDisable', () => {
        if (!this._isLocalRequest(req) || req.body.confirm !== true) throw new Error('Local confirmation required');
        AuthManager.clearLegacy();
        return { passwordEnabled: false };
      }),
    );
    app.post('/api/auth/login', (req, res) =>
      this._wrap(res, 'auth.login', () => ({ token: AuthManager.login(req.body.password, this._client(req)) })),
    );

    // ── 外部消息注入（供第三方系统接入，如 bug_tracker 回复转发）：
    //    鉴权走各根目录自己的 externalApiToken（齿轮设置里可开关/换 token），不走登录 token，
    //    因此必须注册在下面的登录鉴权中间件之前 ──
    app.post('/api/external/message', (req, res) =>
      this._wrap(res, 'external.message', () =>
        ExternalInbox.postMessage(
          String(req.body.rootId || ''),
          String(req.body.token || ''),
          String(req.body.sessionId || ''),
          String(req.body.content || ''),
        ),
      ),
    );

    // ── 鉴权中间件：其余 /api/* 必须携带有效 token ──
    app.use('/api', (req: Request, res: Response, next) => {
      const token = (req.headers['x-auth-token'] as string) || String(req.query.token || '');
      if (!this._canAccess(req, token)) {
        res.status(AuthManager.passwordEnabled() ? 401 : 403).json({ success: false, error: AuthManager.passwordEnabled() ? 'security_password_required' : 'local_access_required' });
        return;
      }
      next();
    });

    // ── 目录私有密码：请求里涉及的根目录 / 会话（id 形如 rootId:uuid）若已加锁且未携带解锁凭据 → 403。
    //    列表类接口不拦，改为在返回时把加锁目录的会话脱敏（前端显示「加密」）；锁管理接口自行校验密码 ──
    app.use('/api', (req, res, next) => {
      const p = req.path;
      if (p.startsWith('/root/lock/') || p === '/root/list' || p.startsWith('/session/list') || p === '/session/page' || p === '/session/recency' || p === '/session/search') {
        next();
        return;
      }
      const keys = RootLock.keysFromCookie(req.headers.cookie);
      if (this._lockedIds(req).some((rid) => !RootLock.canAccess(rid, keys))) {
        res.status(403).json({ success: false, error: 'root locked', locked: true });
        return;
      }
      next();
    });

    // If Git is removed while the tool is running, repair it before executing
    // the pending action. Authorization and root locks have already been checked.
    app.use('/api', (req, res, next) => {
      if (!['/task/add', '/flow/resume', '/git/push', '/git/push-root', '/root/gitpush', '/update/check', '/update/apply', '/toolchain/status'].includes(req.path)) { next(); return; }
      GitBin.ensure().then(() => next()).catch(error => res.status(500).json({ success: false, error: error.message }));
    });

    // 客户端用持久 token 探测登录态
    app.get('/api/auth/check', (_req, res) => this._ok(res, { ok: true, version: PackageInfo.version(), instance: `${process.pid}:${SERVER_STARTED_AT}` }));
    // 修改密码（必须验证旧密码）
    app.post('/api/auth/change', (req, res) =>
      this._wrap(res, 'auth.change', () => ({
        token: AuthManager.changePassword(req.body.oldPassword, req.body.newPassword, this._client(req)),
      })),
    );
    // 重置密码：与修改密码一样必须先给出正确的旧密码——
    // 忘记密码时请在本机命令行执行 passwd.bat / ./passwd.sh（见 authctl），不要留无门槛重置接口。
    app.post('/api/auth/reset', (req, res) =>
      this._wrap(res, 'auth.reset', () => ({
        token: AuthManager.resetPassword(req.body.oldPassword, req.body.newPassword, this._client(req)),
      })),
    );

    app.post('/api/auth/disable', (req, res) =>
      this._wrap(res, 'auth.disable', () => {
        AuthManager.disable(req.body.password, this._client(req));
        return { passwordEnabled: false };
      }),
    );

    // ── 目录浏览（选择根目录用） ──
    app.get('/api/fs/list', (req, res) =>
      this._wrap(res, 'fs.list', () => FsBrowser.list(String(req.query.path || ''))),
    );
    app.post('/api/fs/mkdir', (req, res) =>
      this._wrap(res, 'fs.mkdir', () =>
        FsBrowser.createDir(String(req.body.parent || ''), String(req.body.name || '')),
      ),
    );
    app.get('/api/fs/search', (req, res) =>
      this._wrap(res, 'fs.search', () =>
        FsBrowser.search(String(req.query.base || ''), String(req.query.q || '')),
      ),
    );
    // 新建项目时推荐的默认父目录（供「新建项目」表单预填）
    app.get('/api/fs/default-project-dir', (_req, res) =>
      this._wrap(res, 'fs.defaultProjectDir', () => FsBrowser.defaultProjectDir()),
    );

    // ── 全局设置（默认引擎 / 局域网访问 / 优先内置引擎）──
    app.get('/api/system/health', (_req, res) => this._wrapAsync(res, 'system.health', () => ServerHealth.get()));
    app.get('/api/settings', (_req, res) => this._ok(res, Settings.get()));
    app.post('/api/settings', (req, res) =>
      this._wrapAsync(res, 'settings.set', async () => {
        const previous = Settings.get().allowLan;
        const settings = Settings.update(req.body);
        if (previous !== settings.allowLan) {
          if (process.env.CLOOTEE_SUPERVISED !== '1') {
            try { await this._listenHost(server, settings.allowLan); }
            catch (error) {
              Settings.update({ allowLan: previous });
              await this._listenHost(server, previous);
              throw error;
            }
          }
          EventBus.revalidate();
        }
        return settings;
      }),
    );

    // ── 引擎服务商配置（claude/codex：原版 / 小米 MiMo / kimi / minimax + apiKey + model）──
    // 可选服务商清单（含开通链接与说明），供新手引导与设置面板渲染
    app.get('/api/engine/providers', (_req, res) =>
      this._ok(res, { providers: EngineConfig.providerList() }),
    );
    // ── Clootee 默认服务商（console.clootee.com）：一键开通 / 余额 / 用量 / 充值入口 ──
    app.post('/api/console/login/code', (req,res)=>this._wrapAsync(res,'console.login.code',()=>ConsoleAccount.sendEmailCode(String(req.body.email||''),String(req.body.lang||''))));
    app.post('/api/console/login/email', (req,res)=>this._wrapAsync(res,'console.login.email',()=>ConsoleAccount.loginWithEmail(String(req.body.email||''),String(req.body.code||''),String(req.body.lang||''))));
    app.post('/api/console/login/start', (_req,res)=>this._wrapAsync(res,'console.login.start',()=>ConsoleAccount.beginLogin()));
    app.post('/api/console/login/poll', (req,res)=>this._wrapAsync(res,'console.login.poll',()=>ConsoleAccount.finishLogin(String(req.body.loginId||''))));
    app.post('/api/console/activate', (_req, res) =>
      this._wrapAsync(res, 'console.activate', () => ConsoleAccount.activate()),
    );
    app.post('/api/console/logout', (_req, res) =>
      this._wrapAsync(res, 'console.logout', async () => ConsoleAccount.signOut()),
    );
    app.get('/api/console/status', (_req, res) =>
      this._wrapAsync(res, 'console.status', () => ConsoleAccount.status()),
    );
    app.get('/api/console/usage', (req, res) =>
      this._wrapAsync(res, 'console.usage', () => ConsoleAccount.usage(Number(req.query.limit) || 10)),
    );
    app.get('/api/console/turn', (req, res) =>
      this._wrapAsync(res, 'console.turn', () =>
        ConsoleAccount.turnCost(String(req.query.taskId || ''))),
    );
    app.post('/api/console/link', (_req, res) =>
      this._wrapAsync(res, 'console.link', async () => ({ url: await ConsoleAccount.linkUrl() })),
    );
    // 引擎是否已安装（系统 / out_end 内置），供引导提示「一键安装内置引擎」
    // 默认读进程级缓存（探测要起子进程，Windows 上还会闪窗）；
    // ?refresh=1 才真正重探——用户在软件外面自己装了引擎时由前端显式触发
    app.get('/api/engine/status', (req, res) =>
      this._ok(res, EngineStatus.get(req.query.refresh === '1')),
    );
    app.get('/api/engine/config', (_req, res) => this._ok(res, EngineConfig.get()));
    // clootee 的 Key 是本机自动领的设备令牌：前端没带 Key 时由 ConsoleAccount 补上，用户永远不用填
    app.post('/api/engine/config', (req, res) =>
      this._wrapAsync(res, 'engine.config', async () =>
        EngineConfig.setProvider(req.body.engine, {
          provider: req.body.provider,
          apiKey: req.body.provider === 'clootee' ? await ConsoleAccount.ensureToken() : req.body.apiKey || '',
          model: req.body.model || '',
          effort: req.body.effort || '',
          baseUrl: req.body.baseUrl || '',
          modelsUrl: req.body.modelsUrl || '',
          contextWindow: req.body.contextWindow === undefined ? undefined : Number(req.body.contextWindow),
        }),
      ),
    );
    // 某引擎下每个服务商各自保存的设置（供前端换服务商时回显该服务商自己上次的 Key/模型/强度）
    app.get('/api/engine/slots', (req, res) =>
      this._wrap(res, 'engine.slots', () => ({
        slots: EngineConfig.slots(String(req.query.engine || 'claude') as any),
      })),
    );
    // 实时拉取服务商模型列表；recommended = 在真实返回的 id 里挑的默认模型（前端换服务商时自动选中）
    app.get('/api/engine/models', (req, res) =>
      this._wrapAsync(res, 'engine.models', async () => {
        const provider = req.query.provider as any;
        const models = await EngineConfig.listModels(
          provider,
          String(req.query.apiKey || '') || (provider === 'clootee' ? await ConsoleAccount.ensureToken() : ''),
          String(req.query.baseUrl || ''),
          String(req.query.modelsUrl || ''),
        );
        return { models, recommended: EngineConfig.pickDefaultModel(provider, models) };
      }),
    );
    // ── 网络体检：有没有外网、能不能连上 Claude、哪些国产服务商当前可达 ──
    // 连不上 Claude 时报告里自带出路（开代理 / 换国产模型），前端在同一个界面给按钮
    app.get('/api/net/check', (_req, res) =>
      this._wrapAsync(res, 'net.check', () => Connectivity.check()),
    );
    // 只看「Claude 通不通」的快速检查（发消息前用）
    app.get('/api/net/quick', (_req, res) =>
      this._wrapAsync(res, 'net.quick', async () => ({ anthropic: await Connectivity.quick() })),
    );

    // ── Claude Code 账号登录（原版订阅）──
    // 网页端全程可完成：起流程 → 拿到授权链接 → 用户在浏览器授权 → 把授权码粘回来
    app.get('/api/claude/auth/status', (_req, res) =>
      this._wrapAsync(res, 'claude.authStatus', () => ClaudeLogin.status()),
    );
    app.get('/api/claude/auth/session', (_req, res) => this._ok(res, ClaudeLogin.session()));
    app.post('/api/claude/auth/login', (req, res) =>
      this._wrapAsync(res, 'claude.authLogin', () =>
        ClaudeLogin.start(req.body.mode === 'console' ? 'console' : 'claudeai'),
      ),
    );
    app.post('/api/claude/auth/code', (req, res) =>
      this._wrapAsync(res, 'claude.authCode', () => ClaudeLogin.submitCode(String(req.body.code || ''))),
    );
    app.post('/api/claude/auth/cancel', (_req, res) =>
      this._wrap(res, 'claude.authCancel', () => ClaudeLogin.cancel()),
    );

    // ── 运行环境工具链（node / git / claude / codex：本机 or 内置、缺了就装）──
    app.get('/api/toolchain/status', (_req, res) => this._ok(res, Toolchain.status()));
    // 选择某个工具用本机还是内置（auto=本机优先）
    app.post('/api/toolchain/prefer', (req, res) =>
      this._wrap(res, 'toolchain.prefer', () =>
        Toolchain.setPref(req.body.tool, req.body.pref),
      ),
    );
    // 一键模式：mode='bundled' 运行环境（node/git）全部用内置 / 'auto' 回到本机优先
    app.post('/api/toolchain/preset', (req, res) =>
      this._wrap(res, 'toolchain.preset', () => Toolchain.preset(req.body.mode)),
    );
    // 安装：target='global' 装到系统全局，'bundled' 下载到内置库；过程逐行广播
    app.post('/api/toolchain/install', (req, res) =>
      this._wrapAsync(res, 'toolchain.install', () =>
        Toolchain.install(req.body.tool, req.body.target || 'global', (line) =>
          EventBus.broadcast({ kind: 'toolInstall', tool: req.body.tool, line }),
        ),
      ),
    );

    // 安装 / 更新 claude / codex 到最新版（npm 全局安装，源在官方与国内镜像间竞速选出）
    // 下载动辄几百 MB，逐行把 npm 输出广播出去，前端据此显示进度，避免看起来像卡死
    app.post('/api/engine/update', (req, res) =>
      this._wrapAsync(res, 'engine.update', () =>
        EngineUpdater.update(String(req.body.engine || ''), (line) =>
          EventBus.broadcast({ kind: 'engineInstall', engine: String(req.body.engine || ''), line }),
        ),
      ),
    );

    // ── 软件本身的版本更新（版本清单 version.json 为准，git commit 兜底）──
    // 有更新时前端提示确认（强制更新则弹不可关闭的窗），确认后拉取 + 触发重新编译与重启
    // （脚本逐行输出通过 WS 广播）。lang 用于挑更新说明的语言。
    app.get('/api/update/check', (req, res) =>
      this._wrapAsync(res, 'update.check', () => UpdateChecker.check(String(req.query.lang || ''))),
    );
    app.get('/api/update/status', (_req, res) => this._ok(res, UpdateChecker.status()));
    app.post('/api/update/apply', (req, res) =>
      this._wrapAsync(res, 'update.apply', () =>
        UpdateChecker.apply((line) => EventBus.broadcast({ kind: 'updateApply', line }), req.body?.force === true),
      ),
    );

    // ── 模型选择（claude / codex 各自选定模型；''=自动，完全交给引擎）──
    app.get('/api/model/state', (_req, res) => this._ok(res, ModelManager.state()));
    // 选定模型（''=自动）
    app.post('/api/model/select', (req, res) =>
      this._wrap(res, 'model.select', () =>
        ModelManager.setModel(req.body.engine, String(req.body.model || '')),
      ),
    );
    // 选定思考强度（''=自动）。claude 传 --effort，codex 传 -c model_reasoning_effort
    app.post('/api/model/effort', (req, res) =>
      this._wrap(res, 'model.effort', () =>
        ModelManager.setEffort(req.body.engine, String(req.body.effort || '')),
      ),
    );
    // 检测「当前实际生效的模型」（真实探测引擎，不猜）
    app.post('/api/model/detect', (req, res) =>
      this._wrapAsync(res, 'model.detect', () => ModelManager.detect(req.body.engine)),
    );
    // 检测「有哪些模型可用」；verify=true 时逐个真实极小调用确认（较慢，仅 claude 原版有意义）
    app.post('/api/model/available', (req, res) =>
      this._wrapAsync(res, 'model.available', async () => ({
        models: await ModelManager.available(req.body.engine, !!req.body.verify),
      })),
    );

    // ── Codex 账号登录（原版订阅 / API Key）──
    // 与 claude 同一套思路：起流程 → 拿到链接+短码 → 用户在浏览器里填码 → 自动完成（不需要粘任何东西回来）
    app.get('/api/codex/auth/status', (_req, res) =>
      this._wrapAsync(res, 'codex.authStatus', () => CodexLogin.status()),
    );
    app.get('/api/codex/auth/session', (_req, res) => this._ok(res, CodexLogin.session()));
    app.post('/api/codex/auth/login', (req, res) =>
      this._wrapAsync(res, 'codex.authLogin', () =>
        CodexLogin.start(req.body.mode === 'apiKey' ? 'apiKey' : 'chatgpt', String(req.body.apiKey || '')),
      ),
    );
    app.post('/api/codex/auth/cancel', (_req, res) =>
      this._wrap(res, 'codex.authCancel', () => CodexLogin.cancel()),
    );

    // ── Codex 档位（原版 ChatGPT ↔ Kimi K3）──
    app.get('/api/codex/profile', (_req, res) => this._ok(res, CodexProfile.status()));
    app.post('/api/codex/profile', (req, res) =>
      this._wrap(res, 'codex.setProfile', () => CodexProfile.setProfile(req.body.profile)),
    );
    app.post('/api/codex/key', (req, res) =>
      this._wrap(res, 'codex.setKey', () => CodexProfile.setKimiKey(req.body.key)),
    );

    // ── 根目录 ──
    app.get('/api/root/list', (req, res) => {
      const keys = RootLock.keysFromCookie(req.headers.cookie);
      this._ok(
        res,
        RootManager.listRoots().map((r) =>
          RootLock.isLocked(r.id) ? { ...r, locked: true, unlocked: RootLock.canAccess(r.id, keys) } : r,
        ),
      );
    });
    // 目录私有密码：设置/修改（已加锁需旧密码）、关闭、解锁
    app.post('/api/root/lock/set', (req, res) =>
      this._wrap(res, 'root.lockSet', () =>
        RootLock.setPassword(String(req.body.id || ''), String(req.body.password || ''), req.body.oldPassword, this._client(req)),
      ),
    );
    app.post('/api/root/lock/clear', (req, res) =>
      this._wrap(res, 'root.lockClear', () =>
        RootLock.clear(String(req.body.id || ''), String(req.body.password || ''), this._client(req)),
      ),
    );
    app.post('/api/root/lock/unlock', (req, res) =>
      this._wrap(res, 'root.lockUnlock', () =>
        RootLock.unlock(String(req.body.id || ''), String(req.body.password || ''), this._client(req)),
      ),
    );
    app.post('/api/root/add', (req, res) =>
      this._wrap(res, 'root.add', () => RootManager.addRoot(req.body.name, req.body.path)),
    );
    app.post('/api/root/update', (req, res) =>
      this._wrap(res, 'root.update', () =>
        RootManager.updateRoot(req.body.id, {
          name: req.body.name,
          note: req.body.note,
          links: req.body.links,
        }),
      ),
    );
    app.post('/api/root/remove', (req, res) =>
      this._wrap(res, 'root.remove', () => {
        RootManager.removeRoot(req.body.id);
        return { id: req.body.id };
      }),
    );
    // 批量删除根目录
    app.post('/api/root/remove-batch', (req, res) =>
      this._wrap(res, 'root.removeBatch', () => RootManager.removeRoots(req.body.ids)),
    );
    // 工作台模式：确保某目录对应的根（同路径复用，可选不存在则创建）
    app.post('/api/root/ensure', (req, res) =>
      this._wrap(res, 'root.ensure', () =>
        RootManager.ensureRoot(req.body.path, !!req.body.create),
      ),
    );
    app.post('/api/root/quick-start', (req, res) =>
      this._wrap(res, 'root.quickStart', () => RootManager.quickStart(String(req.body.requestId || ''))),
    );
    // 新建项目：在 parentDir 下创建以 name（英文/数字/下划线）命名的项目并登记为根目录
    app.post('/api/root/create-project', (req, res) =>
      this._wrap(res, 'root.createProject', () =>
        RootManager.createProject(
          String(req.body.name || ''),
          String(req.body.parentDir || ''),
          !!req.body.allowExisting,
        ),
      ),
    );
    app.post('/api/root/gitpush', (req, res) =>
      this._wrap(res, 'root.gitpush', () => GitPusher.push(req.body.rootId)),
    );
    app.get('/api/root/info', (req, res) =>
      this._wrap(res, 'root.info', () => RootManager.rootInfo(String(req.query.id || ''))),
    );
    app.post('/api/root/open', (req, res) =>
      this._wrap(res, 'root.open', () => FolderOpener.open(req.body.rootId)),
    );
    // 外部消息注入 API 的开放状态（会话右上角齿轮）：查询会顺带补默认值+token
    app.get('/api/root/external', (req, res) =>
      this._wrap(res, 'root.externalGet', () => RootManager.ensureExternalApi(String(req.query.id || ''))),
    );
    app.post('/api/root/external', (req, res) =>
      this._wrap(res, 'root.externalSet', () =>
        RootManager.setExternalApiOpen(String(req.body.id || ''), !!req.body.open),
      ),
    );
    app.post('/api/root/external/reset-token', (req, res) =>
      this._wrap(res, 'root.externalReset', () =>
        RootManager.resetExternalApiToken(String(req.body.id || '')),
      ),
    );
    app.post('/api/root/external/base-url', (req, res) =>
      this._wrap(res, 'root.externalBaseUrl', () =>
        RootManager.setExternalApiBaseUrl(String(req.body.id || ''), String(req.body.baseUrl || '')),
      ),
    );

    // ── 项目模板（缺少 CLAUDE.md/AGENTS.md 时引导选模板）──
    app.get('/api/template/need', (req, res) =>
      this._wrap(res, 'template.need', () =>
        req.query.path
          ? TemplateManager.needsTemplateAtPath(String(req.query.path))
          : TemplateManager.needsTemplate(String(req.query.rootId || '')),
      ),
    );
    // 用户选择「不使用模板」→ 记住，之后不再对该根目录弹窗
    app.post('/api/template/skip', (req, res) =>
      this._wrap(res, 'template.skip', () => TemplateManager.skipTemplate(String(req.body.rootId || ''))),
    );
    app.get('/api/template/list', (_req, res) =>
      this._wrap(res, 'template.list', () => TemplateManager.listTemplates()),
    );
    app.post('/api/template/apply', (req, res) =>
      this._wrap(res, 'template.apply', () =>
        TemplateManager.applyTemplate(
          String(req.body.rootId || ''),
          req.body.kind,
          String(req.body.templateId || ''),
        ),
      ),
    );

    // ── 会话 ──
    app.get('/api/session/page', (req, res) => this._wrapAsync(res, 'session.page', async () => {
      const keys = RootLock.keysFromCookie(req.headers.cookie);
      const controller = new AbortController();
      res.once('close', () => controller.abort());
      const result = await SessionList.page({
        mode: String(req.query.mode || 'single'), rootId: String(req.query.rootId || ''),
        filterRootId: String(req.query.filterRootId || ''), status: String(req.query.status || 'all'),
        q: String(req.query.q || ''), fullText: req.query.fullText === '1',
        run: String(req.query.run || ''), finished: String(req.query.finished || '').split(',').filter(Boolean),
        offset: Number(req.query.offset || 0), limit: Number(req.query.limit || 20), snapshot: String(req.query.snapshot || ''),
      }, rootId => RootLock.canAccess(rootId, keys), controller.signal);
      return { ...result, items: this._redact(req, result.items) };
    }));
    app.get('/api/session/recency', (_req, res) => this._wrapAsync(res, 'session.recency', () => SessionList.recency()));
    app.get('/api/session/list', (req, res) =>
      this._wrapAsync(res, 'session.list', () => CodexStoreHelper.withIndex(Settings.effectiveHomeDir(), () => this._redact(req, SessionManager.listSessions(String(req.query.rootId))))),
    );
    // 工作台模式：跨全部根目录合并列出会话
    app.get('/api/session/list-all', (req, res) =>
      this._wrapAsync(res, 'session.listAll', async () => this._redact(req, await SessionManager.listAllSessions())),
    );
    app.get('/api/session/list-favorites', (req, res) =>
      this._wrapAsync(res, 'session.listFavorites', async () => this._redact(req, await SessionManager.listFavoriteSessions())),
    );
    // 「全部目录」视图：只取带索引标记的会话（本版本起新建即打标），不逐目录扫盘
    app.get('/api/session/list-indexed', (req, res) =>
      this._wrapAsync(res, 'session.listIndexed', async () => this._redact(req, await SessionManager.listIndexedSessions())),
    );
    app.post('/api/session/create', (req, res) =>
      this._wrap(res, 'session.create', () =>
        SessionManager.createSession(req.body.rootId, req.body.name, req.body.engine),
      ),
    );
    app.post('/api/session/engine', (req, res) =>
      this._wrap(res, 'session.engine', () =>
        SessionManager.setEngine(req.body.id, req.body.engine),
      ),
    );
    app.post('/api/session/prompt-cache', (req, res) =>
      this._wrap(res, 'session.promptCache', () => SessionManager.setPromptCache(String(req.body.id || ''), req.body.mode)),
    );
    app.get('/api/session/limit', (req, res) =>
      this._wrap(res, 'session.limit', () => {
        const session = SessionManager.getSessionFull(String(req.query.id));
        return SessionLimit.status(session, session.messages, Settings.get().costOptimization);
      }),
    );
    app.get('/api/session/get', (req, res) =>
      this._wrap(res, 'session.get', () => SessionManager.getSessionFull(String(req.query.id))),
    );
    // 全文搜索：跨会话读 jsonl 找关键词（标题 + 全部对话正文）。rootId 缺省=跨全部根目录
    app.get('/api/session/search', (req, res) =>
      this._wrapAsync(res, 'session.search', () =>
        SessionManager.searchSessions(String(req.query.q || ''), String(req.query.rootId || '') || undefined).then(
          (hits) => {
            const keys = RootLock.keysFromCookie(req.headers.cookie);
            return hits.filter((h) => RootLock.canAccess(this._rootOf(h.id), keys));
          },
        ),
      ),
    );
    app.post('/api/session/remove', (req, res) =>
      this._wrap(res, 'session.remove', () => {
        TaskQueue.removeSession(req.body.id);
        return { id: req.body.id };
      }),
    );
    // 批量删除会话
    app.post('/api/session/remove-batch', (req, res) =>
      this._wrap(res, 'session.removeBatch', () => TaskQueue.removeSessions(req.body.ids)),
    );
    app.post('/api/session/pin', (req, res) =>
      this._wrap(res, 'session.pin', () => SessionManager.setPinned(req.body.id, !!req.body.pinned)),
    );
    app.post('/api/session/favorite', (req, res) =>
      this._wrap(res, 'session.favorite', () =>
        SessionManager.setFavorite(req.body.id, !!req.body.favorite),
      ),
    );
    app.post('/api/session/status', (req, res) =>
      this._wrap(res, 'session.status', () => SessionManager.setStatus(req.body.id, req.body.status)),
    );
    app.post('/api/session/title', (req, res) =>
      this._wrap(res, 'session.title', () => SessionManager.setTitle(req.body.id, req.body.title)),
    );

    // ── 会话工具命令（/usage、/compact 等斜杠命令）：一键执行并返回输出反馈 ──
    // GET /api/command/list                → 可用命令白名单（前端渲染菜单）
    app.get('/api/command/list', (_req, res) => this._ok(res, CommandsConfig.list()));
    // POST /api/command/run { id, cmd }    → 在当前会话上执行斜杠命令，返回其输出
    app.post('/api/command/run', (req, res) =>
      this._wrapAsync(res, 'command.run', () =>
        CommandRunner.run(String(req.body.id || ''), String(req.body.cmd || '')),
      ),
    );

    // ── 过程轨迹（AI 工作全过程：思考/工具完整入参与输出/耗时/token）──
    // GET /api/session/trace?id=<sessionId>[&raw=1]  → 完整时间线 + 统计
    app.get('/api/session/trace', (req, res) =>
      this._wrap(res, 'session.trace', () =>
        TraceStore.read(String(req.query.id), String(req.query.raw || '') === '1'),
      ),
    );
    // GET /api/session/api-cost?id=<sessionId>      → Claude 官方 API 每轮精确费用明细
    app.get('/api/session/api-cost', (req, res) =>
      this._wrap(res, 'session.apiCost', () => ApiCost.session(String(req.query.id || ''))),
    );
    // POST /api/sessions/api-cost { ids }             → 会话列表用：各会话 API 费用合计
    app.post('/api/sessions/api-cost', (req, res) =>
      this._wrap(res, 'sessions.apiCost', () => ApiCost.totals(Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [])),
    );

    // GET /api/session/trace-stats?id=<sessionId>    → 只要统计（慢在哪）
    app.get('/api/session/trace-stats', (req, res) =>
      this._wrap(res, 'session.traceStats', () => TraceStore.stats(String(req.query.id))),
    );

    // ── 上传文件到 <会话根目录>/tmp/（原始二进制 body，文件名经 query 传入）──
    // 鉴权中间件已对 /api/* 校验 token；raw 解析器仅作用于本路由
    app.post(
      '/api/session/upload',
      express.raw({ type: '*/*', limit: '500mb' }),
      (req, res) => {
        this._wrap(res, 'session.upload', () =>
          Uploader.save(
            String(req.query.id || ''),
            String(req.query.name || ''),
            req.body as Buffer,
          ),
        );
      },
    );

    // ── 会话文件（聊天附件预览/下载） ──
    app.get('/api/session/files', (req, res) =>
      this._wrap(res, 'session.files', () => SessionFiles.list(String(req.query.id))),
    );
    app.post('/api/session/files-resolve', (req, res) =>
      this._wrap(res, 'session.filesResolve', () =>
        SessionFiles.resolve(req.body.id, req.body.names),
      ),
    );
    // 文件流式下载/内联预览（pdf/图片/表格/文本等）。鉴权中间件已校验 token
    app.get('/api/session/file', (req, res) => {
      try {
        const { path: full, meta } = SessionFiles.locate(String(req.query.id), String(req.query.name));
        const filename = meta.name.split('/').pop() || 'file';
        if (String(req.query.download || '') === '1') {
          res.setHeader(
            'Content-Disposition',
            `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
          );
        }
        res.sendFile(full);
      } catch (e: unknown) {
        res.status(404).json({ success: false, error: ErrorHandler.handle(e, 'Server.session.file') });
      }
    });

    // ── 文件管理器（右侧抽屉：按根目录浏览/编辑/搜索/重点文件夹） ──
    app.post('/api/fm/open-file', (req, res) =>
      this._wrapAsync(res, 'fm.openFile', () => FolderOpener.openFile(req.body.rootId, req.body.rel)),
    );
    app.post('/api/fm/open-containing', (req, res) =>
      this._wrapAsync(res, 'fm.openContaining', () => FolderOpener.openContaining(req.body.rootId, req.body.rel)),
    );
    app.get('/api/fm/browse', (req, res) =>
      this._wrap(res, 'fm.browse', () =>
        FileManager.browse(String(req.query.rootId), String(req.query.rel || '')),
      ),
    );
    app.get('/api/fm/search', (req, res) =>
      this._wrap(res, 'fm.search', () =>
        FileManager.search(
          String(req.query.rootId),
          String(req.query.q || ''),
          String(req.query.rel || ''),
          String(req.query.recursive || '') !== '0',
        ),
      ),
    );
    app.get('/api/fm/read', (req, res) =>
      this._wrap(res, 'fm.read', () =>
        FileManager.readFile(String(req.query.rootId), String(req.query.rel || '')),
      ),
    );
    app.post('/api/fm/write', (req, res) =>
      this._wrap(res, 'fm.write', () =>
        FileManager.writeFile(req.body.rootId, req.body.rel, req.body.content),
      ),
    );
    app.post('/api/fm/favorite', (req, res) =>
      this._wrap(res, 'fm.favorite', () => ({
        favorites: FileManager.toggleFavorite(req.body.rootId, req.body.rel),
      })),
    );
    // 文件流式下载/内联预览（按 rootId + 相对路径）。鉴权中间件已校验 token
    app.get('/api/fm/file', (req, res) => {
      try {
        const { path: full, meta } = FileManager.locate(
          String(req.query.rootId),
          String(req.query.rel || ''),
        );
        const filename = meta.name.split('/').pop() || 'file';
        if (String(req.query.download || '') === '1') {
          res.setHeader(
            'Content-Disposition',
            `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
          );
        }
        res.sendFile(full);
      } catch (e: unknown) {
        res.status(404).json({ success: false, error: ErrorHandler.handle(e, 'Server.fm.file') });
      }
    });

    // ── 任务 / 任务流 ──
    app.post('/api/cost/check', (req, res) =>
      this._wrap(res, 'cost.check', () => CostOptimizer.check(String(req.body.sessionId || ''), String(req.body.prompt || ''))),
    );
    app.post('/api/cost/approve', (req, res) =>
      this._wrap(res, 'cost.approve', () => ({ approvals: (Array.isArray(req.body.prompts) ? req.body.prompts : [req.body.prompt]).map((p: unknown) =>
        CostOptimizer.approve(String(req.body.sessionId || ''), String(p || ''), String(req.body.fingerprint || ''), String(req.body.compactProof || ''))) })),
    );
    app.post('/api/cost/compact', (req, res) =>
      this._wrapAsync(res, 'cost.compact', () => CostOptimizer.compact(String(req.body.sessionId || ''))),
    );
    app.post('/api/cost/migrate', async (req, res) => {
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      const emit = (stage: string, progress: number, data?: unknown) => { if (!res.destroyed) res.write(JSON.stringify({ stage, progress, data }) + '\n'); };
      try {
        await CostOptimizer.migrate(String(req.body.sessionId || ''), String(req.body.prompt || ''), emit, () => !res.destroyed);
      } catch (e) {
        const message = ErrorHandler.handle(e, 'Server.cost.migrate');
        emit('error', 0, { message });
      } finally { if (!res.destroyed) res.end(); }
    });
    app.post('/api/task/add', (req, res) =>
      this._wrap(res, 'task.add', () => TaskQueue.addTasks(req.body.sessionId, req.body.prompts, false, Array.isArray(req.body.costApprovals) ? req.body.costApprovals.map(String) : [])),
    );
    app.post('/api/task/remove', (req, res) =>
      this._wrap(res, 'task.remove', () => {
        TaskQueue.removeTask(req.body.sessionId, req.body.taskId);
        return { ok: true };
      }),
    );
    app.post('/api/task/removeBatch', (req, res) =>
      this._wrap(res, 'task.removeBatch', () => {
        TaskQueue.removeTasks(req.body.sessionId, req.body.taskIds);
        return { ok: true };
      }),
    );
    app.post('/api/task/update', (req, res) =>
      this._wrap(res, 'task.update', () => {
        TaskQueue.updateTask(req.body.sessionId, req.body.taskId, req.body.prompt);
        return { ok: true };
      }),
    );
    app.post('/api/task/hold', (req, res) =>
      this._wrap(res, 'task.hold', () => {
        TaskQueue.setHold(req.body.sessionId, req.body.taskId, !!req.body.held);
        return { ok: true };
      }),
    );
    app.post('/api/task/stop', (req, res) =>
      this._wrap(res, 'task.stop', () => {
        TaskQueue.stopCurrent(req.body.sessionId);
        return { ok: true };
      }),
    );
    app.post('/api/flow/pause', (req, res) =>
      this._wrap(res, 'flow.pause', () => {
        TaskQueue.pauseFlow(req.body.sessionId);
        return { ok: true };
      }),
    );
    app.post('/api/flow/resume', (req, res) =>
      this._wrap(res, 'flow.resume', () => {
        TaskQueue.resumeFlow(req.body.sessionId);
        return { ok: true };
      }),
    );

    // 注：小白教程的 AI 小助手不在这里。MiniMax 官方接口已放行 CORS，教程页直接从浏览器调用，
    // 后端不参与，也就没有「忘了重启就失灵」这回事。见 frontend/learn-assist.js。

    // 绑定失败（最常见是 EADDRINUSE：端口被别的进程、或上一个没死干净的自己占着）时，
    // 不能只在 stderr 甩一句 "address already in use"——要把占用方是谁写进生命周期日志。
    // 必须抢在 new WebSocketServer 之前注册：ws 会往 server 上挂一个「把 error 转发给 wss」的
    // 监听器，而 wss 上没人接 error 就会当场抛成 uncaughtException，排在它后面的处理器根本轮不到。
    server.on('error', (e) => {
      LifeGuard.reportBindFailure(AppConfig.PORT, e);
      Logger.error('Server', 'listen failed', e);
    });
    const wss = new WebSocketServer({ server, path: '/ws' });
    // ws 转发过来的同一个 error：这里必须有人接，否则 EventEmitter 会把它抛成未捕获异常。
    wss.on('error', (e) => Logger.error('Server', 'websocket server error', e));
    wss.on('connection', (ws, req) => {
      // WebSocket 同样校验 token（通过 query 传入）
      const token = new URL(req.url || '', 'http://x').searchParams.get('token') || undefined;
      if (!this._canAccess(req as Request, token)) {
        ws.close(4001, 'unauthorized');
        return;
      }
      EventBus.register(ws, () => this._canAccess(req as Request, token));
    });

    // 安全：默认仅 localhost 可访问；设置里开启「允许局域网访问」后才绑定 0.0.0.0（立即生效）。
    const allowLan = Settings.get().allowLan;
    const host = allowLan && !AppConfig.LOOPBACK_ONLY && process.env.CLOOTEE_SUPERVISED !== '1' ? '0.0.0.0' : '127.0.0.1';
    server.listen(AppConfig.PORT, host, () => {
      Logger.info(
        'Server',
        `claude-hub listening on http://localhost:${AppConfig.PORT}` +
          (host === '0.0.0.0' ? `（局域网可访问 0.0.0.0:${AppConfig.PORT}）` : '（仅 localhost）'),
      );
      // 端口到手后才开始看护：记开机行、挂信号钩子、开心跳
      LifeGuard.install(AppConfig.PORT);
      const gitCheck = setTimeout(() => { void GitBin.ensure().catch(error => Logger.warn('Git', 'automatic installation incomplete', error)); }, 1000);
      gitCheck.unref();
    });
  }

  private static _listenHost(server: http.Server, allowLan: boolean): Promise<void> {
    // Release the listener while keeping active HTTP/WS connections and tasks alive.
    if (server.listening) server.close();
    return new Promise((resolve, reject) => {
      const onError = (error: Error) => { server.off('listening', onListening); reject(error); };
      const onListening = () => { server.off('error', onError); resolve(); };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(AppConfig.PORT, allowLan && !AppConfig.LOOPBACK_ONLY ? '0.0.0.0' : '127.0.0.1');
    });
  }

  // 会话 id = rootId:uuid；根目录 id 本身不含冒号
  private static _rootOf(id: string): string {
    return String(id || '').split(':')[0];
  }

  // 请求参数里出现的、已加锁的根目录 id（query/body 的 id / sessionId / rootId / ids）
  private static _lockedIds(req: Request): string[] {
    const vals: unknown[] = [];
    for (const src of [req.query as Record<string, unknown>, (req.body || {}) as Record<string, unknown>]) {
      vals.push(src.id, src.sessionId, src.rootId);
      if (Array.isArray(src.ids)) vals.push(...src.ids);
    }
    const out = new Set<string>();
    vals.forEach((v) => {
      if (typeof v !== 'string' || !v) return;
      const rid = this._rootOf(v);
      if (RootLock.isLocked(rid)) out.add(rid);
    });
    return [...out];
  }

  // 列表脱敏：加锁且未解锁目录下的会话只留 id/rootId/时间，标题与预览清空并打 locked 标记
  private static _redact<T extends { id: string; rootId: string }>(req: Request, list: T[]): T[] {
    const keys = RootLock.keysFromCookie(req.headers.cookie);
    return list.map((s) => {
      if (RootLock.canAccess(s.rootId, keys)) return s;
      const x = s as unknown as Record<string, unknown>;
      return {
        id: s.id,
        rootId: s.rootId,
        engine: x.engine,
        createdAt: x.createdAt,
        updatedAt: x.updatedAt,
        favorite: x.favorite,
        pinned: x.pinned,
        status: x.status,
        name: '',
        claudeSessionId: '',
        tasks: [],
        messages: [],
        source: 'other',
        locked: true,
      } as unknown as T;
    });
  }

  // 统一成功响应
  // 请求是否来自本机浏览器：对端是回环地址，且 Host 头是 localhost / 127.0.0.1 / [::1]（防 DNS 重绑定）
  private static _isLocalRequest(req: Request): boolean {
    return LocalAccess.isLocal(req);
  }

  private static _canAccess(req: Request, token: string | undefined): boolean {
    if (!Settings.get().allowLan && !this._isLocalRequest(req)) return false;
    return AuthManager.passwordEnabled() ? AuthManager.verify(token) : this._isLocalRequest(req);
  }

  // 忘记密码时的服务器端自救命令：密码页会把这条命令展示给用户，
  // 路径由后端按自身安装位置生成，换部署目录也不会指错。
  private static _recoveryCommand(): string {
    const script = path.join(Paths.PROJECT_ROOT, process.platform === 'win32' ? 'passwd.bat' : 'passwd.sh');
    return `"${script}" set <new-password>`;
  }

  // 审计日志里的客户端标识：真实来源 IP（nginx 会写 X-Forwarded-For）+ 浏览器 UA 前 120 字。
  // 多窗口/多设备同时改密码时，靠这个区分是哪一边提交的。
  private static _client(req: Request): string {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const ua = String(req.headers['user-agent'] || '').slice(0, 120);
    return `${ip} ${ua}`.trim();
  }

  private static _ok(res: Response, data: unknown): void {
    res.json({ success: true, data });
  }

  // 统一异常包装
  private static _wrap(res: Response, ctx: string, fn: () => unknown): void {
    const t0 = Date.now();
    try {
      const data = fn();
      if (['auth.setup', 'auth.change', 'auth.reset', 'auth.disable', 'auth.legacyDisable'].includes(ctx)) {
        EventBus.revalidate();
        EventBus.broadcast({ kind: 'workspaceSecurity', passwordEnabled: AuthManager.passwordEnabled() });
      }
      this._logSlow(ctx, t0);
      this._ok(res, data);
    } catch (e: unknown) {
      res.status(500).json({ success: false, error: ErrorHandler.handle(e, `Server.${ctx}`) });
    }
  }

  // 异步异常包装
  private static _wrapAsync(res: Response, ctx: string, fn: () => Promise<unknown>): void {
    const t0 = Date.now();
    fn()
      .then((data) => {
        this._logSlow(ctx, t0);
        this._ok(res, data);
      })
      .catch((e: unknown) =>
        res.status(500).json({ success: false, error: ErrorHandler.handle(e, `Server.${ctx}`) }),
      );
  }

  // 慢请求留痕：接口耗时 >= 500ms 记一条 WARN。
  // 后端是单线程同步处理，一个慢接口会把所有其它请求（包括点开会话）一起堵住，
  // 所以这类问题必须能在 data/logs/app.log 里一眼看到是哪个接口、慢了多少。
  private static _logSlow(ctx: string, t0: number): void {
    const ms = Date.now() - t0;
    if (ms >= Server.SLOW_REQUEST_MS) Logger.warn('Server', 'slow request', { ctx, ms });
  }
}
