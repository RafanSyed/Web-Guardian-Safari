//
//  block.js
//  Web-Guardian-IOS
//
//  Created by Rafan Syed on 5/14/26.
//

// block.js — Web Guardian Safari

const params    = new URLSearchParams(location.search);
const rawReason = (params.get("reason") || "").toLowerCase();

const msgEl  = document.getElementById("reason-msg");
const chipEl = document.getElementById("keyword-chip");

if (rawReason.includes("keyword")) {
  const match   = rawReason.match(/keyword[:\s]+(.+)$/i);
  const keyword = match ? match[1].trim() : null;

  msgEl.textContent = "This content was blocked because it matched a restricted keyword.";

  if (keyword && chipEl) {
    chipEl.textContent   = keyword;
    chipEl.style.display = "inline-block";
  }

} else if (rawReason.includes("youtube")) {
  msgEl.textContent = "This YouTube search contains restricted content.";

} else if (rawReason.includes("amazon")) {
  msgEl.textContent = "This Amazon search contains restricted content.";

} else if (rawReason.includes("cached")) {
  msgEl.textContent = "This site has been previously identified as restricted content.";

} else if (rawReason.includes("domain")) {
  msgEl.textContent = "This website has been identified as restricted content.";

} else if (rawReason.includes("ai") || rawReason.includes("path")) {
  msgEl.textContent = "This content was reviewed and blocked by Web Guardian's AI filter.";

} else {
  msgEl.textContent = "This page has been blocked by Web Guardian.";
}

// History trap
history.replaceState(null, "", location.href);
history.pushState(null, "", location.href);
window.addEventListener("popstate", () => {
  history.pushState(null, "", location.href);
});
