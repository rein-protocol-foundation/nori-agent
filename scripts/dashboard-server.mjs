import { createServer, request as httpRequest } from "node:http";
import { isIP } from "node:net";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { homePage, dashboardCss } from "./dashboard-pages.mjs";

export function validateDashboardConfig(config) {
  if (
    !config ||
    !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(config.hostname ?? "") ||
    !/^[a-f0-9]{64}$/.test(config.keyHash ?? "")
  )
    throw Error("dashboard_config_invalid");
  const instances = config.instances ?? [
    { id: "slack", label: "Slack", basePath: "/slack", port: 18791 },
    { id: "discord", label: "Discord", basePath: "/discord", port: 18793 },
  ];
  if (!Array.isArray(instances) || !instances.length || instances.length > 10)
    throw Error("dashboard_instances_invalid");
  const seen = new Set(),
    paths = new Set();
  for (const i of instances) {
    if (
      !i ||
      typeof i !== "object" ||
      !/^[a-z][a-z0-9-]*$/.test(i.id ?? "") ||
      typeof i.label !== "string" ||
      !i.label.trim() ||
      i.label.length > 80 ||
      !/^\/[a-z][a-z0-9-]*$/.test(i.basePath ?? "") ||
      ["apps", "dashboard", "login", "logout"].includes(i.basePath.slice(1)) ||
      seen.has(i.id) ||
      paths.has(i.basePath) ||
      !Number.isInteger(i.port) ||
      i.port < 1 ||
      i.port > 65535
    )
      throw Error("dashboard_instances_invalid");
    seen.add(i.id);
    paths.add(i.basePath);
  }
  const routerPort = config.routerPort ?? 3431;
  if (
    !Number.isInteger(routerPort) ||
    routerPort < 1 ||
    routerPort > 65535 ||
    !Number.isInteger(config.port ?? 3440) ||
    (config.port ?? 3440) < 0 ||
    (config.port ?? 3440) > 65535 ||
    typeof (config.user ?? "nori-owner") !== "string" ||
    !(config.user ?? "nori-owner").trim() ||
    /[\r\n]/.test(config.user ?? "nori-owner")
  )
    throw Error("dashboard_config_invalid");
  return { ...config, instances, routerPort };
}

