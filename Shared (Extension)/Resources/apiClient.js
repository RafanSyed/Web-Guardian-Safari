// apiClient.js — Pure Path Safari
// Talks to the real Pure Path backend. No local domain cache — matches the
// Chrome extension's design (dropped local caching deliberately since OKAY
// domains still need a path/query check every visit, so a cache wasn't
// buying enough to be worth the staleness risk).

const API_BASE_URL = "https://purepathbackend.onrender.com"; // TODO: your real Render backend URL

// Unlike the Chrome extension (which uses esbuild's --define to inject this at
// build time), this Safari extension has no build step — Xcode loads these
// files as-is. So this has to be a plain hardcoded value. Since this is a
// personal, non-App-Store-distributed extension, that's an accepted tradeoff —
// just know this token is visible to anyone with access to the source/binary.
const API_AUTH_TOKEN = ""; // must match backend's API_AUTH_TOKEN exactly

function authedJsonHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${API_AUTH_TOKEN}`,
  };
}

// ------------------------------------------------------------
// DOMAIN NORMALIZATION (kept local — same logic as backend's own normalizeDomain)
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

function jsonHeaders() {
  return { "Content-Type": "application/json" };
}

async function parseOrThrow(res, context) {
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    throw new Error(data?.error || `${context} failed with status ${res.status}`);
  }
  return data;
}

// ------------------------------------------------------------
// DOMAIN FILTER LOOKUP / WRITE
// ------------------------------------------------------------
export async function lookupDomain(domain) {
  const res = await fetch(`${API_BASE_URL}/domains/lookup?domain=${encodeURIComponent(domain)}`, {
    headers: jsonHeaders(),
  });
  const data = await parseOrThrow(res, "Domain lookup");
  return data.found ? data.filter : null; // "SAFE" | "OKAY" | "BLOCKED" | null
}

// Optional filter — omit to get every tracked domain.
export async function listDomains(filter) {
  const query = filter ? `?filter=${encodeURIComponent(filter)}` : "";
  const res = await fetch(`${API_BASE_URL}/domains${query}`, {
    headers: jsonHeaders(),
  });
  const data = await parseOrThrow(res, "List domains");
  return data.domains ?? [];
}

// Only ever called with "OKAY" or "BLOCKED" from the extension itself —
// "SAFE" (permanent) is added manually through the separate admin site only.
export async function addDomain(domain, filter) {
  const res = await fetch(`${API_BASE_URL}/domains`, {
    method: "POST",
    headers: authedJsonHeaders(),
    body: JSON.stringify({ domain, filter }),
  });
  return parseOrThrow(res, "Add domain");
}

export async function updateDomainFilter(domain, filter) {
  const res = await fetch(`${API_BASE_URL}/domains`, {
    method: "PATCH",
    headers: authedJsonHeaders(),
    body: JSON.stringify({ domain, filter }),
  });
  return parseOrThrow(res, "Update domain filter");
}

// Mirrors the Chrome extension's blockDomain helper: try add first, and if
// the domain already exists (backend returns 409), fall through to update.
export async function blockDomain(domain) {
  try {
    await addDomain(domain, "BLOCKED");
  } catch (err) {
    await updateDomainFilter(domain, "BLOCKED");
  }
}

// ------------------------------------------------------------
// AI CLASSIFICATION ENDPOINTS
// ------------------------------------------------------------
export async function classifySearchQuery(query) {
  try {
    const res = await fetch(`${API_BASE_URL}/classify-search`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ query }),
    });
    const data = await parseOrThrow(res, "Classify search");
    return data.classification ?? "SAFE";
  } catch (err) {
    console.error("[Pure Path] classifySearchQuery failed:", err);
    return "UNKNOWN";
  }
}

// AI only ever says "SAFE" or "BLOCK" — this maps that to the real DB filter:
// SAFE (AI) -> "OKAY" (still path-checked every visit)
// BLOCK (AI) -> "BLOCKED"
export async function classifyWebsite(domain, url, title) {
  try {
    const res = await fetch(`${API_BASE_URL}/classify-website`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ domain, url, title }),
    });
    const data = await parseOrThrow(res, "Classify website");
    const verdict = data.classification ?? "SAFE";
    return verdict === "BLOCK" ? "BLOCKED" : "OKAY";
  } catch (err) {
    console.error("[Pure Path] classifyWebsite failed:", err);
    return "OKAY"; // fail open for general browsing — matches Chrome extension behavior
  }
}

export async function parseURL(pathQuery, domain, title) {
  try {
    const res = await fetch(`${API_BASE_URL}/parse-url`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ domain, title, pathQuery }),
    });
    return await parseOrThrow(res, "Parse URL");
  } catch (err) {
    console.error("[Pure Path] parseURL failed:", err);
    return null;
  }
}

// Only needs the URL now — backend extracts videoId, checks channel safelist,
// runs the safeSearch=strict restriction check, and falls back to AI title
// classification server-side. No noembed, no client-side channel-name matching.
export async function classifyYoutube(url) {
  try {
    const res = await fetch(`${API_BASE_URL}/classify-youtube`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ url }),
    });
    const data = await parseOrThrow(res, "Classify YouTube");
    return data.classification ?? "BLOCK"; // fail-safe for YouTube specifically
  } catch (err) {
    console.error("[Pure Path] classifyYoutube failed:", err);
    return "BLOCK";
  }
}

// ------------------------------------------------------------
// HEALTH CHECK
// ------------------------------------------------------------
export async function checkAIServerHealth() {
  try {
    const res = await fetch(`${API_BASE_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
