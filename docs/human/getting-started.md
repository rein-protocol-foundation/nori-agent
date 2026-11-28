# 🚀 Build and verify / 本地构建与验证

### 1. Prepare / 准备

With Git and npm installed, clone the repository with its pinned runtime and install the local toolchain. / 准备好 Git 和 npm 后，连同固定版本的运行时一起克隆仓库，再安装本地工具链。

```sh
git clone --recurse-submodules https://github.com/rein-protocol-foundation/nori-agent.git
cd nori-agent
npm install --prefix .toolchain --no-save --package-lock=false node@24.16.0 pnpm@12.4.2
```

### 2. Build / 构建

```sh
npm run toolchain:pnpm -- install
npm run toolchain:pnpm -- --dir vendor/openclaw install --frozen-lockfile
npm run toolchain:pnpm -- --dir vendor/openclaw build
npm run toolchain:pnpm -- run setup:local
```

### 3. Check the change / 验证改动

| Change / 改动 | Run / 命令 |
| --- | --- |
| 📝 Documentation / 文档 | `node scripts/check.mjs` |
| 🧩 Plugin / 插件 | `npm run toolchain:pnpm -- test` and / 以及 `npm run toolchain:pnpm -- run verify:plugin` |

Local setup binds the gateway to loopback. To configure a provider, backend or channel, follow the matching section of the full setup reference. / 本地网关监听回环地址。连接模型、后端或频道时，按完整配置手册的相应章节操作。[English](../agent/reference/setup.md) · [中文](../agent/reference/setup-zh.md)

### 4. ▶ Start the gateway / 启动网关

```sh
npm run toolchain:pnpm -- openclaw gateway run
```

In a second terminal at the repository root, check readiness. / 在第二个终端回到仓库根目录检查就绪状态。

```sh
npm run toolchain:pnpm -- openclaw gateway health --port 18791
npm run toolchain:pnpm -- run smoke:gateway
```
