// background.js — Web Guardian Safari

import { normalizeDomain, getDomainStatus, setDomainStatus, checkAndResetCacheIfNewMonth } from "./domainDB.js";
import { classifyWebsite, classifySearchQuery, checkAIServerHealth, parseURL, fetchSafeDomains } from "./aiClassifier.js";

// ------------------------------------------------------------
// IN-FLIGHT DEDUP
// ------------------------------------------------------------
const inFlightSearches = new Set();
const inFlightDomains = new Set();

// ------------------------------------------------------------
// LOCKDOWN CONFIGURATION
// ------------------------------------------------------------
let blockHitsThisWindow = 0;
let currentWindowMinute = -1;
let lockdownUntil = 0;

// ------------------------------------------------------------
// SAFE DOMAINS
// ------------------------------------------------------------
let SAFE_DOMAINS = [];
let safeDomainsLoaded = false;
let safeDomainsPromise = null;

(async () => {
  const cached = await browser.storage.local.get("safeDomains");
  if (Array.isArray(cached.safeDomains)) {
    SAFE_DOMAINS = cached.safeDomains;
    safeDomainsLoaded = true;
    console.log(`[Web Guardian] ⚡ Preloaded cached safe domains (${SAFE_DOMAINS.length})`);
  }
})();

async function reconcileSafeDomainsWithCache() {
  for (const domain of SAFE_DOMAINS) {
    const cached = await getDomainStatus(domain);
    if (cached === "BLOCK") {
      console.log(`[Web Guardian] ♻️ ${domain} was BLOCK in storage but is in safe list — resetting to SAFE`);
      await setDomainStatus(domain, "SAFE");
    }
  }
}

function ensureSafeDomainsLoaded() {
  if (!safeDomainsPromise) {
    safeDomainsPromise = (async () => {
      try {
        const domains = await fetchSafeDomains();
        if (domains.length > 0) {
          SAFE_DOMAINS = domains;
          await browser.storage.local.set({ safeDomains: SAFE_DOMAINS });
          await reconcileSafeDomainsWithCache();
          console.log(`[Web Guardian] ✅ Loaded ${SAFE_DOMAINS.length} safe domains`);
        }
      } catch (e) {
        console.error("[Web Guardian] ❌ Failed to load safe domains", e);
        const cached = await browser.storage.local.get("safeDomains");
        if (Array.isArray(cached.safeDomains)) {
          SAFE_DOMAINS = cached.safeDomains;
          console.log(`[Web Guardian] ⚠️ Using cached safe domains (${SAFE_DOMAINS.length})`);
        }
      } finally {
        safeDomainsLoaded = true;
      }
    })();
  }
  return safeDomainsPromise;
}

