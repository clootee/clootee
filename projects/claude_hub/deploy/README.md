# 部署：learn.xfeixie.com —— 小白教程（口令保护）

纯静态站点。`root` 直接指向 git 检出目录里的 `frontend/`，所以**以后更新只要 `git pull`**，
不用拷文件，也不用重启任何进程。

同一个 vhost 顺带把小助手组件挂在 `/assist/` 下并**免口令、放行跨域**，
所以组件地址是 `https://learn.xfeixie.com/assist/assistant.js`。

## 首次部署（personal1 106.13.193.3，root）

```bash
# 1. 检出仓库（该机直连 github 不通，走本机 xray 代理）
mkdir -p /www/wwwroot && cd /www/wwwroot
git clone https://github.com/lingxiao10/clootee.git
cd clootee && git config http.proxy http://127.0.0.1:10809

# 2. 访问口令（⚠️ 本仓库是公开的，口令与其哈希都不入库，只在服务器上生成）
mkdir -p /www/wwwroot/learn.xfeixie.com_auth
htpasswd -bc /www/wwwroot/learn.xfeixie.com_auth/.htpasswd <用户名> '<你的口令>'
chmod 640 /www/wwwroot/learn.xfeixie.com_auth/.htpasswd
chown root:www /www/wwwroot/learn.xfeixie.com_auth/.htpasswd
# 没有 htpasswd 命令就： yum install -y httpd-tools  （或 apt install apache2-utils）

# 3. 证书（acme.sh webroot 签发，目录放站点外，git pull 不受影响）
mkdir -p /www/wwwroot/learn.xfeixie.com_acme
~/.acme.sh/acme.sh --issue -d learn.xfeixie.com -w /www/wwwroot/learn.xfeixie.com_acme
~/.acme.sh/acme.sh --install-cert -d learn.xfeixie.com \
  --key-file       /www/server/panel/vhost/cert/learn.xfeixie.com/privkey.pem \
  --fullchain-file /www/server/panel/vhost/cert/learn.xfeixie.com/fullchain.pem \
  --reloadcmd      'nginx -s reload'

# 4. nginx
cp /www/wwwroot/clootee/projects/claude_hub/deploy/learn.xfeixie.com.conf \
   /www/server/panel/vhost/nginx/
nginx -t && nginx -s reload
```

## 以后更新

```bash
cd /www/wwwroot/clootee && git pull
```

静态文件，5 分钟缓存内生效，不重启任何东西。

## 验收

```bash
# 不带口令应当 401
curl -o /dev/null -w '%{http_code}\n' https://learn.xfeixie.com/
# 带口令应当 200
curl -o /dev/null -w '%{http_code}\n' -u '<用户名>:<你的口令>' https://learn.xfeixie.com/
# 组件免口令，且放行跨域
curl -I https://learn.xfeixie.com/assist/assistant.js | grep -i 'HTTP/\|access-control'
```

浏览器打开 `https://learn.xfeixie.com/`：弹口令框 → 输入后进入教程首页 →
左侧 9 章、右侧小助手都在，就算通。

## 说明

- `index.html` 是 Clootee 应用界面，这台服务器上没有它的后端，
  打开只会是坏的，所以 vhost 里把它 302 回教程首页。
- 学员的做题进度存在各自浏览器的 localStorage，**服务器不存任何用户数据**。
- 小助手由浏览器直连 MiniMax，学员各用各的 Key，服务器不经手。
