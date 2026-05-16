// content.js — Web Guardian Safari (ported from content.ts)

import { normalizeDomain, getDomainStatus } from "./domainDB.js";

// ------------------------------------------------------------
// SAFE DOMAINS
// ------------------------------------------------------------
let SAFE_DOMAINS = [];

browser.storage.local.get("safeDomains").then(result => {
  if (Array.isArray(result.safeDomains)) {
    SAFE_DOMAINS = result.safeDomains;
  }
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.safeDomains?.newValue) {
    SAFE_DOMAINS = changes.safeDomains.newValue;
  }
});

// ------------------------------------------------------------
// HARD BLOCK KEYWORDS
// ------------------------------------------------------------
const HARD_BLOCK_KEYWORDS = new Set([
  "porn", "porno", "pornography", "pornographic", "hentai", "nsfw",
  "xxx", "18+", "r18", "loli", "lolicon", "shota", "shotacon",
  "onlyfans", "chaturbate", "nhentai", "gelbooru", "danbooru",
  "e621", "f95zone", "rule34", "ahegao", "jailbait", "teen sex",
  "barely legal", "rape", "raped", "non-consent", "bestiality",
  "zoophilia", "leaked nudes", "nude leak", "revenge porn",
  "sex", "sexual", "intercourse", "blowjob", "blow job", "handjob",
  "hand job", "cumshot", "creampie", "gangbang", "threesome",
  "orgy", "masturbate", "masturbation", "ejaculation", "boner",
  "erection", "pussy", "cock", "cocks", "dick", "dicks", "vagina",
  "cunt", "tits", "boobs", "nipples", "nude", "nudity", "nudes",
  "naked", "erotic", "erotica", "horny", "fetish", "bdsm", "bondage",
  "dildo", "vibrator", "butt plug", "sex toy", "sexting",
  "stripper", "strip club", "prostitute", "prostitution",
  "escort service", "sex worker", "sex work", "cam girl", "camgirl",
  "camboy", "manga", "manhwa", "manhua", "webtoon", "hentai manga",
  "doujin", "doujinshi", "scanlation", "chapter", "ecchi", "yaoi",
  "yuri", "anime", "thirst trap", "discord nsfw", "r/gonewild",
  "r/nsfw", "bikini try on", "lingerie try on", "upskirt",
  "downblouse", "nip slip", "camel toe", "topless", "braless",
  "twerking", "striptease", "doggy style", "boudoir",
  "literotica", "erotic fiction", "erotic novel", "smut",
  "adult chat", "sex chat", "phone sex", "cyber sex",
  "dick pic", "send nudes", "fuck", "fucked", "fucking",
  "cocksucker", "motherfucker",
]);

const COMBO_PHRASES = [
  "readmanga", "readmanhwa", "readmanhua", "readwebtoon",
  "hentaimanga", "adultmanga", "maturemanga",
];

// ------------------------------------------------------------
// NORMALIZATION
// ------------------------------------------------------------
function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-\.]/g, " ")
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

function matchesKeywords(text) {
  if (!text) return false;
  const normalized = normalizeText(text);

  for (const kw of HARD_BLOCK_KEYWORDS) {
    const normKw = normalizeText(kw);
    const regex = new RegExp(`(?<![a-z0-9])${escapeRegex(normKw)}(?![a-z0-9])`, "i");
    if (regex.test(normalized)) return true;
  }

  const stripped = normalized.replace(/\s/g, "");
  for (const phrase of COMBO_PHRASES) {
    if (stripped.includes(phrase)) return true;
  }

  return false;
}

// ------------------------------------------------------------
// REDIRECT
// ------------------------------------------------------------
function redirectToBlock(reason) {
  const url = encodeURIComponent(location.href);
  const r = encodeURIComponent(reason);
  location.replace(browser.runtime.getURL(`block.html?reason=${r}&url=${url}`));
}

// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------
(async function () {
  const domain = normalizeDomain(location.href);
  if (!domain) return;

  if (
    location.href.startsWith("safari-extension://") ||
    location.href.startsWith("safari-web-extension://") ||
    location.href.startsWith("about:") ||
    location.href.startsWith("file://") ||
    location.href.startsWith("blob:") ||
    location.href.startsWith("data:")
  ) return;

  // Safe list — skip all checks
  if (SAFE_DOMAINS.some(safe => domain === safe || domain.endsWith(`.${safe}`))) {
    console.log(`[Web Guardian] ✅ ${domain} — safe domain, skipping`);
    return;
  }

  const stored = await getDomainStatus(domain);

  if (stored === "BLOCK") {
    redirectToBlock("This site is blocked (cached).");
    return;
  }

  if (stored === "SAFE") {
    console.log(`[Web Guardian] ✅ ${domain} — cached SAFE`);
    return;
  }

  // Fast local pre-check on domain name itself
  if (matchesKeywords(domain)) {
    redirectToBlock("Domain matches restricted keywords.");
    return;
  }

  console.log(`[Web Guardian] ✅ ${domain} — passed content script checks`);
})();
