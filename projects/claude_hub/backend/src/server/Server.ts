// HTTP + WebSocket 服务（入口层）：只接收请求、转发给 logic_realize，不写业务逻辑
import express, { Request, Response } from 'express';
import * as http from 'http';
import { WebSocketServer } from 'ws';
import { AppConfig } from '../config/AppConfig';
import { Paths } from '../paths';
import { Logger } from '../helper/Logger';
import { ErrorHandler } from '../helper/ErrorHandler';
import { EventBus } from '../helper/EventBus';
import { RootManager } from '../logic_realize/RootManager';
import { SessionManager } from '../logic_realize/SessionManager';
import { TaskQueue } from '../logic_realize/TaskQueue';
import { AuthManager } from '../logic_realize/AuthManager';
import { FsBrowser } from '../logic_realize/FsBrowser';
import { TemplateManager } from '../logic_realize/TemplateManager';
import { SessionFiles } from '../logic_realize/SessionFiles';
import { FileManager } from '../logic_realize/FileManager';
import { Uploader } from '../logic_realize/Uploader';
import { Settings } from '../logic_realize/Settings';
import { CodexProfile } from '../logic_realize/CodexProfile';
import { EngineConfig } from '../logic_realize/EngineConfig';
import { EngineUpdater } from '../logic_realize/EngineUpdater';
import { Toolchain } from '../logic_realize/Toolchain';
import { EngineStatus } from '../logic_realize/EngineStatus';
import { Connectivity } from '../logic_realize/Connectivity';
import { ClaudeLogin } from '../logic_realize/ClaudeLogin';
import { ModelManager } from '../logic_realize/ModelManager';
import { GitPusher } from '../logic_realize/GitPusher';
import { FolderOpener } from '../logic_realize/FolderOpener';
import { TraceStore } from '../logic_realize/TraceStore';
import { CommandRunner } from '../logic_realize/CommandRunner';
import { CommandsConfig } from '../config/CommandsConfig';

