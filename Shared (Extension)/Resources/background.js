// background.js — Pure Path Safari

import {
  normalizeDomain,
  lookupDomain,
  addDomain,
  classifyWebsite,
  classifySearchQuery,
  parseURL,
  classifyYoutube,
  checkAIServerHealth,
} from "./apiClient.js";

// ------------------------------------------------------------
// IN-FLIGHT DEDUP (prevents duplicate AI calls from Safari's multiple
// navigation event sources firing for the same navigation)
// ------------------------------------------------------------
const inFlightSearches = new Set();
const inFlightDomains = new Set();
const inFlightPaths = new Set();

// ------------------------------------------------------------
// LOCKDOWN STATE
// ------------------------------------------------------------
let blockHitsThisWindow = 0;
let currentWindowMinute = -1;
let lockdownUntil = 0;

const HITS_TO_TRIGGER = 3;
const LOCKDOWN_DURATION_MS = 30 * 60 * 1000;

async function clearExpiredLockdown() {
  const now = Date.now();
  if (lockdownUntil && now >= lockdownUntil) {
    lockdownUntil = 0;
    await browser.storage.local.remove("lockdownUntil");
    console.log("[Pure Path] 🔓 Lockdown expired");
  }
}

function isLockedDown() {
  return Date.now() < lockdownUntil;
}

async function recordBlockHit() {
  const now = Date.now();
  const thisMinute = Math.floor(now / 60_000);

  if (thisMinute !== currentWindowMinute) {
    currentWindowMinute = thisMinute;
    blockHitsThisWindow = 0;
  }

  blockHitsThisWindow++;
  console.log(`[Pure Path] 📊 Block hits this minute: ${blockHitsThisWindow}/${HITS_TO_TRIGGER}`);

  if (blockHitsThisWindow >= HITS_TO_TRIGGER) {
    lockdownUntil = now + LOCKDOWN_DURATION_MS;
    await browser.storage.local.set({ lockdownUntil });
    blockHitsThisWindow = 0;
    currentWindowMinute = -1;
    console.log("[Pure Path] 🔒 LOCKDOWN MODE TRIGGERED");

    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && !isBlockPage(tab.url || "")) {
        browser.tabs.update(tab.id, { url: browser.runtime.getURL("testing-block.html") });
      }
    }
  }
}

// ------------------------------------------------------------
// KEYWORDS — single source of truth. Paste your real lists here
// (same ones used in the Chrome extension's keywords.ts, kept in sync
// manually since Safari doesn't share a build pipeline with Chrome).
// ------------------------------------------------------------
const KEYWORDS = [
  // TODO: paste your real KEYWORDS array here (same as Chrome's keywords.ts)
];

const KEYWORD_EXCEPTIONS = new Set([
  // TODO: paste your real KEYWORD_EXCEPTIONS set here
]);

const HARD_BLOCK_KEYWORDS = new Set([
  // TODO: paste your real HARD_BLOCK_KEYWORDS set here
]);

function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-.]/g, " ")
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesKeywordSmart(text) {
  if (!text) return null;
  const normalized = normalizeText(text);

  for (const kw of HARD_BLOCK_KEYWORDS) {
    const normKw = normalizeText(kw);
    const regex = new RegExp(`(?<![a-z0-9])${escapeRegex(normKw)}(?![a-z0-9])`, "i");
    if (regex.test(normalized)) return kw;
  }

  for (const kw of KEYWORDS) {
    if (HARD_BLOCK_KEYWORDS.has(kw)) continue;
    if (KEYWORD_EXCEPTIONS.has(kw)) continue;
    const normKw = normalizeText(kw);
    const regex = new RegExp(`(?<![a-z0-9])${escapeRegex(normKw)}(?![a-z0-9])`, "i");
    if (regex.test(normalized)) return kw;
  }

  return null;
}

// ------------------------------------------------------------
// URL HELPERS
// ------------------------------------------------------------
function isBlockPage(url) {
  return url.includes("block.html") || url.includes("testing-block.html");
}

function isSafariInternal(url) {
  return (
    url.startsWith("safari-extension://") ||
    url.startsWith("safari-web-extension://") ||
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("about:") ||
    url.startsWith("file://") ||
    url.startsWith("blob:") ||
    url.startsWith("data:")
  );
}