const KEYWORDS = [
  // === MANGA/READING CONTENT ===
  "manga", "manhwa", "manhua", "webtoon", "scanlation", "scanlations",
  "scanlator", "read manga", "read manhwa", "read manhua", "read webtoon", "toon", "anime",
  "mangadex", "mangakakalot", "manganato", "mangafreak", "mangahere",
  "mangafox", "mangapanda", "mangastream", "kissmanga", "readmanga",
  "mangareader", "manganelo", "mangapark", "bato.to", "batoto",
  "dynasty-scans", "webtoons.com", "tapas.io", "lezhin", "tappytoon",
  "pocket comics", "raw manga", "raw chapter", "raw scan", "manhwa raw",
  "webtoon raw", "translated manga", "fan translation", "doujin",
  "doujinshi", "doujins", "hentai", "hentai manga", "ecchi", "seinen",
  "josei", "shoujo", "shonen", "bl manga", "yaoi", "yuri", "smut manga",
  "adult manga", "mature manga", "r18 manga", "18+ manga",
  // === EXPLICIT/ADULT TERMS ===
  "porn", "porno", "pornography", "pornographic", "xxx", "xxx videos",
  "adult content", "adult videos", "adult films", "nsfw", "not safe for work",
  "r18", "r-18", "18plus", "18+", "21+", "adults only", "mature content",
  "explicit content", "graphic content",
  // === SEXUAL ACTS ===
  "sex", "sexual", "intercourse", "coitus", "fornication", "anal sex",
  "oral sex", "blowjob", "blow job", "fellatio", "cunnilingus", "handjob",
  "hand job", "footjob", "foot job", "titjob", "tit job", "sixty nine",
  "threesome", "3some", "foursome", "4some", "gangbang", "gang bang",
  "orgy", "orgies", "bukkake", "creampie", "cream pie", "cumshot",
  "cum shot", "money shot", "double penetration", "fisting", "fingering",
  "rimming", "rimjob", "rim job", "anilingus", "pegging", "edging",
  "gooning", "tribbing", "scissoring",
  // === BODY PARTS (EXPLICIT) ===
  "penis", "penises", "cock", "cocks", "dick", "dicks", "schlong", "dong",
  "pecker", "vagina", "vaginas", "pussy", "pussies", "cunt", "vulva",
  "labia", "clit", "clitoris", "asshole", "butthole", "breasts", "boobs",
  "boob", "tits", "tit", "titties", "titty", "knockers", "jugs", "melons",
  "hooters", "nipples", "nipple", "areola", "areolas", "testicles",
  "scrotum", "badonkadonk",
  // === SLANG/VULGAR ===
  "cum", "cumming", "jizz", "ejaculate", "ejaculation", "semen", "sperm",
  "precum", "squirt", "squirting", "gushing", "orgasm", "orgasms",
  "climax", "climaxing", "masturbate", "masturbation", "masturbating",
  "jerk off", "jerking off", "jacking off", "wank", "wanking",
  "horny", "aroused", "erection", "boner", "throbbing", "hot women",
  "hot girls", "hot girl",
  // === FETISH/KINK ===
  "fetish", "fetishes", "kink", "kinky", "bdsm", "bondage", "dominance",
  "submission", "sadism", "masochism", "tied up", "rope play", "shibari",
  "handcuffs", "restraints", "gagged", "blindfolded", "whipping",
  "spanking", "paddling", "caning", "flogging", "riding crop",
  "dildo", "dildos", "vibrator", "vibrators", "sex toy", "sex toys",
  "butt plug", "buttplug", "anal beads", "cock ring", "strap-on",
  "strapon", "fleshlight", "foot worship", "voyeur", "voyeurism",
  "exhibitionism", "public sex", "gloryhole", "swinging", "swingers",
  "cuckold", "cuckolding", "hotwife", "chastity", "breathplay", "choking",
  // === TABOO/ILLEGAL ===
  "incest", "stepmom", "step mom", "stepdad", "step dad", "stepsis",
  "stepsister", "stepbrother", "stepmother", "stepfather", "family sex",
  "daddy kink", "loli", "lolita", "lolicon", "shota", "shotacon",
  "jailbait", "teen sex", "teenage sex", "barely legal", "rape", "raped",
  "non-consent", "date rape", "bestiality", "zoophilia", "animal sex",
  // === SEX WORK ===
  "prostitute", "prostitution", "hooker", "call girl", "escort service",
  "happy ending", "stripper", "strip club", "exotic dancer", "lap dance",
  "brothel", "red light district", "sex worker", "sex work", "onlyfans",
  "only fans", "fansly", "cam girl", "cam boy", "camgirl", "camboy",
  "webcam model", "chaturbate", "myfreecams", "livejasmin", "stripchat",
  // === DATING/HOOKUP ===
  "hookup", "hook up", "one night stand", "casual sex", "booty call",
  "fuck buddy", "fuckbuddy", "friends with benefits", "sugar daddy",
  "sugar baby", "seeking arrangement", "grindr", "sniffies",
  // === SLANG DESCRIPTORS ===
  "slut", "slutty", "whore", "thot", "nympho", "nymphomaniac", "milf",
  "dilf", "fuckboy", "seductress", "temptress",
  // === EROTIC/ROMANTIC ===
  "erotic", "erotica", "sensual", "seductive", "seduction", "sultry",
  "steamy", "lust", "lustful", "taboo", "naughty", "lewd", "obscene",
  "indecent", "raunchy", "salacious", "licentious", "lascivious", "carnal",
  // === CLOTHING (REVEALING) ===
  "nudity", "nudist", "nudes", "nude", "naked", "lingerie", "panties",
  "thong", "g-string", "corset", "bustier", "babydoll", "chemise",
  "negligee", "garter belt", "fishnets", "thong bikini", "micro bikini",
  "string bikini", "monokini", "see through", "seethrough", "see-through",
  "camel toe", "cameltoe", "nip slip", "nipslip", "wardrobe malfunction",
  "upskirt", "downblouse", "bikini try on", "swimsuit try on",
  "lingerie try on", "braless", "no panties", "pokies", "topless",
  // === ACTIONS/POSES ===
  "twerk", "twerking", "pole dance", "striptease", "strip tease",
  "doggy style", "doggystyle", "oiled up", "making out",
  "groping", "fondling",
  // === ART/MEDIA ===
  "nude art", "nude painting", "nude sculpture", "erotic art",
  "boudoir", "boudoir photography", "literotica", "erotic fiction",
  "erotic novel", "smut", "smutty", "omegaverse", "breeding",
  "impregnation", "pregnancy kink",
  // === ADULT PLATFORMS ===
  "nhentai", "hitomi.la", "tsumino", "hentai haven", "hanime",
  "hentaigasm", "simply hentai", "gelbooru", "danbooru", "sankaku",
  "e621", "f95zone", "rule34", "rule 34", "ahegao",
  "leaked nudes", "nude leak", "celebrity nudes", "revenge porn",
  "thirst trap", "thirsttrap",
  // === MISC SEXUAL ===
  "cocksucker", "motherfucker", "fuck", "fucked", "fucking",
  "banging", "screwing", "nailing", "pounding", "smashing", "railing",
  "drilling", "dicking", "dick pic", "dickpic", "send nudes",
  "sexting", "phone sex", "cyber sex", "sex chat", "adult chat",
  "discord nsfw", "reddit gonewild", "r/gonewild", "r/nsfw",
];

