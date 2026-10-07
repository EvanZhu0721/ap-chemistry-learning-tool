# AP Chemistry 学习工具 · 网站版

从单文件 HTML 重构而来的**标准静态站点**，可直接部署到任意静态托管平台。

---

## 一、目录结构

```
ap-chem-site/
├── index.html              # 页面结构（145 KB，含无脚本兜底样式）
├── assets/
│   ├── style.css           # 全部样式（93 KB，含深色主题）
│   └── app.js              # 全部应用逻辑 + 题库数据（2.0 MB）
├── icon.png                # 图标源文件（唯一图标源，1254×1254）
├── favicon.ico             # 浏览器标签页图标（16/32/48，旧浏览器回退）
├── favicon-32.png          # 标签页图标（32px）
├── icon-180.png            # iOS「添加到主屏幕」图标
├── icon-192.png            # PWA 图标
├── icon-512.png            # PWA 图标（含 maskable）
├── manifest.webmanifest    # PWA 清单
└── README.md               # 本文件
```

- **零构建、零依赖**：纯静态文件，不需要 npm / webpack / 任何编译步骤。
- **唯一的外部请求**是 Chart.js（从 jsDelivr CDN 异步加载，用于 PES 能谱图）。**加载失败会自动降级**为内置 Canvas 条形图，不影响其它功能。

---

## 二、本地预览

### 方式 1：直接双击（最简单）
直接双击 `index.html` 即可。外链的 CSS / JS 在 `file://` 下能正常加载。

> 建议用 Chrome / Edge / Safari 打开。用「文件」App 预览、微信文件预览、金山文档这类**阅读器**打开会禁用 JavaScript，只能阅读不能交互（页面会提示）。

### 方式 2：起一个本地服务器（推荐，最接近线上环境）
```bash
cd ap-chem-site
python -m http.server 8000
```
然后访问 <http://localhost:8000>

---

## 三、部署到线上（任选其一）

所有平台都是**把 `ap-chem-site` 整个文件夹上传/关联**即可，无需任何配置。

| 平台 | 操作 | 免费额度 |
|---|---|---|
| **Vercel** | 拖拽文件夹到 vercel.com/new，或 `npx vercel deploy` | 个人使用免费 |
| **Netlify** | 拖拽文件夹到 app.netlify.com/drop | 免费 |
| **Cloudflare Pages** | 连接仓库或直接上传，构建命令留空 | 免费 |
| **GitHub Pages** | 推到仓库 → Settings → Pages → 选择分支根目录 | 免费 |
| **腾讯云 EdgeOne Pages** | 国内访问速度好，控制台直接上传 | 有免费额度 |
| **阿里云 OSS / 腾讯云 COS** | 上传后开启静态网站托管 | 按量计费 |

### 部署后自检清单
- [ ] 打开首页能看到 4 张模块卡片
- [ ] 点「学习」能进入 9 个单元的课程地图
- [ ] 商城题库能选题、做题、自动判分
- [ ] 顶部「查缺补漏」「大纲」弹窗能打开
- [ ] 手机端能正常点击（触控目标 ≥40px）
- [ ] 深色模式切换正常

---

## 四、关于 PWA（可加到手机桌面）

站点已内置 `manifest.webmanifest` 和图标，**在 HTTPS 环境下**：

- **iPhone Safari**：分享 → 添加到主屏幕 → 会以独立 App 形式打开，无浏览器地址栏
- **Android Chrome**：菜单 → 安装应用 / 添加到主屏幕

> 注意：manifest 只在 `https://` 或 `localhost` 下生效，`file://` 或 http 裸域名不生效。
> 当前**未包含 Service Worker**，所以首次打开需要联网（Chart.js 也走 CDN）。

### 想加离线能力？
在 `index.html` 的 `</body>` 前加：
```html
<script>
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
</script>
```
再新建 `sw.js` 用 Workbox 或手写 Cache Storage 缓存 `index.html`、`assets/*`、各图标文件即可。
需要的话告诉我，我来补。

---

## 五、怎么更新内容

改完 `index.html` / `assets/style.css` / `assets/app.js` 后，**重新上传覆盖**即可。

> 部署平台的 CDN 一般会缓存静态资源。如果更新后页面没变，在文件名后加版本号（例如 `assets/app.js?v=2`）即可强制刷新。

---

## 六、和「单文件版」的关系

| | 单文件版 `AP化学学习工具.html` | 网站版 `ap-chem-site/` |
|---|---|---|
| 形态 | 1 个文件，约 1.04 MB | 多文件，便于缓存与维护 |
| 分发 | 微信/邮件直接发文件 | 发一个网址 |
| 无 JS 阅读器 | ✅ 已做兜底，可展开阅读 | ✅ 同样兜底 |
| 适合 | 离线发送给学生 | 在线访问、持续更新 |

两边内容**完全一致**，可同时保留。
