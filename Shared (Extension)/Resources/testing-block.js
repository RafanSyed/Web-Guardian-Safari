const countdownEl = document.getElementById("countdown");
const captionEl = document.getElementById("countdown-caption");

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

async function tick() {
  const result = await browser.storage.local.get("lockdownUntil");
  const lockdownUntil = typeof result.lockdownUntil === "number" ? result.lockdownUntil : 0;
  const remaining = lockdownUntil - Date.now();

  if (remaining <= 0) {
    if (countdownEl) countdownEl.textContent = "00:00";
    if (captionEl) captionEl.textContent = "Lockdown cleared — reload to continue";
    clearInterval(intervalId);
    return;
  }

  if (countdownEl) countdownEl.textContent = formatTime(remaining);
  if (captionEl) captionEl.textContent = "Counting down to release";
}

tick();
const intervalId = setInterval(tick, 1000);