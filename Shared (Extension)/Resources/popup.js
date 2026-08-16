import { normalizeDomain, lookupDomain, blockDomain, listDomains } from "./apiClient.js";

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.style.display = "block";
  setTimeout(() => { toast.style.display = "none"; }, 2500);
}

async function getCurrentTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ?? null;
}

function renderStatus(el, filter) {
  if (filter === "BLOCKED") {
    el.innerHTML = `<span class="status-badge status-blocked">🚫 Blocked</span>`;
  } else if (filter === "SAFE") {
    el.innerHTML = `<span class="status-badge status-safe">✅ Permanently safe</span>`;
  } else if (filter === "OKAY") {
    el.innerHTML = `<span class="status-badge status-okay">🟡 Okay (path checked)</span>`;
  } else {
    el.innerHTML = `<span class="status-badge status-unknown">❔ Not tracked yet</span>`;
  }
}

function disableButton(btn, text) {
  btn.disabled = true;
  btn.className = "btn-disabled";
  btn.textContent = text;
}

async function loadStats() {
  const blockedCountEl = document.getElementById("blocked-count");
  const totalCountEl = document.getElementById("total-count");
  try {
    const [blocked, all] = await Promise.all([listDomains("BLOCKED"), listDomains()]);
    if (blockedCountEl) blockedCountEl.textContent = String(blocked.length);
    if (totalCountEl) totalCountEl.textContent = String(all.length);
  } catch (err) {
    console.error("[Pure Path] Failed to load stats:", err);
    if (blockedCountEl) blockedCountEl.textContent = "—";
    if (totalCountEl) totalCountEl.textContent = "—";
  }
}

async function init() {
  const domainEl = document.getElementById("current-domain");
  const statusEl = document.getElementById("current-status");
  const blockBtn = document.getElementById("btn-block-site");

  if (!domainEl || !statusEl || !blockBtn) return;

  loadStats();

  const tab = await getCurrentTab();
  if (!tab?.url) {
    domainEl.textContent = "No active tab";
    disableButton(blockBtn, "Unavailable");
    return;
  }

  if (
    tab.url.startsWith("safari-extension://") ||
    tab.url.startsWith("safari-web-extension://") ||
    tab.url.startsWith("about:")
  ) {
    domainEl.textContent = "System Page";
    statusEl.innerHTML = `<span class="status-badge status-unknown">Internal</span>`;
    disableButton(blockBtn, "Cannot block system pages");
    return;
  }

  const domain = normalizeDomain(tab.url);
  if (!domain) {
    domainEl.textContent = "Cannot detect domain";
    disableButton(blockBtn, "Invalid domain");
    return;
  }

  domainEl.textContent = domain;

  let currentFilter = null;
  try {
    currentFilter = await lookupDomain(domain);
    renderStatus(statusEl, currentFilter);
  } catch (err) {
    console.error("[Pure Path] Backend lookup error:", err);
    statusEl.innerHTML = `<span class="status-badge status-unknown">⚠️ Backend offline</span>`;
  }

  if (currentFilter === "BLOCKED") {
    disableButton(blockBtn, "Already blocked");
  } else if (currentFilter === "SAFE") {
    disableButton(blockBtn, "Permanently safe — can't block here");
  }

  blockBtn.addEventListener("click", async () => {
    const confirmed = confirm(`Block "${domain}"?\n\nThis will mark it BLOCKED going forward.`);
    if (!confirmed) return;

    blockBtn.disabled = true;
    blockBtn.textContent = "Blocking…";

    try {
      await blockDomain(domain);
      renderStatus(statusEl, "BLOCKED");
      disableButton(blockBtn, "Already blocked");
      showToast(`"${domain}" has been blocked`);
      await loadStats();

      if (tab.id) {
        const blockUrl = browser.runtime.getURL(
          `block.html?reason=${encodeURIComponent("Manually blocked via Pure Path")}&url=${encodeURIComponent(tab.url)}`
        );
        browser.tabs.update(tab.id, { url: blockUrl });
      }
    } catch (err) {
      console.error("[Pure Path] Error blocking domain:", err);
      showToast("Failed to block — check backend connection");
      blockBtn.disabled = false;
      blockBtn.className = "btn-danger";
      blockBtn.textContent = "Block this site";
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}