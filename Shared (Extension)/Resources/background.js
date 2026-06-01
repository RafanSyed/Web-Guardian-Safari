// background.js — Web Guardian Safari

import { normalizeDomain, getDomainStatus, setDomainStatus, checkAndResetCacheIfNewMonth } from "./domainDB.js";
import { classifyWebsite, classifySearchQuery, checkAIServerHealth, parseURL, fetchSafeDomains, classifyYoutubeVideo } from "./aiClassifier.js";

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


// ------------------------------------------------------------
// Bad Keyword Lists
// ------------------------------------------------------------
const KEYWORDS = [
  // === MANGA/READING CONTENT ===
  "manga", "manhwa", "manhua", "webtoon", "scanlation", "scanlations",
  "scanlator", "read manga", "read manhwa", "read manhua", "read webtoon", "toon", "anime",
  "mangadex", "mangakakalot", "manganato", "mangafreak", "mangahere",
  "mangafox", "mangapanda", "mangastream", "kissmanga", "readmanga",
  "mangareader", "manganelo", "mangapark", "bato.to", "batoto",
  "dynasty-scans", "webtoons.com", "tapas.io", "lezhin", "tappytoon",
  "pocket comics", "raw manga", "raw scan", "manhwa raw",
  "webtoon raw", "translated manga", "doujin",
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
  "swimsuit", "bathing suit", "sports bra", "crop top",
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
  "doujin", "doujinshi", "scanlation", "ecchi", "yaoi",
  "yuri", "anime", "thirst trap", "discord nsfw", "r/gonewild",
  "r/nsfw", "bikini try on", "lingerie try on", "upskirt",
  "downblouse", "nip slip", "camel toe", "topless", "braless",
  "twerking", "striptease", "doggy style", "boudoir",
  "literotica", "erotic fiction", "erotic novel", "smut",
  "adult chat", "sex chat", "phone sex", "cyber sex",
  "dick pic", "send nudes", "fuck", "fucked", "fucking",
  "cocksucker", "motherfucker", "desire"
]);

const YOUTUBE_BLOCK_KEYWORDS = new Set([
  // === ANIME / MANGA TROPES ===
  "isekai", "manga", "manhwa", "manhua", "webtoon", "anime", "waifu", "husbando",
  "yandere", "tsundere", "kuudere", "dandere", "deredere", "loli", "shonen",
  "shoujo", "seinen", "josei", "ecchi", "harem", "reverse harem", "omegaverse",
  "reborn", "rebirth", "reincarnated", "reincarnation", "another world",
  "transported to another world", "summoned to another world", "overpowered",
  "op mc", "cultivation", "system notification", "level up", "dungeon",
  "demon lord", "hero", "villain protagonist", "villainess", "otome",
  "childhood friend", "childhood crush", "first love", "unrequited love",
  "goddess", "god of", "divine", "sacred",

  // === ROMANCE / RELATIONSHIP ===
  "romance", "romantic", "romcom", "rom com", "love story", "love interest",
  "girlfriend", "boyfriend", "situationship", "talking stage", "dating",
  "crush", "jealous", "jealousy", "possessive", "obsessed with me",
  "fell for me", "falls for me", "in love with", "confess", "confession",
  "rejected", "heartbreak", "breakup", "get him back", "get her back",
  "make him jealous", "make her jealous", "toxic relationship", "toxic love",
  "forbidden love", "secret relationship", "fake dating", "fake relationship",
  "enemies to lovers", "strangers to lovers", "forced proximity",
  "age gap", "older man", "younger woman", "sugar",

  // === BRAINROT / VIRAL ===
  "challenge", "big bank", "body challenge", "silhouette challenge",
  "rizz", "rizzing", "rizzed", "unspoken rizz", "sigma", "alpha male",
  "alpha female", "gigachad", "chad", "based", "slay", "no cap",
  "bussin", "understood the assignment", "main character", "POV",
  "storytime", "story time", "exposing", "exposed", "drama",
  "tea", "spilling tea", "receipts", "beef", "cancelled", "cancel",
  "glow up", "transformation", "rate me", "rating",

  // === GOONING / ADDICTION ===
  "gooning", "goon", "gooner", "edging", "brain rot", "brainrot",
  "dopamine", "addicted", "can't stop", "hours later", "3am",
  "you won't believe", "i can't stop watching", "satisfying",
  "oddly satisfying", "mindless", "binge",

  // === CLICKBAIT / RABBIT HOLE ===
  "insane body", "unbelievable body",
  "gone sexual", "exposed",

  // === THIRST / APPEARANCE FOCUSED ===
  "hottest", "sexiest", "most attractive", "body type", "body check",
  "body reveal", "weight loss reveal", "before and after body",
  "thirst trap", "e-girl", "egirl", "soft girl", "baddie",
  "instagram model", "tiktok famous", "only fans", "onlyfans",
  "gym crush", "gym thirst", "locker room",

  // === MUSIC / DANCE (PROBLEMATIC) ===
  "twerk", "twerking", "dance challenge", "WAP", "body ody",
  "freaky", "freak", "nasty", "dirty dancing", "lap dance",
  "strip", "pole dance", "grinding", "booty",

  // === GAMING ADJACENT ===
  "waifu game", "dating sim", "visual novel", "gacha", "gacha life",
  "gacha club", "gacha heat", "yandere simulator", "dress up game",
  "character creator romance",

  // === REACTION / COMMENTARY BAIT ===
  "reacting to hot", "rating hot", "thirst ranking", "attractive ranking",
  "hottest characters", "best looking", "most beautiful",
  "prettiest", "most handsome", "eye candy",
]);


