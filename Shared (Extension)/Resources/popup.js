// popup.js — Web Guardian Safari (Aligned with your domainDB.js structure)

// ------------------------------------------------------------
// DOMAIN DB (Perfectly aligned with your domainDB.js)
// ------------------------------------------------------------
function normalizeDomain(url) {
  try {
    const u = new URL(url);
    const hostname = u.hostname.toLowerCase();
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return hostname;
    return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  } catch {
    return "";
  }
}

async function getDomainStatus(domain) {
  const result = await browser.storage.local.get("domainDB");
  const domainDB = result.domainDB || {};
  const entry = domainDB[domain];
  if (!entry) return null;
  return entry.status; // Returns "BLOCK" or "SAFE"
}

async function setDomainStatus(domain, status) {
  const result = await browser.storage.local.get("domainDB");
  const domainDB = result.domainDB || {};
  
  const updated = {
    ...domainDB,
    [domain]: {
      status,
      cachedAt: Date.now(),
    },
  };
  await browser.storage.local.set({ domainDB: updated });
}

// ------------------------------------------------------------
// TOAST
// ------------------------------------------------------------
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.style.display = "block";
  setTimeout(() => { toast.style.display = "none"; }, 2500);
}

// ------------------------------------------------------------
// STATS (Correctly parses the domainDB wrapper object)
// ------------------------------------------------------------
async function loadStats() {
  const result = await browser.storage.local.get("domainDB");
  const db = result.domainDB || {};
  const entries = Object.values(db);
  
  const blocked = entries.filter(e => e.status === "BLOCK").length;
  
  document.getElementById("blocked-count").textContent = String(blocked);
  document.getElementById("total-count").textContent = String(entries.length);
}

// ------------------------------------------------------------
// INIT
// ------------------------------------------------------------
async function init() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0] ?? null;

  const domainEl = document.getElementById("current-domain");
  const statusEl = document.getElementById("current-status");
  const blockBtn = document.getElementById("btn-block-site");
  const confirmBox = document.getElementById("confirm-box");
  const confirmYes = document.getElementById("confirm-yes");
  const confirmNo = document.getElementById("confirm-no");

  if (!tab?.url) {
    domainEl.textContent = "No active tab";
    blockBtn.disabled = true;
    blockBtn.className = "btn btn-disabled";
    return;
  }

  const domain = normalizeDomain(tab.url);

  if (!domain) {
    domainEl.textContent = "Cannot detect domain";
    blockBtn.disabled = true;
    blockBtn.className = "btn btn-disabled";
    return;
  }

  domainEl.textContent = domain;

  const status = await getDomainStatus(domain);
  if (status === "BLOCK") {
    statusEl.innerHTML = `<span class="status-badge status-block">🚫 Already Blocked</span>`;
    blockBtn.disabled = true;
    blockBtn.className = "btn btn-disabled";
    blockBtn.textContent = "🚫 Already Blocked";
  } else {
    statusEl.innerHTML = `<span class="status-badge status-unknown">❓ Not blocked</span>`;
  }

  // Show inline confirm box instead of confirm()
  blockBtn.addEventListener("click", () => {
    confirmBox.style.display = "block";
    blockBtn.style.display = "none";
  });

  confirmNo.addEventListener("click", () => {
    confirmBox.style.display = "none";
    blockBtn.style.display = "block";
  });

  confirmYes.addEventListener("click", async () => {
    await setDomainStatus(domain, "BLOCK");
    statusEl.innerHTML = `<span class="status-badge status-block">🚫 Blocked</span>`;
    confirmBox.style.display = "none";
    blockBtn.disabled = true;
    blockBtn.className = "btn btn-disabled";
    blockBtn.textContent = "🚫 Already Blocked";
    blockBtn.style.display = "block";
    showToast(`"${domain}" has been blocked`);
    await loadStats();

    if (tab.id) {
      const blockUrl = browser.runtime.getURL(
        `block.html?reason=${encodeURIComponent("Manually blocked via Web Guardian")}&url=${encodeURIComponent(tab.url)}`
      );
      browser.tabs.update(tab.id, { url: blockUrl });
    }
  });

  await loadStats();
}

init();
