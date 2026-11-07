'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const quote = value => '"' + String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%') + '"';
function configuration(home, port = 8970) {
  if (/[\r\n\0]/.test(home)) throw Error('Invalid installation path');
  if (!Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65533) throw Error('Invalid PORT');
  const managed = fs.existsSync(path.join(home, 'current/runtime/bin/node'));
  const node = managed ? path.join(home, 'current/runtime/bin/node') : process.execPath;
  const controller = path.join(home, managed ? 'current/scripts/linux/control.cjs' : 'scripts/linux/control.cjs');
  const name = 'clootee-' + createHash('sha256').update(home).digest('hex').slice(0, 12) + '.service';
  const unit = `[Unit]\nDescription=Clootee workspace and recovery launcher\nAfter=network.target\n\n[Service]\nType=forking\nEnvironment=${quote('CLOOTEE_HOME=' + home)} ${quote('PORT=' + port)} ${quote('PATH=' + process.env.PATH)}\nWorkingDirectory=${home.replaceAll('%', '%%')}\nExecStart=${quote(node)} ${quote(controller)} start\nExecStop=${quote(node)} ${quote(controller)} stop\nPIDFile=${path.join(home, 'run/server.pid').replaceAll('%', '%%')}\nRestart=on-failure\nRestartSec=3\nTimeoutStartSec=90\nTimeoutStopSec=30\nKillMode=control-group\n\n[Install]\nWantedBy=${process.getuid() === 0 ? 'multi-user' : 'default'}.target\n`;
  return { name, unit };
}
function autostart(home, action = 'enable', port = 8970) {
  const { name, unit } = configuration(home, port);
  const user = process.getuid() !== 0;
  const env = { ...process.env };
  if (user) {
    env.XDG_RUNTIME_DIR ||= '/run/user/' + process.getuid();
    env.DBUS_SESSION_BUS_ADDRESS ||= 'unix:path=' + env.XDG_RUNTIME_DIR + '/bus';
  }
  const systemctl = args => execFileSync('systemctl', [...(user ? ['--user'] : []), ...args], { env, encoding: 'utf8', timeout: 15000 });
  if (action === 'status') return systemctl(['is-enabled', name]);
  if (action === 'disable') { systemctl(['disable', name]); return 'Automatic startup disabled: ' + name; }
  if (action !== 'enable') throw Error('Usage: clootee autostart {enable|disable|status}');
  // Linger starts the user manager at boot, before any SSH/desktop login.
  if (user) execFileSync('loginctl', ['enable-linger', os.userInfo().username], { env, timeout: 15000 });
  const dir = user ? path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'systemd/user') : '/etc/systemd/system';
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, unit, { mode: 0o644 });
  systemctl(['daemon-reload']); systemctl(['enable', name]);
  if (systemctl(['is-enabled', name]).trim() !== 'enabled') throw Error('Automatic startup verification failed');
  return 'Automatic startup enabled: ' + name;
}
module.exports = { autostart, configuration };
