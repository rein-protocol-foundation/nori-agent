import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDashboardServer, validateDashboardConfig } from "../scripts/dashboard-server.mjs";
import { homePage } from "../scripts/dashboard-pages.mjs";
const key = "a".repeat(64),
  token = "b".repeat(48);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const listen = (server) =>
  new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
const close = async (server) => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
};
const config = { hostname: "dashboard.example.test", keyHash: hash(key) };
const ingress = {
  Host: config.hostname,
  "X-Nori-Client-IP": "192.0.2.5",
  "X-Forwarded-Proto": "https",
};
const origin = `https://${config.hostname}`;
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "rein-dashboard-"));
  const calls = [];
  const upstream = createServer((req, res) => {
    calls.push({ path: req.url, headers: req.headers });
    res.setHeader("Set-Cookie", "upstream-secret=never-expose");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
    res.end(req.url);
  });
  const peers = new Set();
  upstream.on("upgrade", (req, socket) => {
    calls.push({ path: req.url, headers: req.headers });
    peers.add(socket);
    socket.on("close", () => peers.delete(socket));
    socket.on("error", () => {});
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n",
    );
  });
  const upstreamPort = await listen(upstream);
  const settings = {
    ...config,
    routerPort: upstreamPort,
    instances: [
      { id: "slack", label: "Slack", basePath: "/slack", port: upstreamPort },
      { id: "discord", label: "Discord", basePath: "/discord", port: upstreamPort },
    ],
  };
  await writeFile(join(directory, "router-session.json"), JSON.stringify({ token }));
  let app = createDashboardServer({ config: settings, stateDirectory: directory });
  let port = await listen(app.server);
  const send = (path, options = {}) =>
    new Promise((resolve, reject) => {
      const req = request(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method: options.method ?? "GET",
          headers: { ...ingress, ...options.headers },
        },
        (response) => {
          const chunks = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () =>
            resolve(
              new Response(Buffer.concat(chunks), {
                status: response.statusCode,
                headers: response.headers,
              }),
            ),
          );
        },
      );
      req.on("error", reject);
      req.end(options.body?.toString());
    });
  const login = async () => {
    const response = await send("/login", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ key, next: "/apps" }),
    });
    assert.equal(response.status, 303);
    return response.headers.get("set-cookie");
  };
  t.after(async () => {
    await app.close();
    for (const peer of peers) peer.destroy();
    await close(upstream);
    await rm(directory, { recursive: true, force: true });
  });
  return {
    send,
    login,
    calls,
    directory,
    settings,
    get port() {
      return port;
    },
    restart: async () => {
      await app.close();
      app = createDashboardServer({ config: settings, stateDirectory: directory });
      port = await listen(app.server);
    },
  };
}

