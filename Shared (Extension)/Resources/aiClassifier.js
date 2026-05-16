//
//  aiClassifier.js
//  Web-Guardian-IOS
//
//  Created by Rafan Syed on 5/14/26.
//

// aiClassifier.js — Web Guardian Safari (ported from aiClassifier.ts)

const AI_SERVER_URL = "https://motionless-andriana-webguardian-acdbcfa6.koyeb.app";

// ------------------------------------------------------------
// CLASSIFY SEARCH QUERY
// ------------------------------------------------------------
export async function classifySearchQuery(query) {
  try {
    console.log(`[AI Classifier] Sending search query to AI: "${query}"`);

    const response = await fetch(`${AI_SERVER_URL}/classify-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      console.error(`[AI Classifier] Server error: ${response.status}`);
      return "UNKNOWN";
    }

    const data = await response.json();
    return data.classification;
  } catch (error) {
    console.error("[AI Classifier] Failed to classify search query:", error);
    return "UNKNOWN";
  }
}

// ------------------------------------------------------------
// CLASSIFY YOUTUBE SEARCH
// ------------------------------------------------------------
export async function classifyYoutubeSearchQuery(query) {
  try {
    console.log(`[Youtube Classifier] Sending search query to AI: "${query}"`);

    const response = await fetch(`${AI_SERVER_URL}/classify-youtube`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      console.error(`[Youtube Classifier] Server error: ${response.status}`);
      return "UNKNOWN";
    }

    const data = await response.json();
    return data.classification;
  } catch (error) {
    console.error("[Youtube Classifier] Failed to classify search query:", error);
    return "UNKNOWN";
  }
}

// ------------------------------------------------------------
// CLASSIFY AMAZON SEARCH
// ------------------------------------------------------------
export async function classifyAmazonSearchQuery(query) {
  try {
    console.log(`[Amazon Classifier] Sending search query to AI: "${query}"`);

    const response = await fetch(`${AI_SERVER_URL}/classify-amazon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      console.error(`[Amazon Classifier] Server error: ${response.status}`);
      return "UNKNOWN";
    }

    const data = await response.json();
    return data.classification;
  } catch (error) {
    console.error("[Amazon Classifier] Failed to classify Amazon search query:", error);
    return "UNKNOWN";
  }
}

// ------------------------------------------------------------
// PARSE URL PATH
// ------------------------------------------------------------
export async function parseURL(pathQuery) {
  try {
    const response = await fetch(`${AI_SERVER_URL}/parse-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: pathQuery }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("[URL Parser] Failed:", error);
    return null;
  }
}

// ------------------------------------------------------------
// CLASSIFY WEBSITE
// ------------------------------------------------------------
export async function classifyWebsite(domain, url, title, lastSearchQuery) {
  try {
    console.log(`[AI Classifier] Sending website to AI: ${domain}`);

    const response = await fetch(`${AI_SERVER_URL}/classify-website`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain,
        url,
        title: title || "",
        lastSearchQuery: lastSearchQuery || "",
      }),
    });

    if (!response.ok) {
      console.error(`[AI Classifier] Server error: ${response.status}`);
      return "UNKNOWN";
    }

    const data = await response.json();
    return data.classification;
  } catch (error) {
    console.error("[AI Classifier] Failed to classify website:", error);
    return "UNKNOWN";
  }
}

// ------------------------------------------------------------
// HEALTH CHECK
// ------------------------------------------------------------
export async function checkAIServerHealth() {
  try {
    const response = await fetch(`${AI_SERVER_URL}/health`, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------
// FETCH SAFE DOMAINS
// ------------------------------------------------------------
export async function fetchSafeDomains() {
  try {
    const response = await fetch(`${AI_SERVER_URL}/safe-domains`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.safeDomains;
  } catch (error) {
    console.error("[Safe Domains] Failed to fetch:", error);
    return [];
  }
}
