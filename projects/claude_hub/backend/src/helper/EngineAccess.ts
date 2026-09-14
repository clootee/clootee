// 保证「引擎子进程所属的系统用户」能进入并读写某个目录（业务无关）。
// 背景：Linux 下 hub 常以 root 起服务，但 claude/codex 必须切到普通用户（见 RunAsUser）跑。
// 于是出现一类隐蔽故障：项目根目录放在 /root/projects/xxx（/root 是 0750 root:root）时，
// hub 能正常建目录、上传附件，引擎却连 cd 都进不去，Read 附件直接 EACCES —— 表现为
// 会话里只剩一行 "tmp/Screenshot_xxx.jpg" 而 AI 说读不到。放在 /www/wwwroot 下的老项目
// 因为路径链本来就 o+x 才没暴露这个问题。
//
// 这里在「登记根目录 / 起会话 / 存上传附件」三个入口统一做保障：
//   1) 路径链每一级补 o+x（只给进入权，不给 r，目录内容仍不可列举）；
//   2) 目标目录给该用户 rwX，优先用 ACL（含 default ACL，之后新建的文件自动带权限，
//      这是「永久」的关键）；没有 setfacl 时退回「改属组 + g+rwX + setgid」；
//   3) 复验，仍不行就抛出可行动的错误，而不是留到引擎里变成一句 EACCES。
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { RunAsUser, RunAsUserConfig } from './RunAsUser';
import { Logger } from './Logger';

export class EngineAccess {
  // 已确认可访问的目录，避免每次起会话都跑一遍外部命令
  private static _ok = new Set<string>();

  // 保证目录可被引擎用户进入 + 读写。非 Linux/macOS、或根本不切用户时直接返回。
  // throwOnFail=false 时只记日志不抛（上传/起会话路径上不想因为权限修不动就整个失败）。
  static ensureDir(dirPath: string, cfg: RunAsUserConfig | undefined | null, throwOnFail = false): void {
    if (!dirPath || !RunAsUser.isActive(cfg)) return;
    const dir = path.resolve(dirPath);
    if (this._ok.has(dir)) return;
    const user = cfg!.user.trim();
    if (!fs.existsSync(dir)) return; // 目录还没建出来，等建好后调用方会再调一次
    if (this._canAccess(dir, user)) {
      this._ok.add(dir);
      return;
    }
    try {
      this._openAncestors(dir);
      this._grant(dir, user);
    } catch (e) {
      Logger.warn('EngineAccess', 'grant failed', { dir, user, error: String(e) });
    }
    if (this._canAccess(dir, user)) {
      this._ok.add(dir);
      Logger.info('EngineAccess', 'granted', { dir, user });
      return;
    }
    const msg =
      `目录 ${dir} 对引擎运行用户 ${user} 不可访问（自动授权失败）。` +
      `请在终端执行：chmod o+x 路径上各级目录，并 setfacl -R -m u:${user}:rwX -m d:u:${user}:rwX ${dir}；` +
      `（没有 setfacl 就先装 acl：apt-get install -y acl / dnf install -y acl）；` +
      `或把项目换到 ${user} 能访问的位置（例如 ${RunAsUser.homeDirFor(user)} 下）。`;
    Logger.warn('EngineAccess', 'still inaccessible', { dir, user });
    if (throwOnFail) throw new Error(msg);
  }

  // 保证单个文件可被引擎用户读取（上传附件写完后调用）
  static ensureFile(filePath: string, cfg: RunAsUserConfig | undefined | null): void {
    if (!filePath || !RunAsUser.isActive(cfg)) return;
    this.ensureDir(path.dirname(filePath), cfg);
    const user = cfg!.user.trim();
    try {
      if (this._has('setfacl')) this._run('setfacl', ['-m', `u:${user}:rw`, filePath]);
      else fs.chmodSync(filePath, 0o644);
    } catch (e) {
      Logger.warn('EngineAccess', 'ensureFile failed', { filePath, user, error: String(e) });
    }
  }

  // 目标目录本身失去缓存资格时（例如刚被重建）可手动清掉
  static forget(dirPath: string): void {
    this._ok.delete(path.resolve(dirPath));
  }

  // 以目标用户身份实测「能进去且能读」，比自己解析权限位靠谱（ACL/属组/挂载选项都算进去了）
  private static _canAccess(dir: string, user: string): boolean {
    try {
      this._run('sudo', ['-n', '-u', user, '--', 'test', '-r', dir, '-a', '-x', dir]);
      return true;
    } catch {
      return false;
    }
  }

  // 路径链每一级补 o+x：只给「穿过去」的权限，不给 r（/root 仍然不可列举）
  private static _openAncestors(dir: string): void {
    const parts: string[] = [];
    let cur = dir;
    while (true) {
      const parent = path.dirname(cur);
      if (parent === cur) break;
      parts.push(parent);
      cur = parent;
    }
    for (const p of parts.reverse()) {
      try {
        const st = fs.statSync(p);
        if ((st.mode & 0o001) === 0) fs.chmodSync(p, st.mode | 0o001);
      } catch (e) {
        Logger.warn('EngineAccess', 'chmod ancestor failed', { path: p, error: String(e) });
      }
    }
  }

  // 给目标目录本身授权：优先 ACL（带 default ACL，新建文件自动继承），否则退回属组方案
  // 给目标目录本身授权。只动「用户自己登记为项目根的这个目录」，绝不递归改属主/属组——
  // 那会波及目录里原有的部署文件、其他服务的属组，对别人的机器副作用太大（开源场景尤其）。
  //   Linux：setfacl 加一条 user ACL + default ACL（之后新建的文件自动继承，这才是「永久」）
  //   macOS：没有 setfacl，用 chmod +a 的继承型 ACE
  // 两者都没有（没装 acl 等）时不做任何破坏性兜底，交给下面的复验去报可执行的提示。
  private static _grant(dir: string, user: string): void {
    if (process.platform === 'darwin') {
      this._run('chmod', ['-R', '+a', `user:${user} allow list,search,add_file,add_subdirectory,delete_child,readattr,writeattr,readextattr,writeextattr,readsecurity,file_inherit,directory_inherit`, dir]);
      return;
    }
    if (this._has('setfacl')) {
      this._run('setfacl', ['-R', '-m', `u:${user}:rwX`, dir]);
      this._run('setfacl', ['-R', '-d', '-m', `u:${user}:rwX`, dir]);
      return;
    }
    Logger.warn('EngineAccess', 'no setfacl; skip grant (install acl to enable auto-fix)', { dir, user });
  }

  private static _has(bin: string): boolean {
    try {
      this._run('sh', ['-c', `command -v ${bin}`]);
      return true;
    } catch {
      return false;
    }
  }

  private static _run(bin: string, args: string[]): void {
    execFileSync(bin, args, { stdio: 'ignore', timeout: 30000, windowsHide: true });
  }
}