export class Server {
  static start(): void {
    const app = express();
    app.use(express.json({ limit: '4mb' }));
    app.use(express.static(Paths.FRONTEND_DIR));

    // ── 首启密码状态（无需鉴权）：needsSetup=true 表示尚未设定密码，前端引导用户创建 ──
    app.get('/api/auth/status', (_req, res) =>
      this._wrap(res, 'auth.status', () => ({ needsSetup: AuthManager.needsSetup() })),
    );
    // ── 首次设定密码（仅在尚未设定时可用，无需鉴权） ──
    app.post('/api/auth/setup', (req, res) =>
      this._wrap(res, 'auth.setup', () => ({ token: AuthManager.setup(req.body.password) })),
    );
    // ── 登录（无需鉴权） ──
    app.post('/api/auth/login', (req, res) =>
      this._wrap(res, 'auth.login', () => ({ token: AuthManager.login(req.body.password) })),
    );

    // ── 鉴权中间件：其余 /api/* 必须携带有效 token ──
    app.use('/api', (req: Request, res: Response, next) => {
      // 尚未设定密码时：放开新手引导所需的少量接口（引导走完才设密码）
      if (AuthManager.isOpenDuringSetup(req.path)) {
        next();
        return;
      }
      const token = (req.headers['x-auth-token'] as string) || String(req.query.token || '');
      if (!AuthManager.verify(token)) {
        res.status(401).json({ success: false, error: 'unauthorized' });
        return;
      }
      next();
    });

    // 客户端用持久 token 探测登录态
    app.get('/api/auth/check', (_req, res) => this._ok(res, { ok: true }));
    // 修改密码（需先验证旧密码）
    app.post('/api/auth/change', (req, res) =>
      this._wrap(res, 'auth.change', () => ({
        token: AuthManager.changePassword(req.body.oldPassword, req.body.newPassword),
      })),
    );
    // 重置密码（忘记旧密码）：已通过鉴权中间件即视为本机授权用户，无需旧密码
    app.post('/api/auth/reset', (req, res) =>
      this._wrap(res, 'auth.reset', () => ({
        token: AuthManager.resetPassword(req.body.newPassword),
      })),
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
    app.get('/api/settings', (_req, res) => this._ok(res, Settings.get()));
    app.post('/api/settings', (req, res) =>
      this._wrap(res, 'settings.set', () => Settings.update(req.body)),
    );

    // ── 引擎服务商配置（claude/codex：原版 / 小米 MiMo / kimi / minimax + apiKey + model）──
    // 可选服务商清单（含开通链接与说明），供新手引导与设置面板渲染
    app.get('/api/engine/providers', (_req, res) =>
      this._ok(res, { providers: EngineConfig.providerList() }),
    );
    // 引擎是否已安装（系统 / out_end 内置），供引导提示「一键安装内置引擎」
    app.get('/api/engine/status', (_req, res) => this._ok(res, EngineStatus.get()));
    app.get('/api/engine/config', (_req, res) => this._ok(res, EngineConfig.get()));
    app.post('/api/engine/config', (req, res) =>
      this._wrap(res, 'engine.config', () =>
        EngineConfig.setProvider(req.body.engine, {
          provider: req.body.provider,
          apiKey: req.body.apiKey || '',
          model: req.body.model || '',
          effort: req.body.effort || '',
          baseUrl: req.body.baseUrl || '',
          modelsUrl: req.body.modelsUrl || '',
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
          String(req.query.apiKey || ''),
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

    // ── Codex 档位（原版 ChatGPT ↔ Kimi K3）──
    app.get('/api/codex/profile', (_req, res) => this._ok(res, CodexProfile.status()));
    app.post('/api/codex/profile', (req, res) =>
      this._wrap(res, 'codex.setProfile', () => CodexProfile.setProfile(req.body.profile)),
    );
    app.post('/api/codex/key', (req, res) =>
      this._wrap(res, 'codex.setKey', () => CodexProfile.setKimiKey(req.body.key)),
    );

    // ── 根目录 ──
    app.get('/api/root/list', (_req, res) => this._ok(res, RootManager.listRoots()));
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
    app.post('/api/root/open', (req, res) =>
      this._wrap(res, 'root.open', () => FolderOpener.open(req.body.rootId)),
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
    app.get('/api/session/list', (req, res) =>
      this._wrap(res, 'session.list', () => SessionManager.listSessions(String(req.query.rootId))),
    );
    // 工作台模式：跨全部根目录合并列出会话
    app.get('/api/session/list-all', (_req, res) =>
      this._wrap(res, 'session.listAll', () => SessionManager.listAllSessions()),
    );
    app.get('/api/session/list-favorites', (_req, res) =>
      this._wrap(res, 'session.listFavorites', () => SessionManager.listFavoriteSessions()),
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
    app.get('/api/session/get', (req, res) =>
      this._wrap(res, 'session.get', () => SessionManager.getSessionFull(String(req.query.id))),
    );
    // 全文搜索：跨会话读 jsonl 找关键词（标题 + 全部对话正文）。rootId 缺省=跨全部根目录
    app.get('/api/session/search', (req, res) =>
      this._wrap(res, 'session.search', () =>
        SessionManager.searchSessions(String(req.query.q || ''), String(req.query.rootId || '') || undefined),
      ),
    );
    app.post('/api/session/remove', (req, res) =>
      this._wrap(res, 'session.remove', () => {
        SessionManager.removeSession(req.body.id);
        return { id: req.body.id };
      }),
    );
    // 批量删除会话
    app.post('/api/session/remove-batch', (req, res) =>
      this._wrap(res, 'session.removeBatch', () => SessionManager.removeSessions(req.body.ids)),
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
    // GET /api/session/trace-stats?id=<sessionId>    → 只要统计（慢在哪）
    app.get('/api/session/trace-stats', (req, res) =>
      this._wrap(res, 'session.traceStats', () => TraceStore.stats(String(req.query.id))),
    );

    // ── 上传文件到 <会话根目录>/tmp/（原始二进制 body，文件名经 query 传入）──
    // 鉴权中间件已对 /api/* 校验 token；raw 解析器仅作用于本路由
    app.post(
      '/api/session/upload',
      express.raw({ type: '*/*', limit: '200mb' }),
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
    app.get('/api/fm/browse', (req, res) =>
      this._wrap(res, 'fm.browse', () =>
        FileManager.browse(String(req.query.rootId), String(req.query.rel || '')),
      ),
    );
    app.get('/api/fm/search', (req, res) =>
      this._wrap(res, 'fm.search', () =>
        FileManager.search(String(req.query.rootId), String(req.query.q || '')),
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
    app.post('/api/task/add', (req, res) =>
      this._wrap(res, 'task.add', () => TaskQueue.addTasks(req.body.sessionId, req.body.prompts)),
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

    const server = http.createServer(app);
    const wss = new WebSocketServer({ server, path: '/ws' });
    wss.on('connection', (ws, req) => {
      // WebSocket 同样校验 token（通过 query 传入）
      const token = new URL(req.url || '', 'http://x').searchParams.get('token') || undefined;
      if (!AuthManager.verify(token)) {
        ws.close(4001, 'unauthorized');
        return;
      }
      EventBus.register(ws);
    });

    // 安全：默认仅 localhost 可访问；设置里开启「允许局域网访问」后才绑定 0.0.0.0（需重启生效）。
    const allowLan = Settings.get().allowLan;
    const host = allowLan ? '0.0.0.0' : '127.0.0.1';
    server.listen(AppConfig.PORT, host, () =>
      Logger.info(
        'Server',
        `claude-hub listening on http://localhost:${AppConfig.PORT}` +
          (allowLan ? `（局域网可访问 0.0.0.0:${AppConfig.PORT}）` : '（仅 localhost）'),
      ),
    );
  }

  // 统一成功响应
  private static _ok(res: Response, data: unknown): void {
    res.json({ success: true, data });
  }

  // 统一异常包装
  private static _wrap(res: Response, ctx: string, fn: () => unknown): void {
    try {
      this._ok(res, fn());
    } catch (e: unknown) {
      res.status(500).json({ success: false, error: ErrorHandler.handle(e, `Server.${ctx}`) });
    }
  }

  // 异步异常包装
  private static _wrapAsync(res: Response, ctx: string, fn: () => Promise<unknown>): void {
    fn()
      .then((data) => this._ok(res, data))
      .catch((e: unknown) =>
        res.status(500).json({ success: false, error: ErrorHandler.handle(e, `Server.${ctx}`) }),
      );
  }
}