function isSearchUrl(url) {
  try {
    const u = new URL(url);
    const h = u.hostname;
    return (
      ((h === "www.google.com" || h === "google.com") && u.pathname === "/search") ||
      ((h === "www.bing.com" || h === "bing.com") && u.pathname === "/search")
    );
  } catch {
    return false;
  }
}

function getSearchQuery(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("google.") || u.hostname.includes("bing.com")) {
      return u.searchParams.get("q") ?? "";
    }
    return "";
  } catch {
    return "";
  }
}

function splitUrl(url) {
  try {
    const u = new URL(url);
    const rootDomain = normalizeDomain(url);
    const pathQuery = (u.pathname.replace(/^\//, "") + (u.search ?? "")).trim();
    return { rootDomain, pathQuery };
  } catch {
    return null;
  }
}

function buildBlockUrl(reason, originalUrl) {
  return browser.runtime.getURL(
    `block.html?reason=${encodeURIComponent(reason)}&url=${encodeURIComponent(originalUrl)}`
  );
}

// ------------------------------------------------------------
// REDIRECT DEDUP
// ------------------------------------------------------------
const recentlyBlocked = new Map();
const RECENT_BLOCK_MS = 3000;

async function redirectOnce(tabId, targetUrl) {
  const now = Date.now();
  const prev = recentlyBlocked.get(tabId);
  if (prev && prev.url === targetUrl && now - prev.ts < RECENT_BLOCK_MS) return false;
  recentlyBlocked.set(tabId, { url: targetUrl, ts: now });
  browser.tabs.update(tabId, { url: targetUrl });
  return true;
}

// ------------------------------------------------------------
// MAIN HANDLER
// ------------------------------------------------------------
async function handleMainFrameUrl(tabId, url) {
  await clearExpiredLockdown();

  if (isLockedDown()) {
    console.log("[Pure Path] 🔒 In LOCKDOWN MODE");
    await redirectOnce(tabId, browser.runtime.getURL("testing-block.html"));
    return;
  }

  if (!url || isBlockPage(url) || isSafariInternal(url)) return;

  const split = splitUrl(url);
  if (!split) return;
  const { rootDomain, pathQuery } = split;

  // ── 1. YOUTUBE VIDEO — checked before search/domain logic ────────────
  if ((rootDomain === "youtube.com" || rootDomain === "m.youtube.com") && pathQuery.includes("watch")) {
    const flightKey = `${tabId}:yt:${url}`;
    if (inFlightDomains.has(flightKey)) return;
    inFlightDomains.add(flightKey);

    try {
      const ytResult = await classifyYoutube(url);
      if (ytResult === "BLOCK") {
        console.log("[Pure Path] 🚫 YouTube video blocked");
        const didRedirect = await redirectOnce(tabId, buildBlockUrl("YouTube video restricted", url));
        if (didRedirect) await recordBlockHit();
      }
    } finally {
      inFlightDomains.delete(flightKey);
    }
    return;
  }

  // ── 2. SEARCH PAGES ────────────────────────────────────────────────
  if (isSearchUrl(url)) {
    const query = getSearchQuery(url);
    if (!query) return;

    const kwMatch = matchesKeywordSmart(query);
    if (kwMatch) {
      console.log(`[Pure Path] 🚫 Search blocked — keyword: "${kwMatch}"`);
      const didRedirect = await redirectOnce(tabId, buildBlockUrl(`Search matched keyword: ${kwMatch}`, url));
      if (didRedirect) await recordBlockHit();
      return;
    }

    const flightKey = `${tabId}:${query}`;
    if (inFlightSearches.has(flightKey)) return;
    inFlightSearches.add(flightKey);

    try {
      const aiResult = await classifySearchQuery(query);
      if (aiResult === "BLOCK") {
        const didRedirect = await redirectOnce(tabId, buildBlockUrl("AI blocked search", url));
        if (didRedirect) await recordBlockHit();
      }
    } finally {
      inFlightSearches.delete(flightKey);
    }
    return;
  }

  // ── 3. STANDARD WEBSITE VISITS ─────────────────────────────────────
  const domainFlightKey = `${tabId}:${rootDomain}`;
  if (inFlightDomains.has(domainFlightKey)) return;

  let filter;
  try {
    inFlightDomains.add(domainFlightKey);
    filter = await lookupDomain(rootDomain);

    if (filter === null) {
      // Unknown domain — ask the AI, then persist so next visit is a lookup, not an AI call.
      filter = await classifyWebsite(rootDomain, url, undefined);
      try {
        await addDomain(rootDomain, filter);
        console.log(`[Pure Path] 🧠 ${rootDomain} — AI classified as ${filter}, saved`);
      } catch (err) {
        // Domain may have been added concurrently by another tab — non-fatal.
        console.warn(`[Pure Path] Could not persist ${rootDomain}:`, err.message);
      }
    }
  } finally {
    inFlightDomains.delete(domainFlightKey);
  }

  if (filter === "BLOCKED") {
    console.log(`[Pure Path] 🚫 ${rootDomain} — BLOCKED`);
    const didRedirect = await redirectOnce(tabId, buildBlockUrl("Domain is blocked", url));
    if (didRedirect) await recordBlockHit();
    return;
  }

  if (filter === "SAFE") {
    console.log(`[Pure Path] ✅ ${rootDomain} — SAFE (permanent), skipping path check`);
    return;
  }

  // filter === "OKAY" — domain is fine, but still check the path/query.
  if (pathQuery) {
    const kwMatch = matchesKeywordSmart(pathQuery);
    if (kwMatch) {
      console.log(`[Pure Path] 🚫 ${rootDomain} — path matched keyword: "${kwMatch}"`);
      const didRedirect = await redirectOnce(tabId, buildBlockUrl(`Path matched keyword: ${kwMatch}`, url));
      if (didRedirect) await recordBlockHit();
      return;
    }

    const pathFlightKey = `${tabId}:${rootDomain}:${pathQuery}`;
    if (!inFlightPaths.has(pathFlightKey)) {
      inFlightPaths.add(pathFlightKey);
      try {
        const pathResult = await parseURL(pathQuery, rootDomain);
        if (pathResult?.classification === "BLOCK") {
          console.log(`[Pure Path] 🚫 ${rootDomain} — path/query blocked`);
          const didRedirect = await redirectOnce(tabId, buildBlockUrl("AI blocked URL path content", url));
          if (didRedirect) await recordBlockHit();
        }
      } finally {
        inFlightPaths.delete(pathFlightKey);
      }
    }
  }
}

// ------------------------------------------------------------
// EVENT LISTENERS
// ------------------------------------------------------------
function shouldHandle(details) {
  return details.frameId === 0 && details.tabId !== -1 && typeof details.url === "string";
}

// Safari's webNavigation SPA event support is inconsistent, so tabs.onUpdated
// is the primary signal here (not just a backup like on Chrome).
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const targetedUrl = changeInfo.url || tab.url;
  if (targetedUrl && !isBlockPage(targetedUrl)) {
    handleMainFrameUrl(tabId, targetedUrl);
  }
});

