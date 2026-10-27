# Nori 管理首页与原生控制台

首页 `/apps` 只有 OpenClaw 与 Magpie 两个主卡片。OpenClaw 卡片列出部署配置中的所有实例，
默认示例为 Slack 和 Discord；每个入口打开对应实例的原生 Control UI。`/dashboard?instance=discord`
解析为配置中的原生 basePath，未知实例回到第一个实例。Magpie 卡片进入 `/?view=rein-router`，
Provider 管理继续使用原生 Magpie 页。

## 会话范围

一个 OpenClaw 实例可以同时启用 Slack、Discord 和网页对话；它的 Dashboard 显示该实例的会话。
如果部署采用独立状态目录，两个实例的会话也分别保存。首页只负责导航，不聚合、复制或重新归属会话。
本机原有历史不会自动同步到云端；迁移历史需要单独确认源实例、状态目录、目标和隐私边界。

独立入口使用原生链接而非 iframe，保留 OpenClaw 的 `X-Frame-Options: DENY` 和
`frame-ancestors 'none'`。从原生页面返回首页可使用浏览器返回，或打开 `/apps`。
只有一个实例的部署可在配置中只保留一项；可按实际角色修改 label，不要求每个渠道单独运行实例。

## 部署边界

这是可选的管理入口，不会自动开放公网、修改 DNS、启用聊天渠道或部署真实账号。
受信任的同机 Caddy 终止 HTTPS、覆盖客户端地址头，再将请求交给仅监听回环地址的 Node 服务。
不能直接暴露 Node、OpenClaw、Magpie 或 Console 端口。主机上的本地用户属于受信任边界。
入口使用一个共享管理身份，适合单一受信任管理者；不提供多租户授权。

- `scripts/dashboard-server.mjs`：密钥登录、30 天持久会话、实例导航、HTTP / WebSocket 代理。
- `scripts/dashboard-pages.mjs` 与 `web/dashboard/`：Rein 首页。
- `scripts/dashboard-router.mjs`：Console 启动时通过 `onReady` 回调保存内部凭据，不打印到日志。
- `scripts/router-console.mjs` 与 `plugins/rein-router/console/`：Magpie 原生页面扩展及启动加载状态。

私有配置、登录密钥、内部 Console token 和 session 哈希文件只保存在 Git 忽略的 `runtime/`，
不要提交到仓库。仓库示例不含真实域名配置、凭据、账号或会话。

## 初始配置

先按 [setup](setup.md) 准备项目 Node、pnpm、OpenClaw 和锁定 Magpie。
以下命令只生成本机私有配置；先修改示例中的 hostname 和实例列表，再安排授权部署。
新部署才生成密钥；已有部署沿用原 keyHash 和 sessions.json，升级不要求重新登录。

```sh
umask 077
mkdir -p runtime/dashboard
cp config/dashboard.example.json runtime/dashboard/config.json
# 编辑 runtime/dashboard/config.json 中的 hostname、instances 和端口。
npm run toolchain:pnpm -- exec node --input-type=module <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
const path = 'runtime/dashboard/config.json';
const config = JSON.parse(readFileSync(path, 'utf8'));
if (config.keyHash !== 'REPLACE_WITH_SHA256_OF_A_RANDOM_32_BYTE_HEX_KEY') throw Error('Existing key hash; refusing rotation');
const key = randomBytes(32).toString('hex');
writeFileSync('runtime/dashboard/login-key.txt', key + '\n', { flag: 'wx', mode: 0o600 });
config.keyHash = createHash('sha256').update(key).digest('hex');
writeFileSync(path, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
JS
```

管理者通过本地安全文件读取 `login-key.txt`；不要放入 URL、日志或共享文档。
代理只保存密钥哈希；Cookie 使用独立随机值，服务端持久化其哈希。
Cookie 为 Secure、HttpOnly、SameSite=Lax、host-only，30 天到期；退出立即撤销并关闭关联 WebSocket。
登录错误按来源 IP 限速，修改请求检查本站 Origin。

