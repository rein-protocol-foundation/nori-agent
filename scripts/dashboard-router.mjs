// Optional service entry point: keep the console token server-side. Public users
// authenticate with dashboard-server's cookie, never this internal token.
import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { runRouterConsole } from "./router-console.mjs";

const configPath = resolve(process.argv[2] ?? "runtime/dashboard/config.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
const sessionPath = join(dirname(configPath), "router-session.json");
let ownedToken;
try {
  process.exitCode = await runRouterConsole({
    noOpen: true,
    port: config.routerPort ?? 3431,
    onReady: async ({ token }) => {
      const temporary = `${sessionPath}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify({ token }), { mode: 0o600 });
      await rename(temporary, sessionPath);
      ownedToken = token;
      console.log("Magpie ready behind the authenticated dashboard.");
    },
  });
} finally {
  if (ownedToken) {
    try {
      if (JSON.parse(await readFile(sessionPath, "utf8")).token === ownedToken)
        await unlink(sessionPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}