const KEYWORD_EXCEPTIONS = new Set([
  "ass", "hard", "wet", "raw", "grind", "oil", "rub", "lace",
  "silk", "satin", "mesh", "tights", "bra", "abs", "gains",
  "peach", "toned", "ripped", "thick", "curves", "spread",
  "flexible", "split", "splits", "bedroom", "kissing", "touching",
  "sucking", "biting", "licking", "squeeze", "squeezing",
  "art", "artwork", "museum", "gallery", "galleries", "sculpture",
  "sculptures", "statue", "statues", "fine art", "classical art",
  "modern art", "contemporary art", "spicy", "dark romance",
  "forbidden", "savage", "beast", "beastly", "heat", "mating",
  "breeding", "rut", "pov", "amateur", "homemade", "influencer",
  "swimsuit", "bathing suit", "one piece", "sports bra", "crop top",
  "leggings", "yoga pants", "spandex", "bodysuit", "bikini",
  "try on haul", "try-on haul", "clothing haul", "outfit reveal",
  "dress reveal", "shirtless", "backless", "cleavage", "big",
  "fat", "small", "tight", "short", "slave", "sub", "dom",
  "master", "mistress", "collar", "leash", "chain", "cuff",
  "gag", "rubber", "leather", "latex", "pvc", "forced",
  "daddy", "mommy", "submission", "discipline", "dominance",
  "oral", "anal", "dp", "facial", "load", "nut", "rod",
  "shaft", "member", "johnson", "rack", "cheeks", "bum",
  "buns", "rump", "posterior", "backside", "balls", "nuts", "sack",
  "moist", "dripping", "stroke", "stroking", "flick", "flicking",
  "erect", "stiff", "arousal", "desire", "longing", "yearning",
  "temptation", "passionate", "intimate", "intimacy", "sensual",
  "suggestive", "provocative", "titillating", "scandalous", "risque",
  "vulgar", "crude", "indecent", "dirty", "filthy", "naughty",
  "taboo", "forbidden", "carnal", "primal", "raw", "savage",
  "escort", "massage parlor", "private dance", "gentleman", "pimp",
  "discreet", "affair", "cheating", "fling", "player", "stud",
  "stallion", "cougar", "zaddy", "snack", "bombshell", "vixen",
  "curvy", "voluptuous", "busty", "slim", "petite", "toned",
  "shredded", "jacked", "swole", "v-line", "thigh gap", "hip dips",
  "love handles", "muffin top", "dad bod", "mom bod",
  "downward dog", "bridge pose", "on knees", "kneeling", "crawling",
  "on bed", "in bed", "bathtub", "wet body", "oil", "oiled",
  "licking", "biting", "neck kiss", "hickey", "love bite",
  "grabbing", "caressing", "groping", "fondling",
  "romance novel", "adult novel", "booktok", "spicy book",
  "mafia romance", "bully romance", "enemies to lovers",
  "age gap romance", "reverse harem", "why choose",
  "alpha omega", "omegaverse",
  "homemade", "real amateur", "point of view",
  "mirror selfie", "bathroom selfie", "ig model",
  "instagram model", "tiktok", "egirl", "eboy", "uwu",
  "bang", "banging", "banged", "screw", "screwing", "nail",
  "nailing", "pound", "pounding", "smash", "smashing", "rail",
  "railing", "drill", "drilling", "pipe", "piping", "clap", "clapping",
  "hit", "hitting", "kik", "wickr",
]);

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
// ------------------------------------------------------------
// SMART KEYWORD MATCHING
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
      (h === "www.google.com" || h === "google.com") && u.pathname === "/search" ||
      (h === "www.bing.com" || h === "bing.com") && u.pathname === "/search"
    );
  } catch { return false; }
}

