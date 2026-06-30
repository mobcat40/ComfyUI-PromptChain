// Background update check — event-driven, no timers (per the architecture
// rule). runUpdateCheck() fires from the extension setup() hook and on tab
// re-focus; a stored last-check timestamp throttles it to once per 24h. When an
// update is available it either silently stages it (background "always update"
// mode) or prompts. Applying an update is restart-bound: the modal/About button
// only STAGES (writes a marker); core/update_boot.py does the actual git pull at
// the next boot, before the 47MB tag-builder DB is opened/locked.

import { app } from "../../../scripts/app.js";

const LS_LAST_CHECK = "pcr-update-lastCheck";
const DAY_MS = 24 * 60 * 60 * 1000;

const SETTING_AUTO = "PromptChain.AutoUpdate";     // stage silently in the background
const SETTING_NOTIFY = "PromptChain.UpdateNotify"; // master notify; false = "never show again"

let _checkInFlight = false; // single-flight: rapid tab-switches can't stack 30s fetches

function getSetting(id, dflt) {
  try {
    const v = app.ui?.settings?.getSettingValue?.(id);
    return v === undefined ? dflt : v;
  } catch { return dflt; }
}
function setSetting(id, val) { try { app.ui?.settings?.setSettingValue?.(id, val); } catch {} }
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

function isStale() {
  const last = Number(lsGet(LS_LAST_CHECK));
  if (!Number.isFinite(last) || last <= 0) return true;   // missing/garbage → overdue
  if (last > Date.now()) return true;                      // clock skew / future → overdue
  return Date.now() - last >= DAY_MS;
}

function anyOverlayOpen() {
  return !!document.querySelector(".pcr-onboarding-overlay, .pcr-about-overlay, .pcr-update-overlay");
}

function toast(detail, severity = "info") {
  try { app.extensionManager?.toast?.add?.({ severity, summary: "PromptChain", detail, life: 8000 }); } catch {}
}

async function stageUpdate() {
  return fetch("/promptchain/system/apply-update", { method: "POST" }).then(r => r.json()).catch(() => null);
}

function restart() {
  return fetch("/promptchain/system/restart", { method: "POST" }).catch(() => {});
}

function showStagedIndicator() {
  // Passive, non-blocking — a staged update applies on the next restart.
  toast("Update ready — it'll be applied the next time you restart ComfyUI.");
}

// One funnel for every caller (auto staleness, tab-focus, the About "Check for
// updates" button via force:true). force bypasses the 24h + settings gates but
// NOT the in-flight guard.
export async function runUpdateCheck({ force = false } = {}) {
  if (_checkInFlight) return;
  if (!force) {
    const notify = getSetting(SETTING_NOTIFY, true) !== false;
    const auto = getSetting(SETTING_AUTO, false) === true;
    if (!notify && !auto) return;                                  // user disabled both
    if (!isStale()) return;
    if (document.querySelector(".pcr-onboarding-overlay")) return; // first-boot splash open
  }

  _checkInFlight = true;
  lsSet(LS_LAST_CHECK, String(Date.now())); // optimistic, before the await — can't re-enter the fetch window
  try {
    const data = await fetch("/promptchain/system/check-updates", { method: "POST" })
      .then(r => r.json()).catch(() => null);
    if (!data) {
      // Offline / server error — retry in ~1h instead of waiting the full day.
      lsSet(LS_LAST_CHECK, String(Date.now() - DAY_MS + 60 * 60 * 1000));
      return;
    }

    if (data.staged) { showStagedIndicator(); return; }  // already queued for next restart
    if (data.status !== "behind") return;                // current / unknown (offline / non-git)

    // Background "always update": stage silently, never restart on our own.
    if (getSetting(SETTING_AUTO, false) === true) {
      const res = await stageUpdate();
      if (res?.ok) showStagedIndicator();
      return;
    }

    if (!force && getSetting(SETTING_NOTIFY, true) === false) return; // hard "never show again"
    if (anyOverlayOpen()) return;                                    // don't stack on About/splash
    openUpdateModal(data);
  } finally {
    _checkInFlight = false;
  }
}

