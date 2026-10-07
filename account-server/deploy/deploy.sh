#!/usr/bin/env bash
# ============================================================
# account-server 一键部署脚本（Ubuntu/Debian + systemd + Node 18+）
# 用法：在目标服务器上执行（需 root）：
#   sudo bash deploy.sh
# 说明：脚本会安装 systemd 服务 + 复制后端文件 + 启动；
#       反向代理需按 deploy/Caddyfile.snippet 或 nginx.conf.snippet 手动配置。
# ============================================================
set -euo pipefail

# ============ 可配置项 ============
APP_NAME="account-server"
APP_USER="apchem"                          # 运行用户（建议专用非 root 用户）
DEPLOY_DIR="/srv/apchemistry/account-server"
PORT="${PORT:-8787}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$(dirname "$SCRIPT_DIR")"          # account-server 根目录（含 server.js）

echo "==> 检查权限（需 root）"
[ "$(id -u)" -eq 0 ] || { echo "[错误] 请用 root 执行：sudo bash deploy.sh"; exit 1; }

echo "==> 检查 Node 运行时"
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "[错误] 未找到 node，请先安装 Node.js 18+："
  echo "  Ubuntu/Debian: curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs"
  echo "  或 nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"
  exit 1
fi
echo "    node: $NODE_BIN ($($NODE_BIN -v))"

echo "==> 创建部署目录: $DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"

echo "==> 复制后端文件"
cp -f "$SRC_DIR/server.js" "$DEPLOY_DIR/server.js"
[ -f "$SRC_DIR/index.html" ] && cp -f "$SRC_DIR/index.html" "$DEPLOY_DIR/index.html"
# users.json：首次部署才创建，避免覆盖线上已有用户数据
if [ ! -f "$DEPLOY_DIR/users.json" ]; then
  if [ -f "$SRC_DIR/users.json" ]; then cp -f "$SRC_DIR/users.json" "$DEPLOY_DIR/users.json"
  else echo '{"users":{}}' > "$DEPLOY_DIR/users.json"; fi
fi
id "$APP_USER" >/dev/null 2>&1 || { echo "[提示] 用户 $APP_USER 不存在，脚本会继续但服务可能无法启动；请先 useradd -r $APP_USER"; }
chown -R "$APP_USER":"$APP_USER" "$DEPLOY_DIR" 2>/dev/null || true
chmod 755 "$DEPLOY_DIR/server.js"

echo "==> 写入 systemd 单元: /etc/systemd/system/${APP_NAME}.service"
cat > "/etc/systemd/system/${APP_NAME}.service" <<EOF
[Unit]
Description=AP Chemistry Account Server
After=network.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${DEPLOY_DIR}
ExecStart=${NODE_BIN} server.js
Environment=PORT=${PORT}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

echo "==> 启动服务"
systemctl daemon-reload
systemctl enable "$APP_NAME" >/dev/null 2>&1 || true
systemctl restart "$APP_NAME"
sleep 1
systemctl --no-pager status "$APP_NAME" 2>&1 | head -6 || true

echo ""
echo "==> 完成。后端已运行在 127.0.0.1:${PORT}"
echo "    接下来配置反向代理（二选一）："
echo "    - Caddy: 见 deploy/Caddyfile.snippet，插入站点块后执行 caddy reload"
echo "    - Nginx: 见 deploy/nginx.conf.snippet，插入 server{} 后 nginx -t && systemctl reload nginx"
echo "    验证接口: curl http://127.0.0.1:${PORT}/api/me"
echo "              # 未登录应返回 {\"ok\":false,\"error\":\"UNAUTHORIZED\",...}"