test("dashboard keeps two panels, exposes both configured instances and escapes labels", () => {
  const html = homePage([
    { id: "slack", label: "<Slack>" },
    { id: "discord", label: "Discord" },
  ]);
  assert.equal((html.match(/class="panel /g) ?? []).length, 2);
  assert.match(html, /instance=slack/);
  assert.match(html, /instance=discord/);
  assert.match(html, /&lt;Slack&gt;/);
  assert.doesNotMatch(html, /<iframe/);
  assert.throws(
    () =>
      validateDashboardConfig({
        ...config,
        instances: [{ id: "x", label: "X", basePath: "//outside", port: 1234 }],
      }),
    /invalid/,
  );
  assert.throws(() => validateDashboardConfig({ ...config, routerPort: "3431" }), /invalid/);
});

test("session gates pages, assets and APIs; rejects bad ingress, credentials and CSRF", async (t) => {
  const f = await fixture(t);
  for (const path of [
    "/apps",
    "/dashboard?instance=discord",
    "/discord/",
    "/?view=rein-router",
    "/_rein/api/state",
    "/_dashboard/style.css",
  ])
    assert.equal((await f.send(path)).status, 303);
  assert.equal((await f.send("/apps", { headers: { Host: "evil.invalid" } })).status, 403);
  const post = {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" },
    body: "key=wrong",
  };
  assert.equal((await f.send("/login", post)).status, 401);
  assert.equal(
    (
      await f.send("/login", {
        ...post,
        headers: { ...post.headers, Origin: "https://evil.invalid" },
      })
    ).status,
    403,
  );
  const setCookie = await f.login(),
    Cookie = setCookie.split(";")[0];
  for (const attr of ["Secure", "HttpOnly", "SameSite=Lax", "Max-Age=2592000", "Path=/"])
    assert.ok(setCookie.includes(attr));
  const home = await f.send("/apps", { headers: { Cookie } });
  assert.equal(home.status, 200);
  assert.match(await home.text(), /instance=discord/);
  for (const id of ["slack", "discord"]) {
    const target = await f.send(`/dashboard?instance=${id}`, { headers: { Cookie } });
    assert.equal(target.headers.get("location"), `/${id}/`);
  }
  assert.equal(
    (await f.send("/dashboard?instance=https://evil.invalid", { headers: { Cookie } })).headers.get(
      "location",
    ),
    "/slack/",
  );
  await f.restart();
  assert.equal((await f.send("/apps", { headers: { Cookie } })).status, 200);
  const stored = await readFile(join(f.directory, "sessions.json"), "utf8");
  assert.ok(!stored.includes(Cookie.split("=")[1]));
  assert.equal(
    (
      await f.send("/logout", {
        method: "POST",
        headers: { Cookie, Origin: "https://evil.invalid" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await f.send("/logout", { method: "POST", headers: { Cookie, Origin: origin } })).status,
    303,
  );
  assert.equal((await f.send("/apps", { headers: { Cookie } })).status, 303);
});

test("native proxy preserves deep paths and frame protection, replaces spoofed identity and hides internal tokens", async (t) => {
  const f = await fixture(t),
    Cookie = (await f.login()).split(";")[0];
  const headers = {
    Cookie,
    Authorization: "Bearer forged",
    "X-Nori-User": "attacker",
    "X-OpenClaw-Scopes": "forged",
    "X-Forwarded-For": "forged",
  };
  const response = await f.send("/discord/chat/example?mode=test", { headers });
  assert.equal(await response.text(), "/discord/chat/example?mode=test");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("content-security-policy"), "frame-ancestors 'none'");
  assert.equal(response.headers.get("set-cookie"), null);
  const call = f.calls.at(-1);
  assert.equal(call.headers["x-nori-user"], "nori-owner");
  assert.equal(call.headers["x-forwarded-for"], "192.0.2.5");
  for (const name of ["cookie", "authorization", "x-openclaw-scopes"])
    assert.equal(call.headers[name], undefined);
  await f.send("/_rein/api/state", { headers });
  assert.equal(f.calls.at(-1).headers.cookie, `rein_router_${f.settings.routerPort}=${token}`);
  assert.equal(f.calls.at(-1).headers.origin, `http://127.0.0.1:${f.settings.routerPort}`);
});

test("WebSocket requires a valid session and origin; logout closes upgraded connections", async (t) => {
  const f = await fixture(t),
    Cookie = (await f.login()).split(";")[0];
  const upgrade = (headers) =>
    new Promise((resolve, reject) => {
      const req = request({
        hostname: "127.0.0.1",
        port: f.port,
        path: "/discord/",
        headers: { ...ingress, Connection: "Upgrade", Upgrade: "websocket", ...headers },
      });
      req.on("upgrade", (_, socket) => {
        socket.on("error", () => {});
        resolve(socket);
      });
      req.on("response", (response) => {
        response.resume();
        resolve(response.statusCode);
      });
      req.on("error", reject);
      req.end();
    });
  assert.equal(await upgrade({ Origin: origin }), 401);
  assert.equal(await upgrade({ Cookie, Origin: "https://evil.invalid" }), 401);
  const socket = await upgrade({ Cookie, Origin: origin });
  socket.resume();
  const ended = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("socket not revoked")), 2000);
    socket.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  await f.send("/logout", { method: "POST", headers: { Cookie, Origin: origin } });
  await ended;
});