// Post-boot notice (consumed once) confirming a just-applied update or warning
// that pulled deps need a manual install.
export async function checkUpdateStatus() {
  try {
    const data = await fetch("/promptchain/system/update-status").then(r => r.json());
    if (!data || !data.applied_sha) return;
    const sha = String(data.applied_sha).slice(0, 7);
    if (data.ok && data.deps_ok) toast(`Updated to ${sha}.`);
    else if (data.ok) toast(`Updated to ${sha}, but new Python deps may need a manual "pip install -r requirements.txt".`, "warn");
    else toast(`Update failed — ${data.detail || "the previous version was kept"}.`, "warn");
  } catch {}
}

function pillBtn(label, primary) {
  const b = document.createElement("button");
  b.className = "pcr-onboarding-btn";
  b.textContent = label;
  if (!primary) b.style.cssText = "background:transparent;border:1px solid rgba(255,255,255,.2);";
  return b;
}

function textLink(label) {
  const a = document.createElement("button");
  a.textContent = label;
  a.style.cssText = "background:none;border:none;color:#3794ff;cursor:pointer;font-size:12px;padding:0;text-decoration:underline;";
  return a;
}

export function openUpdateModal(data) {
  if (document.querySelector(".pcr-update-overlay")) return;
  const n = data.behind || 0;

  const overlay = document.createElement("div");
  overlay.className = "pcr-onboarding-overlay pcr-update-overlay";

  const card = document.createElement("div");
  card.className = "pcr-onboarding-card";
  card.style.maxWidth = "460px";

  const onKey = (e) => { if (e.key === "Escape") close(); };
  function close() { window.removeEventListener("keydown", onKey); overlay.remove(); }
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
  window.addEventListener("keydown", onKey);

  const title = document.createElement("h2");
  title.className = "pcr-onboarding-toggle-title";
  title.style.cssText = "font-size:18px;margin:0 0 6px;";
  title.textContent = "PromptChain update available";

  const body = document.createElement("p");
  body.className = "pcr-onboarding-subtitle";
  body.style.cssText = "margin:0 0 18px;font-size:13px;line-height:1.5;";
  body.textContent = `${n} new commit${n === 1 ? "" : "s"} available. Updating restarts ComfyUI to apply — this interrupts any running generation and disconnects other open tabs.`;

  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:10px;align-items:center;";
  const updateBtn = pillBtn("Update now", true);
  const laterBtn = pillBtn("Later", false);

  updateBtn.addEventListener("click", async () => {
    updateBtn.disabled = true;
    updateBtn.textContent = "Staging…";
    const res = await stageUpdate();
    if (!res?.ok) {
      updateBtn.disabled = false;
      updateBtn.textContent = "Update now";
      body.textContent = res?.detail || "Couldn't stage the update.";
      return;
    }
    updateBtn.textContent = "Restarting…";
    body.textContent = "Restarting ComfyUI to apply — this page reconnects when the server is back.";
    restart();
  });
  laterBtn.addEventListener("click", close);
  row.append(updateBtn, laterBtn);

  const links = document.createElement("div");
  links.style.cssText = "display:flex;gap:16px;margin-top:16px;";
  const neverLink = textLink("Never show again");
  const autoLink = textLink("Always update in background");
  neverLink.addEventListener("click", () => { setSetting(SETTING_NOTIFY, false); close(); });
  autoLink.addEventListener("click", async () => {
    setSetting(SETTING_AUTO, true);
    close();
    const res = await stageUpdate();
    if (res?.ok) showStagedIndicator();
  });
  links.append(neverLink, autoLink);

  card.append(title, body, row, links);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

if (!window.__pcrUpdateModalListener) {
  window.__pcrUpdateModalListener = true;
  window.addEventListener("promptchain:show-update", (e) => openUpdateModal(e?.detail || {}));
}
