# Browser sessions / 浏览器会话

Install the pinned browser and verify the local binary before enrolling a login. / 先安装固定版本的浏览器并核对本地程序，再录入登录信息。

### ▶ Run / 操作

```sh
npm run toolchain:pnpm -- run browser:setup
npm run toolchain:pnpm -- run browser:setup --check
```

### 🔎 Check / 核对

Keep credentials in the local vault. Reuse a named session and close it when finished. / 凭据保存在本地凭据库中。复用指定会话，用完即关闭。

📋 [Full procedure and configuration / 完整操作与配置](../agent/runbooks/agent-browser.md) · [Human handbook / 阅读导航](README.md)