// --------------------------------------------
// YOUTUBE SAFE CHANNELS
// --------------------------------------------
const SAFE_YOUTUBE_CHANNELS = new Set([
  "Masjid DarusSalam",
  "JudeLow",
  "GrandLineReview",
  "AyoLaxzone",
  "The Irish Guy",
  "W2S+",
  "LucasTracyMMA",
  "DakarsWRLD",
  "Big Gibber",
  "Chuck Nasty",
  "VIDDAL",
  "Morj Unleashed",
  "Beast Philanthropy",
  "Sacred Chronicles",
  "FORMULA 1",
  "Code Blue Cam",
  "P1 with Matt & Tommy",
  "Wildez",
  "ish",
  "Joe Bartolozzi",
  "Abdul Respond",
  "Mohammed Hijab",
  "Behzinga",
  "SYFEtalk",
  "MrBeast Gaming",
  "ManyProphetsOneMessage",
  "Ali Dawah",
  "stampylongnose",
  "Uncovered",
  "fern",
  "EvenMoreSidemen",
  "Towards Eternity",
  "ChrisMD",
  "OnePath Network",
  "nigahiga",
  "Danny Gonzalez",
  "Anton is here",
  "Dream",
  "Rick'sF1Addiction",
  "Miniminter",
  "MrBeast",
  "FNG",
  "Yeah Jaron",
  "jacksepticeye",
  "Hei Reacts",
  "NeetCode",
  "iBallisticSquid",
  "Kufah Official",
  "Midwest Safety",
  "Max Fosh",
  "Niko Omilana",
  "Joe Bart Games",
  "Smile 2 Jannah",
  "Deenresponds",
  "Aman Manazir",
  "AnEsonGib",
  "DreamXD",
  "Watcher",
  "stampylonghead",
  "MM7Games",
  "Quran Majeed App",
  "Spoke",
  "Mxngo",
  "Wemmbu",
  "Morj Chapter Reviews",
  "Kufah DIS",
  "DrDonut Clips",
  "Adnan Rashid",
  "DC Dawah",
  "Dawah Over Dunya",
  "OfficeHanchoBoxing",
  "Propa Boxing",
  "Fireship",
  "SpeedSilver",
  "SunnyV2",
  "rekrap1",
  "TalkFCB",
  "Reading Crow",
  "Mr Morj",
  "rekrap2",
  "Vikkstar123",
  "F1 News - TacticalRab",
  "Formula 1 clipz",
  "Poofesure",
  "Hibou 3HD",
  "Kr1s",
  "GeorgeNotFound",
  "Sapnap",
  "BadBoyHalo",
  "ParrotX2",
  "FlameFragsMC",
  "Skeppy",
  "EWUBodycam",
  "Zac-Rios",
  "yaqeeninstituteofficial",
  "ScaryInteresting",
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

function matchesYoutubeKeywordSmart(text) {
  if (!text) return null;
  const normalized = normalizeText(text);

  // 1. Hard blocks first
  for (const kw of HARD_BLOCK_KEYWORDS) {
    const normKw = normalizeText(kw);
    const regex = new RegExp(`(?<![a-z0-9])${escapeRegex(normKw)}(?![a-z0-9])`, "i");
    if (regex.test(normalized)) return kw;
  }

  // 2. YouTube-specific keywords
  for (const kw of YOUTUBE_BLOCK_KEYWORDS) {
    const normKw = normalizeText(kw);
    const regex = new RegExp(`(?<![a-z0-9])${escapeRegex(normKw)}(?![a-z0-9])`, "i");
    if (regex.test(normalized)) return kw;
  }

  // 3. General keywords as fallback
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

  if (blockHitsThisWindow >= 100) {
    lockdownUntil = now + (30 * 60 * 1000); // 30 Minute Lock
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

  const split = splitUrl(url);
  if (!split) return;
  const { rootDomain, pathQuery } = split;

  // ── 1. PRIORITIZED YOUTUBE VIDEO EVALUATION ──────────────────
  // Evaluated before safelists to allow the home page while checking specific videos
if (rootDomain === "youtube.com" || rootDomain === "m.youtube.com") {
    const watchIndex = pathQuery?.indexOf("watch?v=");
    if (watchIndex !== undefined && watchIndex !== -1) {
      const videoId = pathQuery.slice(watchIndex + 8, watchIndex + 19);
      const flightKey = `${tabId}:yt:${videoId}`;
      if (!inFlightDomains.has(flightKey)) {
        inFlightDomains.add(flightKey);
        try {
          const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
          const data = await res.json();

          if (!res.ok || data.error) {
            console.log(`[Web Guardian] 🚫 YouTube video ${videoId} — restricted/unavailable, blocking`);
            await redirectOnce(tabId, buildBlockUrl("Video unavailable or age-restricted", url));
            return;
          }

          const title = data.title ?? "";
          const author = data.author_name ?? "";
          console.log(`[Web Guardian] 🎬 YouTube title: "${title}"`);
          console.log(`[Web Guardian] 🎬 YouTube author: "${author}"`);

          if (SAFE_YOUTUBE_CHANNELS.has(author)) {
            console.log(`[Web Guardian] ✅ YouTube — trusted channel: "${author}"`);
            return;
          }

          const kwMatch = matchesYoutubeKeywordSmart(title);
          if (kwMatch) {
            console.log(`[Web Guardian] 🚫 YouTube title matched keyword: "${kwMatch}"`);
            await redirectOnce(tabId, buildBlockUrl(`Video title matched: ${kwMatch}`, url));
            await recordBlockHit();
            return;
          }

          const aiResult = await classifyYoutubeVideo(title);
          if (aiResult === "BLOCK") {
            console.log(`[Web Guardian] 🚫 YouTube video blocked by AI — "${title}"`);
            await redirectOnce(tabId, buildBlockUrl("AI blocked video content", url));
            await recordBlockHit();
            return;
          }
        } finally {
          inFlightDomains.delete(flightKey);
        }
      }
      return;
    }
  }

  // ── 2. SEARCH PAGES ──────────────────────────────────────────
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

  // ── 3. STANDARD WEBSITE VISITS ───────────────────────────────
  // A. Safe list Check
  if (isSafeDomain(rootDomain)) {
    console.log(`[Web Guardian] 🛡️ ${rootDomain} — safe list match`);
    const cached = await getDomainStatus(rootDomain);
    if (cached === "BLOCK") {
      await setDomainStatus(rootDomain, "SAFE");
    }
    return;
  }

  // B. Storage Check
  const cachedStatus = await getDomainStatus(rootDomain);
  if (cachedStatus === "BLOCK") {
    console.log(`[Web Guardian] 🚫 ${rootDomain} — Found direct BLOCK in cache`);
    await redirectOnce(tabId, buildBlockUrl("Cached BLOCK", url));
    await recordBlockHit();
    return;
  }

  // C. Fallback AI / Domain Eval
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

  // D. Detailed Path Evaluation (non-YouTube paths)
  if (pathQuery) {
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

// Runtime Message Listener to capture dynamic single-page content script shifts
browser.runtime.onMessage.addListener((message, sender) => {
  if (message.action === "evaluateYoutubeUrl" && sender.tab && sender.tab.id) {
    console.log(`[Web Guardian] 🔄 Intercepted SPA navigation via Content Script message: ${message.url}`);
    handleMainFrameUrl(sender.tab.id, message.url);
  }
});

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