if (typeof browser.webNavigation !== "undefined") {
  browser.webNavigation.onBeforeNavigate.addListener((d) => {
    if (shouldHandle(d)) handleMainFrameUrl(d.tabId, d.url);
  });
  browser.webNavigation.onCommitted.addListener((d) => {
    if (shouldHandle(d)) handleMainFrameUrl(d.tabId, d.url);
  });
}

// content.js sends this for SPA URL changes it detects that the above miss.
browser.runtime.onMessage.addListener((message, sender) => {
  if (message.action === "urlChanged" && sender.tab?.id) {
    handleMainFrameUrl(sender.tab.id, message.url);
  }
});

// ------------------------------------------------------------
// INIT
// ------------------------------------------------------------
checkAIServerHealth().then((ok) =>
  console.log(ok ? "[Pure Path] ✅ Backend connected" : "[Pure Path] ⚠️ Backend offline")
);

(async () => {
  const result = await browser.storage.local.get("lockdownUntil");
  if (typeof result.lockdownUntil === "number") {
    lockdownUntil = result.lockdownUntil;
    console.log("[Pure Path] 🔁 Restored lockdownUntil:", lockdownUntil);
  }
})();

setInterval(() => {
  const now = Date.now();
  for (const [tabId, entry] of recentlyBlocked) {
    if (now - entry.ts > 30_000) recentlyBlocked.delete(tabId);
  }
}, 30_000);