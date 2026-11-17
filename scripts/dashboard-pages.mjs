import { readFileSync } from "node:fs";

const assets = new URL("../web/dashboard/", import.meta.url);
export const dashboardCss = readFileSync(new URL("style.css", assets));
const home = readFileSync(new URL("home.html", assets), "utf8");
export const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

// Native links preserve upstream frame-ancestors policies and session UX. Do not
// embed, patch, or combine the Control UIs or their private session stores.
export function homePage(instances) {
  const unified = instances.length === 1;
  const links = unified
    ? '<a href="/dashboard">打开 Nori <span aria-hidden="true">↗</span></a>'
    : instances
    .map(
      (instance) =>
        `<a href="/dashboard?instance=${encodeURIComponent(instance.id)}">${escapeHtml(instance.label)} <span aria-hidden="true">↗</span></a>`,
    )
    .join("");
  return home.replace("{{INSTANCE_LINKS}}", links).replace(
    "{{AGENT_DESCRIPTION}}",
    unified ? "统一管理智能体、渠道消息与网页对话。" : "管理智能体、渠道消息与网页对话。",
  );
}
