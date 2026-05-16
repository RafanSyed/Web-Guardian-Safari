//
//  domainDB.js
//  Web-Guardian-IOS
//
//  Created by Rafan Syed on 5/14/26.
//

// domainDB.js — Web Guardian Safari (ported from domainDB.ts)

// ------------------------------------------------------------
// DOMAIN NORMALIZATION
// ------------------------------------------------------------
export function normalizeDomain(url) {
  try {
    const u = new URL(url);
    const hostname = u.hostname.toLowerCase();

    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return hostname;

    return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  } catch {
    return "";
  }
}

// ------------------------------------------------------------
// MONTHLY RESET
// ------------------------------------------------------------
function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function checkAndResetCacheIfNewMonth() {
  const result = await browser.storage.local.get(["domainDB", "cacheMonth"]);
  const storedMonth = result.cacheMonth;
  const thisMonth = currentMonthKey();

  if (storedMonth !== thisMonth) {
    console.log(`[Web Guardian] 🗓️ New month — resetting domain cache`);
    await browser.storage.local.set({ domainDB: {}, cacheMonth: thisMonth });
  }
}

// ------------------------------------------------------------
// READ / WRITE
// ------------------------------------------------------------
export async function getDomainStatus(domain) {
  const result = await browser.storage.local.get("domainDB");
  const domainDB = result.domainDB || {};
  const entry = domainDB[domain];
  if (!entry) return null;
  return entry.status;
}

export async function setDomainStatus(domain, status) {
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
