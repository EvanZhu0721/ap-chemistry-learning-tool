# 账号系统 · 接口文档

零依赖（仅用 Node 内置模块）的账号服务。数据保存在**服务器端** `users.json`，浏览器/客户端**仅通过 JSON 接口**读写。

## 启动

```bash
cd account-server
node server.js          # 默认 http://localhost:8787
PORT=9000 node server.js  # 自定义端口
```

启动后打开 `http://localhost:8787/` 即为接口测试台。

## 通用约定

- 请求体：`Content-Type: application/json`
- 响应体：统一 JSON
  - 成功：`{ "ok": true, ... }`
  - 失败：`{ "ok": false, "error": "<错误码>", "message": "<中文提示>" }`
- 需要身份的接口通过请求头携带 token：`Authorization: Bearer <token>`

### 错误码一览

| error | HTTP | 含义 |
|---|---|---|
| `MISSING_FIELD` | 400 | 缺少必填字段（账号名/密码为空） |
| `INVALID_USERNAME` | 400 | 账号名不合法（需 3–20 位字母/数字/下划线/中文） |
| `PASSWORD_TOO_SHORT` | 400 | 密码不足 6 个字符 |
| `USERNAME_TAKEN` | 409 | 账号名已被注册 |
| `BAD_CREDENTIALS` | 401 | 账号或密码错误 |
| `USER_NOT_FOUND` | 404 | 账号不存在 |
| `UNAUTHORIZED` | 401 | 未登录 / token 失效 |
| `METHOD_NOT_ALLOWED` | 405 | 请求方法错误（仅支持 POST） |
| `NOT_FOUND` | 404 | 接口/文件不存在 |

---

## 1. 注册 `POST /api/register`

**请求**
```json
{ "username": "alice", "password": "123456" }
```

**成功 200**
```json
{ "ok": true, "token": "…", "username": "alice", "message": "注册成功" }
```

**失败示例**
```json
// 账号名重复（409）
{ "ok": false, "error": "USERNAME_TAKEN", "message": "该账号名已被注册，请换一个" }
// 密码太短（400）
{ "ok": false, "error": "PASSWORD_TOO_SHORT", "message": "密码至少需要 6 个字符" }
```

---

## 2. 登录 `POST /api/login`

**请求**
```json
{ "username": "alice", "password": "123456" }
```

**成功 200**
```json
{ "ok": true, "token": "…", "username": "alice", "message": "登录成功" }
```

**失败 401**
```json
{ "ok": false, "error": "BAD_CREDENTIALS", "message": "账号或密码错误" }
```

> 安全说明：账号不存在与密码错误返回**同一个** `BAD_CREDENTIALS`，避免暴露「某账号名是否已注册」。

---

## 3. 修改密码 `POST /api/change-password`

**鉴权方式（二选一）**：优先用登录 token；若未带 token 则用原密码校验。

**请求（推荐：带 token）** — 请求头 `Authorization: Bearer <token>`
```json
{ "username": "alice", "newPassword": "abcdef" }
```

**请求（备用：带原密码）**
```json
{ "username": "alice", "oldPassword": "123456", "newPassword": "abcdef" }
```

**成功 200**
```json
{ "ok": true, "message": "密码修改成功" }
```

**失败示例**
```json
{ "ok": false, "error": "BAD_CREDENTIALS", "message": "账号或原密码错误" }   // 401
{ "ok": false, "error": "PASSWORD_TOO_SHORT", "message": "新密码至少需要 6 个字符" } // 400
```

---

## 4. 登出 `POST /api/logout`

请求头带 `Authorization: Bearer <token>`；成功返回 `{ "ok": true, "message": "已登出" }`。

## 5. 当前用户 `GET /api/me`

请求头带 token；成功返回 `{ "ok": true, "username": "alice" }`（用于客户端启动时校验登录态）。

---

## 数据与安全

- **存储**：`users.json`
  ```json
  { "users": { "alice": { "pwd": "<salt>:<hash>", "createdAt": "2026-10-06T…" } } }
  ```
- **密码**：使用 `crypto.scrypt` + 16 字节随机 salt 哈希，**从不存明文**；比较用 `timingSafeEqual`（防时序攻击）。
- **会话**：token 为 24 字节随机串，保存在内存；服务重启后需重新登录（如需持久会话可改为落盘/数据库）。
- **扩展**：`users.json` 可平滑替换为 SQLite / MySQL / Postgres，只需改 `loadDB/saveDB` 两个函数，接口不变。

---

## 生产部署（Ubuntu/Debian + systemd + Node 18+）

> 账号后端是**常驻 Node 进程**，需要一台有 root 权限、能跑常驻进程的服务器（静态托管平台无法运行）。以下材料已备好，见 `deploy/` 目录：

| 文件 | 用途 |
|---|---|
| `deploy/deploy.sh` | 一键部署脚本（复制文件 + 写 systemd 单元 + 启动服务） |
| `deploy/account-server.service` | systemd 服务单元模板（供参考/手动方式） |
| `deploy/Caddyfile.snippet` | Caddy v2 反代片段（与线上站点一致，推荐） |
| `deploy/nginx.conf.snippet` | Nginx 反代片段（备选） |

### 步骤

```bash
# 1) 把 account-server 目录上传到服务器（含 deploy/ 与 server.js）
# 2) 以 root 执行一键部署（需服务器已装 Node 18+）
cd account-server
sudo bash deploy.sh

# 3) 配置反向代理，把 /api/* 转发到 127.0.0.1:8787
#    Caddy：按 deploy/Caddyfile.snippet 在站点块内追加 handle /api/*，然后 caddy reload
#    Nginx：按 deploy/nginx.conf.snippet 在 server{} 内追加 location /api/，然后 nginx -t && systemctl reload nginx

# 4) 验证
curl http://127.0.0.1:8787/api/me
# 未登录应返回 {"ok":false,"error":"UNAUTHORIZED",...}
```

### 前端如何指向后端

前端 `AP化学学习工具.html` 中账号逻辑（约 L17816）默认：
- **本地开发**：指向 `http://localhost:8787`；
- **线上同源**：使用相对路径 `/api`（由 Caddy/Nginx 反代到后端）。

因此线上部署后**无需改前端**，只要反向代理把 `/api/*` 转发到 8787 即可。如需自定义后端地址，可在页面加载前设置 `window.ACCT_API`。

### 注意

- `users.json` 与 `server.js` 同目录，部署时首次才创建，**升级时不要覆盖**（否则丢用户数据）。
- 服务重启后内存中的登录 token 会失效，用户需重新登录（会话为内存态，非落盘）。
- `server.js` 监听所有接口；请确保反向代理**只暴露 `/api/*`**，不要直接把 8787 端口对公网开放。
