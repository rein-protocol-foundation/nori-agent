// Rein's loading surface only observes the documented page slot. It never runs
// app.js early or calls upstream private startup functions.
(() => {
  const root = document.documentElement;
  const panel = document.getElementById("rein-boot");
  if (!panel) return;
  let timer;
  const observer = new MutationObserver(check);
  function check() {
    if (!root.hasAttribute("data-rein-started")) return;
    const router = document.getElementById("view-rein-router");
    // The requested Router page is usable once its first state request succeeds
    // or displays its own error. Never reveal the default Agents placeholder.
    if (
      panel.dataset.target === "rein-router" &&
      (!router || router.hidden || !router.hasAttribute("data-rein-ready"))
    )
      return;
    observer.disconnect();
    clearTimeout(timer);
    root.removeAttribute("data-rein-boot");
    panel.remove();
  }
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-rein-started", "data-rein-ready", "hidden"],
  });
  timer = setTimeout(() => {
    panel.querySelector('[role="status"]').textContent = "加载时间较长，请检查连接或重试。";
    panel.querySelector("a").hidden = false;
  }, 12000);
  check();
})();
