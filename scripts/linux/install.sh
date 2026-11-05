#!/usr/bin/env bash
# Release placeholders are replaced by CI after hashing the complete COS packages.
set -euo pipefail
umask 077
[ "$(uname -s)" = Linux ] || { echo 'Linux only / 仅支持 Linux'; exit 1; }
case "$(uname -m)" in
  x86_64|amd64) url='@@X64_URL@@'; sha='@@X64_SHA@@' ;;
  aarch64|arm64) url='@@ARM64_URL@@'; sha='@@ARM64_SHA@@' ;;
  *) echo '支持 x64 / ARM64；Unsupported architecture'; exit 1 ;;
esac
for tool in curl tar sha256sum mktemp flock; do command -v "$tool" >/dev/null || { echo "Missing command / 缺少命令: $tool"; exit 1; }; done
version='@@VERSION@@'
release='@@RELEASE@@'
if [ "$(id -u)" -eq 0 ]; then default_home=/opt/clootee; default_bin=/usr/local/bin; else default_home="${XDG_DATA_HOME:-$HOME/.local/share}/clootee"; default_bin="$HOME/.local/bin"; fi
install_home="${CLOOTEE_HOME:-$default_home}"
bin_dir="${CLOOTEE_BIN_DIR:-$default_bin}"
case "$install_home:$bin_dir" in /*:/*) ;; *) echo 'Install paths must be absolute / 安装路径必须是绝对路径'; exit 1;; esac
mkdir -p "$install_home" "$bin_dir"
install_home="$(cd "$install_home" && pwd -P)"
if [ -e "$install_home/current" ] && [ ! -f "$install_home/.clootee-install" ]; then echo 'Existing unmanaged directory / 目录不是由安装器创建'; exit 1; fi
if [ -e "$bin_dir/clootee" ] && ! grep -Fq "# Clootee managed launcher: $install_home" "$bin_dir/clootee"; then echo "Refusing to overwrite / 不覆盖已有命令: $bin_dir/clootee"; exit 1; fi
exec 9>"$install_home/install.lock"
flock -n 9 || { echo 'Another installation is running / 另一个安装正在进行'; exit 1; }
tmp="$(mktemp -d "$install_home/.install.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT
printf '下载 / Downloading Clootee %s…\n' "$version"
curl --fail --show-error --location --proto '=https' --tlsv1.2 --retry 2 --connect-timeout 20 --max-time 600 "$url" -o "$tmp/package.tar.gz"
printf '%s  %s\n' "$sha" "$tmp/package.tar.gz" | sha256sum -c -
mkdir "$tmp/app"
tar -xzf "$tmp/package.tar.gz" --no-same-owner -C "$tmp/app"
"$tmp/app/runtime/bin/node" --version
[ -f "$tmp/app/projects/claude_hub/backend/dist/index.js" ] || { echo 'Incomplete package'; exit 1; }
mkdir -p "$install_home/releases" "$install_home/data" "$install_home/out_end" "$install_home/logs"
ln -s "$install_home/data" "$tmp/app/projects/claude_hub/data"
ln -s "$install_home/out_end" "$tmp/app/projects/claude_hub/out_end"
old="$(readlink "$install_home/current" 2>/dev/null || true)"
was_running=0
if [ -n "$old" ]; then
  CLOOTEE_HOME="$install_home" "$install_home/current/runtime/bin/node" "$install_home/current/scripts/linux/control.cjs" status >/dev/null && was_running=1
  CLOOTEE_HOME="$install_home" "$install_home/current/runtime/bin/node" "$install_home/current/scripts/linux/control.cjs" stop
fi
# A release path is immutable; reinstalling uses a fresh directory.
target="$install_home/releases/$release-$(date +%s)-$$"
mv "$tmp/app" "$target"
ln -s "$target" "$tmp/current"
mv -Tf "$tmp/current" "$install_home/current"
touch "$install_home/.clootee-install"
{
  printf '#!/usr/bin/env bash\n# Clootee managed launcher: %s\n' "$install_home"
  printf 'export CLOOTEE_HOME=%q\n' "$install_home"
  printf 'exec "$CLOOTEE_HOME/current/runtime/bin/node" "$CLOOTEE_HOME/current/scripts/linux/control.cjs" "$@"\n'
} > "$tmp/clootee"
chmod 755 "$tmp/clootee"
mv -f "$tmp/clootee" "$bin_dir/clootee"
if ! "$bin_dir/clootee" start; then
  if [ -n "$old" ]; then
    ln -s "$old" "$tmp/rollback"; mv -Tf "$tmp/rollback" "$install_home/current"
    [ "$was_running" -eq 0 ] || "$bin_dir/clootee" start || true
    echo '已恢复上一版 / Restored previous version.'
  fi
  exit 1
fi
printf '\n安装完成 / Installed: %s\n启动 start | 关闭 stop | 重启 restart | 状态 status | 日志 logs\n' "$bin_dir/clootee"
case ":$PATH:" in *":$bin_dir:"*) printf 'clootee status\n';; *) printf '命令 / Command: %s status\n（该目录不在 PATH，可使用上面的完整路径 / use the full path above）\n' "$bin_dir/clootee";; esac
printf '服务器远程访问 / SSH tunnel: ssh -L 8970:127.0.0.1:8970 user@server\n浏览器 / Browser: http://127.0.0.1:8970\n'