function getSearchQuery(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("google.") || u.hostname.includes("bing.com")) {
      return u.searchParams.get("q") ?? "";
    }
    return "";
  } catch { return ""; }
}

function splitUrl(url) {
  try {
    const u = new URL(url);
    const rootDomain = normalizeDomain(url);
    const pathQuery = (u.pathname.replace(/^\//, "") + (u.search ?? "")).trim();
    return { rootDomain, pathQuery };
  } catch { return null; }
}

function isSafeDomain(domain) {
  return SAFE_DOMAINS.some(safe => domain === safe || domain.endsWith(`.${safe}`));
}

// ------------------------------------------------------------
// REDIRECT & LOCKDOWN TRACKING
// ------------------------------------------------------------
const recentlyBlocked = new Map();
const RECENT_BLOCK_MS = 3000;

async function redirectOnce(tabId, targetUrl) {
  const now = Date.now();
  const prev = recentlyBlocked.get(tabId);
  if (prev && prev.url === targetUrl && now - prev.ts < RECENT_BLOCK_MS) return;
  recentlyBlocked.set(tabId, { url: targetUrl, ts: now });
  browser.tabs.update(tabId, { url: targetUrl });
}

function buildBlockUrl(reason, originalUrl) {
  return browser.runtime.getURL(
    `block.html?reason=${encodeURIComponent(reason)}&url=${encodeURIComponent(originalUrl)}`
  );
}

async function recordBlockHit() {
  const now = Date.now();
  const thisMinute = Math.floor(now / 60_000);

  if (thisMinute !== currentWindowMinute) {
    currentWindowMinute = thisMinute;
    blockHitsThisWindow = 0;
  }

  blockHitsThisWindow++;
  console.log(`[Web Guardian] 📊 Block hits this minute: ${blockHitsThisWindow}/3`);

  if (blockHitsThisWindow >= 3) {
    lockdownUntil = now + (0.5 * 60 * 1000); // 30 Minute Lock
    await browser.storage.local.set({ lockdownUntil });
    blockHitsThisWindow = 0;
    currentWindowMinute = -1;
    console.log("[Web Guardian] 🔒 LOCKDOWN MODE TRIGGERED");

    // Clear all existing open screens instantly down to the testing page
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && !isBlockPage(tab.url || "")) {
        browser.tabs.update(tab.id, { url: browser.runtime.getURL("testing-block.html") });
      }
    }
  }
}

