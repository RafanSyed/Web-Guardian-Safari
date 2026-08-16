// content.js — Pure Path Safari
// Only job: notice client-side URL changes (SPA routing, e.g. YouTube search/
// video navigation) that Safari's webNavigation API sometimes misses, and tell
// background.js to re-check. No keyword matching, no domain caching here —
// that logic lives in one place only (background.js) to avoid the exact kind
// of drift bug that happened when two copies of the keyword lists existed.

let lastCheckedUrl = location.href;

function checkUrlChange() {
  const currentUrl = location.href;
  if (currentUrl !== lastCheckedUrl) {
    lastCheckedUrl = currentUrl;
    console.log(`[Pure Path] 🔄 SPA URL change detected: ${currentUrl}`);
    browser.runtime.sendMessage({ action: "urlChanged", url: currentUrl });
  }
}

window.addEventListener("popstate", checkUrlChange);
window.addEventListener("hashchange", checkUrlChange);

const spaObserver = new MutationObserver(checkUrlChange);
if (document.head) {
  spaObserver.observe(document.head, { childList: true, subtree: true });
}

// Catch the case where the tab loads directly onto a URL that needs checking
// (content scripts run after navigation already started).
checkUrlChange();