export function createDashboardServer({ config: input, stateDirectory }) {
  const config = validateDashboardConfig(input);
  const dir = pathToFileURL(resolve(stateDirectory) + "/");
  const origin = `https://${config.hostname}`,
    cookieName = "__Host-nori-session",
    ttl = 30 * 24 * 60 * 60;
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  const sessionPath = new URL("sessions.json", dir);
  let sessions;
  try {
    sessions = JSON.parse(readFileSync(sessionPath));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    sessions = {};
  }
  if (!sessions || typeof sessions !== "object" || Array.isArray(sessions))
    throw Error("Invalid session store");
  const failures = new Map(),
    sockets = new Map();
  const persist = () => {
    const tmp = new URL("sessions.tmp", dir);
    writeFileSync(tmp, JSON.stringify(sessions), { mode: 0o600 });
    renameSync(tmp, sessionPath);
  };
  const clean = () => {
    for (const [id, s] of Object.entries(sessions))
      if (s.expires <= Date.now()) {
        delete sessions[id];
        for (const socket of sockets.get(id) ?? []) socket.destroy();
        sockets.delete(id);
      }
    for (const [ip, v] of failures) if (v.until < Date.now()) failures.delete(ip);
  };
  clean();
  persist();
  const timer = setInterval(() => {
    clean();
    persist();
  }, 30000);
  timer.unref();
  const escape = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const safeNext = (value) =>
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !/[\\\r\n]/.test(value) &&
    !value.startsWith("/login")
      ? value
      : "/apps";
  const cookie = (value, age = ttl) =>
    `${cookieName}=${value}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`;
  function session(req) {
    const values = (req.headers.cookie ?? "")
      .split(";")
      .map((x) => x.trim())
      .filter((x) => x.startsWith(cookieName + "="));
    if (values.length !== 1) return null;
    const value = values[0].slice(cookieName.length + 1);
    if (!/^[a-f0-9]{64}$/.test(value)) return null;
    const id = hash(value);
    return sessions[id]?.expires > Date.now() ? id : null;
  }
  function source(req) {
    const ip = req.headers["x-nori-client-ip"];
    return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress) &&
      req.headers.host === config.hostname &&
      typeof ip === "string" &&
      isIP(ip) &&
      !ip.startsWith("127.") &&
      ip !== "::1"
      ? ip
      : null;
  }
  function headers(res) {
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
  }
  function reply(res, status, text) {
    headers(res);
    res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(text);
  }
  function redirect(res, path) {
    headers(res);
    res.writeHead(303, { Location: path });
    res.end();
  }
  function page(res, title, body, status = 200) {
    headers(res);
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    );
    res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Nori</title><style>body{font:16px/1.6 system-ui,sans-serif;background:#f4f3ed;color:#18312b;margin:0}main{max-width:460px;margin:12vh auto;padding:36px;background:#fff;border:1px solid #dce4df;border-radius:16px}h1{font-size:30px;margin:0 0 12px}p{color:#52665e}label{display:block;margin:24px 0 8px}input{box-sizing:border-box;width:100%;padding:14px;border:1px solid #9caf9f;border-radius:8px;font:inherit}button,.link{display:block;box-sizing:border-box;width:100%;padding:12px 16px;margin-top:16px;background:#245a44;color:#fff;border:0;border-radius:8px;text-decoration:none;font:inherit;cursor:pointer}small{display:block;margin-top:20px;color:#66776e}.error{color:#a32424}@media(max-width:550px){main{margin:8vh 16px;padding:24px}}</style><main><h1>${title}</h1>${body}</main></html>`,
    );
  }
  function login(res, next, message = "", status = 200) {
    page(
      res,
      "登录 Nori",
      `<p>使用你的登录密钥访问管理页面。</p>${message ? `<p class="error">${escape(message)}</p>` : ""}<form method="post" action="/login"><input type="hidden" name="next" value="${escape(safeNext(next))}"><label for="key">登录密钥</label><input id="key" name="key" type="password" autocomplete="current-password" required autofocus maxlength="128"><button>登录</button></form><small>此浏览器将保持登录 30 天。可随时退出登录。</small>`,
      status,
    );
  }
  async function body(req) {
    let text = "",
      size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 4096) throw Error("Body too large");
      text += chunk;
    }
    return new URLSearchParams(text);
  }
  function target(path) {
    const pathname = new URL(path, origin).pathname;
    const instance = config.instances.find(
      (i) => pathname === i.basePath || pathname.startsWith(i.basePath + "/"),
    );
    return instance
      ? { port: instance.port, kind: "claw" }
      : { port: config.routerPort, kind: "router" };
  }
  function upstreamHeaders(req, t, ip) {
    const h = { ...req.headers };
    for (const key of Object.keys(h))
      if (
        key === "cookie" ||
        key === "authorization" ||
        key === "forwarded" ||
        key === "x-real-ip" ||
        key.startsWith("x-forwarded-") ||
        key.startsWith("x-nori-") ||
        key.startsWith("x-openclaw-")
      )
        delete h[key];
    h.host = `127.0.0.1:${t.port}`;
    if (t.kind === "claw") {
      h["x-nori-user"] = config.user ?? "nori-owner";
      h["x-forwarded-for"] = ip;
      h["x-forwarded-host"] = config.hostname;
      h["x-forwarded-proto"] = "https";
    } else {
      const { token } = JSON.parse(readFileSync(new URL("router-session.json", dir)));
      if (!/^[a-f0-9]{48}$/.test(token)) throw Error("Router not ready");
      h.cookie = `rein_router_${config.routerPort}=${token}`;
      h.origin = `http://127.0.0.1:${config.routerPort}`;
      h["sec-fetch-site"] = "same-origin";
    }
    return h;
  }
  const server = createServer(async (req, res) => {
    try {
      const ip = source(req);
      if (!ip) return reply(res, 403, "Invalid ingress");
      if (req.headers["x-forwarded-proto"] !== "https")
        return redirect(res, origin + safeNext(req.url));
      if (!req.url.startsWith("/") || req.url.startsWith("//"))
        return reply(res, 400, "Invalid path");
      const url = new URL(req.url, origin),
        id = session(req);
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.headers.origin !== origin)
        return reply(res, 403, "Origin denied");
      if (url.pathname === "/login" && req.method === "GET") {
        if (id) return redirect(res, safeNext(url.searchParams.get("next")));
        return login(res, url.searchParams.get("next"));
      }
      if (url.pathname === "/login" && req.method === "POST") {
        if (!/^application\/x-www-form-urlencoded(?:;|$)/.test(req.headers["content-type"] ?? ""))
          return reply(res, 415, "Unsupported login format");
        clean();
        const rate = failures.get(ip);
        if (rate?.count >= 8) {
          res.setHeader("Retry-After", "900");
          return login(res, "/apps", "尝试次数过多，请在 15 分钟后重试。", 429);
        }
        const data = await body(req),
          key = (data.get("key") ?? "").trim().toLowerCase();
        if (!timingSafeEqual(Buffer.from(hash(key), "hex"), Buffer.from(config.keyHash, "hex"))) {
          failures.set(ip, {
            count: (rate?.count ?? 0) + 1,
            until: rate?.until ?? Date.now() + 900000,
          });
          if (failures.size > 10000) failures.delete(failures.keys().next().value);
          return login(res, data.get("next"), "密钥不正确，请重试。", 401);
        }
        failures.delete(ip);
        if (Object.keys(sessions).length >= 100) return reply(res, 429, "Session limit reached");
        const value = randomBytes(32).toString("hex");
        sessions[hash(value)] = { expires: Date.now() + ttl * 1000 };
        persist();
        res.setHeader("Set-Cookie", cookie(value));
        return redirect(res, safeNext(data.get("next")));
      }
      if (!id) {
        if (req.method === "GET")
          return redirect(res, "/login?next=" + encodeURIComponent(safeNext(req.url)));
        return reply(res, 401, "Login required");
      }
      if (url.pathname === "/logout" && req.method === "POST") {
        delete sessions[id];
        persist();
        for (const s of sockets.get(id) ?? []) s.destroy();
        sockets.delete(id);
        res.setHeader("Set-Cookie", cookie("", 0));
        return redirect(res, "/login");
      }
      if (url.pathname === "/dashboard" && req.method === "GET") {
        const selected =
          config.instances.find((i) => i.id === url.searchParams.get("instance")) ??
          config.instances[0];
        return redirect(res, selected.basePath + "/");
      }
      if (url.pathname === "/apps" && req.method === "GET") {
        headers(res);
        res.setHeader(
          "Content-Security-Policy",
          "default-src 'none'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
        );
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(homePage(config.instances));
      }
      if (req.method === "GET" && url.pathname === "/_dashboard/style.css") {
        headers(res);
        res.setHeader("Content-Type", "text/css; charset=utf-8");
        return res.end(dashboardCss);
      }
      if (url.pathname.startsWith("/_dashboard/")) return reply(res, 404, "Not found");
      if (url.pathname === "/" && !url.search) return redirect(res, "/apps");
      if (url.pathname === "/_nori/session")
        return reply(
          res,
          200,
          JSON.stringify({ authenticated: true, expiresAt: sessions[id].expires }),
        );
      if (url.pathname === "/login" || url.pathname === "/logout")
        return reply(res, 405, "Method not allowed");
      const t = target(req.url),
        up = httpRequest(
          {
            hostname: "127.0.0.1",
            port: t.port,
            path: req.url,
            method: req.method,
            headers: upstreamHeaders(req, t, ip),
          },
          (r) => {
            const h = { ...r.headers };
            delete h["set-cookie"];
            h["cache-control"] = "no-store, private";
            h["referrer-policy"] = "same-origin";
            h["strict-transport-security"] = "max-age=31536000";
            res.writeHead(r.statusCode, h);
            r.pipe(res);
          },
        );
      up.on("error", () => {
        if (!res.headersSent) reply(res, 502, "Service temporarily unavailable");
        else res.destroy();
      });
      up.setTimeout(180000, () => up.destroy());
      req.on("aborted", () => up.destroy());
      res.on("close", () => up.destroy());
      req.pipe(up);
    } catch {
      if (!res.headersSent) reply(res, 503, "Service temporarily unavailable");
      else res.destroy();
    }
  });
  server.on("upgrade", (req, socket, head) => {
    try {
      const ip = source(req),
        id = session(req),
        t = target(req.url);
      if (
        !ip ||
        !id ||
        req.headers.origin !== origin ||
        req.headers["x-forwarded-proto"] !== "https" ||
        t.kind !== "claw"
      ) {
        socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        return;
      }
      const up = httpRequest({
        hostname: "127.0.0.1",
        port: t.port,
        path: req.url,
        method: "GET",
        headers: upstreamHeaders(req, t, ip),
      });
      up.on("upgrade", (r, peer, upHead) => {
        // Logout/expiry can happen while the upstream handshake is pending.
        if (!(sessions[id]?.expires > Date.now())) {
          peer.destroy();
          socket.destroy();
          return;
        }
        const upgradeHeaders = { ...r.headers };
        delete upgradeHeaders["set-cookie"];
        socket.write(
          `HTTP/1.1 ${r.statusCode} ${r.statusMessage}\r\n` +
            Object.entries(upgradeHeaders)
              .map(([k, v]) => `${k}: ${v}`)
              .join("\r\n") +
            "\r\n\r\n",
        );
        if (head.length) peer.write(head);
        if (upHead.length) socket.write(upHead);
        socket.pipe(peer);
        peer.pipe(socket);
        if (!sockets.has(id)) sockets.set(id, new Set());
        sockets.get(id).add(socket);
        socket.on("close", () => {
          sockets.get(id)?.delete(socket);
          peer.destroy();
        });
        peer.on("error", () => socket.destroy());
        socket.on("error", () => peer.destroy());
      });
      up.on("response", (r) => {
        socket.end(`HTTP/1.1 ${r.statusCode} Rejected\r\nConnection: close\r\n\r\n`);
        r.resume();
      });
      up.on("error", () => socket.destroy());
      up.end();
    } catch {
      socket.destroy();
    }
  });
  server.on("close", () => clearInterval(timer));
  return {
    server,
    close: async () => {
      clearInterval(timer);
      for (const list of sockets.values()) for (const socket of list) socket.destroy();
      server.closeAllConnections();
      await new Promise((resolveClose) => server.close(resolveClose));
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const configPath = resolve(process.argv[2] ?? "runtime/dashboard/config.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const app = createDashboardServer({ config, stateDirectory: dirname(configPath) });
  app.server.listen(config.port ?? 3440, "127.0.0.1", () =>
    console.log("Nori authenticated dashboard ready"),
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.once(signal, () => {
      void app.close().then(() => process.exit(0));
      setTimeout(() => process.exit(0), 5000).unref();
    });
}