// ------------------------------------------------------------
// MAIN HANDLER
// ------------------------------------------------------------
async function handleMainFrameUrl(tabId, url) {
  const now = Date.now();

  // 🔓 Auto-clear expired lockdown state
  if (lockdownUntil && now >= lockdownUntil) {
    lockdownUntil = 0;
    await browser.storage.local.remove("lockdownUntil");
    console.log("[Web Guardian] 🔓 Lockdown expired");
  }

  // 🔒 Active lockdown → Intercept everything completely
  if (now < lockdownUntil) {
    console.log("[Web Guardian] 🔒 In LOCKDOWN MODE");
    await redirectOnce(tabId, browser.runtime.getURL("testing-block.html"));
    return;
  }

  // ── GATES ──────────────────────────────────────────────────
  if (!url || isBlockPage(url) || isSafariInternal(url)) return;
  await ensureSafeDomainsLoaded();

  // ── SEARCH PAGES ────────────────────────────────────────────
  if (isSearchUrl(url)) {
    const query = getSearchQuery(url);
    if (!query) return;

    const kwMatch = matchesKeywordSmart(query);
    if (kwMatch) {
      console.log(`[Web Guardian] 🚫 Search blocked — keyword: "${kwMatch}"`);
      await redirectOnce(tabId, buildBlockUrl(`Search matched keyword: ${kwMatch}`, url));
      await recordBlockHit();
      return;
    }

    const flightKey = `${tabId}:${query}`;
    if (inFlightSearches.has(flightKey)) return;
    inFlightSearches.add(flightKey);

    try {
      const aiResult = await classifySearchQuery(query);
      if (aiResult === "BLOCK") {
        await redirectOnce(tabId, buildBlockUrl("AI blocked search", url));
        await recordBlockHit();
        return;
      }
    } finally {
      inFlightSearches.delete(flightKey);
    }
    return;
  }

  // ── WEBSITE VISIT ────────────────────────────────────────────
  const split = splitUrl(url);
  if (!split) return;

  const { rootDomain, pathQuery } = split;

  // 1. Safe list Check
  if (isSafeDomain(rootDomain)) {
    console.log(`[Web Guardian] 🛡️ ${rootDomain} — safe list match`);
    const cached = await getDomainStatus(rootDomain);
    if (cached === "BLOCK") {
      await setDomainStatus(rootDomain, "SAFE");
    }
    return;
  }

  // 2. Storage Check
  const cachedStatus = await getDomainStatus(rootDomain);
  if (cachedStatus === "BLOCK") {
    console.log(`[Web Guardian] 🚫 ${rootDomain} — Found direct BLOCK in cache`);
    await redirectOnce(tabId, buildBlockUrl("Cached BLOCK", url));
    await recordBlockHit();
    return;
  }

  // 3. Fallback AI / Domain Eval
  if (cachedStatus !== "SAFE") {
    const flightKey = `${tabId}:${rootDomain}`;
    if (inFlightDomains.has(flightKey)) return;
    inFlightDomains.add(flightKey);

    try {
      const domainResult = await classifyWebsite(rootDomain, url, undefined);
      if (domainResult === "BLOCK") {
        await setDomainStatus(rootDomain, "BLOCK");
        await redirectOnce(tabId, buildBlockUrl("AI classified this domain as restricted", url));
        await recordBlockHit();
        return;
      }
      await setDomainStatus(rootDomain, "SAFE");
    } finally {
      inFlightDomains.delete(flightKey);
    }
  }

  // 4. Detailed Path Evaluation
  if (pathQuery && !(rootDomain === "youtube.com" && pathQuery.includes("watch?v="))) {
    const pathResult = await parseURL(pathQuery);
    if (pathResult?.classification === "BLOCK") {
      console.log(`[Web Guardian] 🚫 ${rootDomain} — path content flagged`);
      await redirectOnce(tabId, buildBlockUrl("AI blocked URL path content", url));
      await recordBlockHit();
      return;
    }
  }
}

// ------------------------------------------------------------
// EVENT LISTENERS
// ------------------------------------------------------------
function shouldHandle(details) {
  return details.frameId === 0 && details.tabId !== -1 && typeof details.url === "string";
}

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const targetedUrl = changeInfo.url || tab.url;
  if (targetedUrl && !isBlockPage(targetedUrl)) {
    handleMainFrameUrl(tabId, targetedUrl);
  }
});

if (typeof browser.webNavigation !== "undefined") {
  browser.webNavigation.onBeforeNavigate.addListener(d => { if (shouldHandle(d)) handleMainFrameUrl(d.tabId, d.url); });
  browser.webNavigation.onCommitted.addListener(d => { if (shouldHandle(d)) handleMainFrameUrl(d.tabId, d.url); });
}

// ------------------------------------------------------------
// INIT
// ------------------------------------------------------------
checkAIServerHealth().then(ok =>
  console.log(ok ? "[Web Guardian] ✅ AI server connected" : "[Web Guardian] ⚠️ AI server offline")
);

checkAndResetCacheIfNewMonth();
ensureSafeDomainsLoaded();

// Restore persistent lockdown configuration states across background reloads
(async () => {
  const result = await browser.storage.local.get("lockdownUntil");
  if (typeof result.lockdownUntil === "number") {
    lockdownUntil = result.lockdownUntil;
    console.log("[Web Guardian] 🔁 Restored lockdownUntil:", lockdownUntil);
  }
})();

setInterval(() => {
  safeDomainsLoaded = false;
  safeDomainsPromise = null;
  ensureSafeDomainsLoaded();
}, 60 * 1000);

setInterval(() => {
  const now = Date.now();
  for (const [tabId, entry] of recentlyBlocked) {
    if (now - entry.ts > 30_000) recentlyBlocked.delete(tabId);
  }
}, 30_000);
