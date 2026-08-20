// 命令行访问密码管理（救急用，入口层，不写业务逻辑，只转发给 AuthManager）。
// 场景：忘记密码 / 被锁在 Web 界面外，通过本机命令行直接改密码或解除锁定。
//
// 用法（推荐在仓库根目录，Windows 用 passwd.bat / Linux·macOS 用 ./passwd.sh）：
//   passwd.bat set <新密码>    # 设定/修改访问密码（无需旧密码，直接覆盖）
//   passwd.bat clear           # 解除密码锁定（删除密码，恢复到未设定状态）
//   passwd.bat status          # 查看当前是否已设密码
// 也可以在 backend 目录下直接调：
//   npm run passwd -- set <新密码>
//   node dist/cli/authctl.js clear
import { AuthManager } from '../logic_realize/AuthManager';

function main(): void {
  const [cmd, arg] = process.argv.slice(2);
  switch (cmd) {
    case 'set': {
      AuthManager.cliSetPassword(arg);
      console.log('✅ 访问密码已更新。旧的登录 token 立即失效，请用新密码重新登录。');
      return;
    }
    case 'clear': {
      const removed = AuthManager.clear();
      console.log(
        removed
          ? '✅ 已解除密码锁定：密码已删除，现在无需密码即可访问，界面将重新引导你设定新密码。'
          : 'ℹ️ 当前本就未设定密码，无需解除。',
      );
      return;
    }
    case 'status': {
      console.log(AuthManager.needsSetup() ? '未设定密码（needsSetup=true）' : '已设定密码');
      return;
    }
    default:
      console.error(
        [
          '用法（在仓库根目录执行；Linux / macOS 把 passwd.bat 换成 ./passwd.sh）：',
          '  passwd.bat set <新密码>   设定/修改访问密码（无需旧密码，至少 4 位）',
          '  passwd.bat clear          解除密码锁定（删除密码，回到首次引导）',
          '  passwd.bat status         查看是否已设密码',
        ].join('\n'),
      );
      process.exit(1);
  }
}

main();
