import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const source = readFileSync(
  new URL("../plugins/rein-router/console/boot.js", import.meta.url),
  "utf8",
);
function fixture(target = "rein-router") {
  const root = new Set(["data-rein-boot"]);
  let removed = false,
    check,
    timeout,
    disconnected = false;
  const status = { textContent: "正在打开 OpenClaw Router…" },
    retry = { hidden: true };
  const router = { hidden: true, ready: false, hasAttribute: () => router.ready };
  const panel = {
    dataset: { target },
    remove: () => {
      removed = true;
    },
    querySelector: (selector) => (selector === "a" ? retry : status),
  };
  const document = {
    documentElement: {
      hasAttribute: (key) => root.has(key),
      removeAttribute: (key) => root.delete(key),
    },
    getElementById: (id) => (id === "rein-boot" ? panel : router),
  };
  runInNewContext(source, {
    document,
    MutationObserver: class {
      constructor(fn) {
        check = fn;
      }
      observe() {}
      disconnect() {
        disconnected = true;
      }
    },
    setTimeout: (fn) => {
      timeout = fn;
      return 1;
    },
    clearTimeout: () => {},
  });
  return {
    root,
    router,
    status,
    retry,
    check: () => check(),
    timeout: () => timeout(),
    get removed() {
      return removed;
    },
    get disconnected() {
      return disconnected;
    },
  };
}

test("slow upstream scripts and state requests never reveal the default Agents page", () => {
  const f = fixture();
  f.check();
  assert.equal(f.removed, false);
  f.root.add("data-rein-started");
  f.check();
  assert.equal(f.removed, false);
  f.router.hidden = false;
  f.check();
  assert.equal(f.removed, false);
  f.router.ready = true;
  f.check();
  assert.equal(f.removed, true);
  assert.equal(f.root.has("data-rein-boot"), false);
  assert.equal(f.disconnected, true);
});
test("stalled startup retains an actionable retry surface, then recovers when ready", () => {
  const f = fixture();
  f.timeout();
  assert.equal(f.retry.hidden, false);
  assert.match(f.status.textContent, /重试/);
  assert.equal(f.removed, false);
  f.root.add("data-rein-started");
  f.router.hidden = false;
  f.router.ready = true;
  f.check();
  assert.equal(f.removed, true);
});
test("other native pages are revealed after native startup without waiting on Router data", () => {
  const f = fixture("");
  f.root.add("data-rein-started");
  f.check();
  assert.equal(f.removed, true);
});
