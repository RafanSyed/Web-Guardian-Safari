const params = new URLSearchParams(window.location.search);

const reasonEl = document.getElementById("blocked-reason");
const urlEl = document.getElementById("blocked-url");

const reason = params.get("reason") || "Blocked by Pure Path";
const blockedUrl = params.get("url") || "";

if (reasonEl) reasonEl.textContent = reason;

if (urlEl) {
  try {
    const u = new URL(blockedUrl);
    urlEl.textContent = u.hostname + u.pathname;
  } catch {
    urlEl.textContent = blockedUrl || "—";
  }
}

const closeBtn = document.getElementById("close-btn");
closeBtn?.addEventListener("click", () => {
  window.close();
});

// History trap — prevents back-button from revealing the blocked page's content
history.replaceState(null, "", location.href);
history.pushState(null, "", location.href);
window.addEventListener("popstate", () => {
  history.pushState(null, "", location.href);
});