为每个 OpenClaw 实例配置其原生 `gateway.controlUi.basePath`，与实例列表严格一致。
使用原生 `trusted-proxy` 认证，信任同机代理，`userHeader` 为 `x-nori-user`，
requiredHeaders 包含 `x-forwarded-proto` 与 `x-forwarded-host`，allowUsers 只允许配置中的 user，
`allowedOrigins` 包含你的 HTTPS 域名。配置本机 trustedProxies、allowLoopback 和对应 identityScopes。
浏览器设备注册仍由上游处理；不要通过关闭设备验证来解决连接问题。具体字段随锁定 OpenClaw 版本核验。

在两个独立终端（或各自的服务管理器中）启动：

```sh
npm run toolchain:pnpm -- run dashboard:router -- runtime/dashboard/config.json
npm run toolchain:pnpm -- run dashboard:serve -- runtime/dashboard/config.json
```

Router launcher 使用现有 `runtime/magpie` 与主 OpenClaw 配置；不要同时启动另一 Console 操作同一私有目录。
`routerPort` 必须与代理一致。`router-session.json` 与 config.json 同目录，文件权限 0600；
内部凭据仅由代理使用，浏览器收不到上游 Set-Cookie。启动回调不会修改原有 CLI 的启动/打开浏览器行为。

以 `config/dashboard.Caddyfile.example` 为模板配置 Caddy。`encode zstd gzip` 压缩原生大脚本；
不要删除用于覆盖客户端 IP 和转发协议的 header_up 规则。DNS、TLS 和防火墙属于部署配置，按环境授权执行。

旧的 `runtime/oci-public/gate.mjs` 部署可以将服务 ExecStart 改为
`node scripts/dashboard-server.mjs runtime/oci-public/gate-config.json`；router 服务改为
`node scripts/dashboard-router.mjs runtime/oci-public/gate-config.json`。保留同目录下的 sessions.json，
原浏览器登录继续有效。先备份旧启动脚本和服务配置；不必改动 OpenClaw 聊天服务。

## Magpie 首屏与更新兼容性

Magpie 的原生 HTML 默认展示 Agents，直到末尾的 start.js 选中目标页面。
Rein 在响应阶段插入即时加载界面，预加载原生脚本以避免串行网络请求，但保留脚本的原始执行顺序。
原生 start.js 完成且 Router 首次状态请求成功或显示自身错误后才移除加载层。
12 秒仍未准备好时显示重试链接；不把空白页面当成加载成功，也不绕过原生插件启动生命周期。

Rein 不 fork 或改写 Magpie 的 app.js，也不修改 `vendor/openclaw`。兼容性依赖明确限定为：

- OpenClaw：原生 basePath、HTTP / WebSocket、trusted-proxy 身份头与设备注册。
- Magpie：kernel.js 页面 slot、app.js / start.js 的加载顺序、Providers / Routing 导航挂载点，
  以及原生 API 和已有 ctx.ui 接口。

挂载点缺失或顺序变更时返回 `router_magpie_ui_incompatible`，不能静默返回错误页面。
升级 Magpie 时遵循 [升级指南](magpie-upgrade-zh.md)，在升级 PR 验证以下检查，不能只改版本锁：

```sh
npm run toolchain:pnpm -- run check
npm run toolchain:pnpm -- test
npm run toolchain:pnpm -- run verify:router-console
```

自动回归覆盖实例导航、鉴权、CSRF、身份头防伪、Cookie 持久化、WebSocket 撤销、原生防嵌入头透传，
以及慢速脚本、状态加载、超时恢复和挂载点变更。原生 Console 检查使用临时模拟 Provider，
人为阻塞 app.js 下载，确认第一屏是加载提示且 Agents 不可见，再继续验证 Provider 与 Router 操作。

OpenClaw 升级后另行在受控浏览器核验每个部署实例：登录、原生 UI 资源路径、设备注册、WebSocket Connected
和已知会话。不能把两个实例都能打开等同于会话已迁移；也不能通过去掉上游安全头让回归通过。

回滚时恢复配套的 Rein 脚本、页面和服务配置并重启管理入口；保留私有配置及 sessions.json。
涉及上游二进制或私有存储迁移时，按各自升级指南恢复匹配的备份。
