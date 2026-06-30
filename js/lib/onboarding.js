// Onboarding splash — shown once on first boot.
//   Step 1: setup — settings toggles + CivitAI key.
//   Step 2: install features now, or skip (each feature self-installs on first use).
//   Step 3: feature checklist — installs each chosen pack one by one, with live
//           per-row progress + a streaming log so the user always sees activity.

import { app } from "../../../scripts/app.js";
import { renderAiSetting } from "./settings/ai-setting.js";

let _splashShown = false;

export async function checkOnboarding() {
  if (_splashShown) return;
  try {
    const res = await fetch("/promptchain/onboarding/status");
    const data = await res.json();
    if (data.onboarded) return;
  } catch {
    return;
  }
  _splashShown = true;
  showSplash();
}

// Standalone AI-setup modal — same provider chooser as Settings, surfaced
// when the AI Assistant (experimental, off by default) opens with nothing
// configured. This is the ONLY guided entry into AI setup now that the
// onboarding splash no longer has an AI screen.
// Fired via the `promptchain:show-ai-setup` event so the Svelte panel doesn't
// import vanilla modules across the bundle boundary.
export function showAiSetupModal() {
  if (document.querySelector(".pcr-ai-setup-overlay")) return;

  const overlay = document.createElement("div");
  overlay.className = "pcr-onboarding-overlay pcr-ai-setup-overlay";

  const card = document.createElement("div");
  card.className = "pcr-onboarding-card";
  card.style.maxWidth = "560px";

  const title = document.createElement("h2");
  title.className = "pcr-onboarding-toggle-title";
  title.style.cssText = "font-size:18px;margin:0 0 4px;";
  title.textContent = "🪄 Set up the AI Assistant";
  card.appendChild(title);

  const subtitle = document.createElement("p");
  subtitle.className = "pcr-onboarding-subtitle";
  subtitle.innerHTML = "The AI Assistant needs a provider. <strong>Local</strong> runs free via Ollama; <strong>Cloud</strong> uses Claude, OpenAI and others with your API key.";
  card.appendChild(subtitle);

  const aiWrap = document.createElement("div");
  aiWrap.className = "pcr-onboarding-section";
  aiWrap.appendChild(renderAiSetting());
  card.appendChild(aiWrap);

  const row = document.createElement("div");
  row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:4px;";

  const dontShow = document.createElement("button");
  dontShow.textContent = "Don't show again";
  dontShow.style.cssText = "background:none;border:none;color:#888;cursor:pointer;font-size:13px;text-decoration:underline;";
  dontShow.addEventListener("click", async () => {
    dontShow.disabled = true;
    try {
      await fetch("/promptchain/ai-setup/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch (e) {
      console.error("[PromptChain] AI setup dismiss failed:", e);
    }
    overlay.remove();
  });

  const close = document.createElement("button");
  close.className = "pcr-onboarding-btn";
  close.style.cssText = "width:auto;padding:8px 24px;";
  close.textContent = "Done";
  close.addEventListener("click", () => overlay.remove());

  row.append(dontShow, close);
  card.appendChild(row);

  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

if (!window.__pcrAiSetupListener) {
  window.__pcrAiSetupListener = true;
  window.addEventListener("promptchain:show-ai-setup", showAiSetupModal);
}

const PROMPTCHAIN_REPO = "https://github.com/mobcat40/ComfyUI-PromptChain";

// About modal — the welcome splash re-opened as a dismissible card: logo on top
// like the install step, no step nav and no tagline, the ⭐ Star-us footer kept,
// plus a user-triggered update check. Opened from the sidebar kebab and the
// PromptChain settings section. Closable by clicking the backdrop or Escape —
// the first-boot splash deliberately can't be, but About always can.
export function openAboutModal(opts = {}) {
  if (document.querySelector(".pcr-about-overlay")) return;

  const overlay = document.createElement("div");
  overlay.className = "pcr-onboarding-overlay pcr-about-overlay";

  // Reuse the welcome hero card (splash art + logo + bottom bar), minus the
  // step nav and tagline, and make it dismissible.
  const card = document.createElement("div");
  card.className = "pcr-onboarding-card pcr-about-card pcr-welcome-mode";

  const onKey = (e) => { if (e.key === "Escape") close(); };
  function close() {
    window.removeEventListener("keydown", onKey);
    overlay.remove();
  }
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
  window.addEventListener("keydown", onKey);

  const hero = document.createElement("div");
  hero.className = "pcr-welcome pcr-about-hero";
  hero.style.backgroundImage = `url(${new URL("../splash-hero.png", import.meta.url).href})`;

  const closeBtn = document.createElement("button");
  closeBtn.className = "pcr-about-close";
  closeBtn.textContent = "✕";
  closeBtn.title = "Close";
  closeBtn.addEventListener("click", close);
  hero.appendChild(closeBtn);

  const top = document.createElement("div");
  top.className = "pcr-welcome-top";
  const logoLink = document.createElement("a");
  logoLink.href = PROMPTCHAIN_REPO;
  logoLink.target = "_blank";
  logoLink.rel = "noopener";
  const logo = document.createElement("img");
  logo.className = "pcr-welcome-logo";
  logo.src = new URL("../splash-logo.png", import.meta.url).href;
  logo.alt = "PromptChain";
  logoLink.appendChild(logo);
  top.appendChild(logoLink);
  hero.appendChild(top);

  const bar = document.createElement("div");
  bar.className = "pcr-welcome-bar";
  const left = document.createElement("div");
  left.className = "pcr-about-barleft";
  const version = document.createElement("div");
  version.className = "pcr-about-version";
  version.textContent = "Loading build info…";
  left.append(version, starFootEl());

  const update = document.createElement("button");
  update.className = "pcr-about-update";
  update.textContent = "Check for updates";
  wireUpdateButton(update, version);

  bar.append(left, update);
  hero.appendChild(bar);

  card.appendChild(hero);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // Opened from the "Update" menu entry — run the check immediately so the user
  // lands on the result, not a button they still have to press.
  if (opts.autoCheck) update.click();

  (async () => {
    try {
      const v = await fetch("/promptchain/system/version").then((r) => r.json());
      // Don't clobber a result the auto-check (opts.autoCheck) may already have
      // written — only fill in build info if the line is still its placeholder.
      if (version.textContent !== "Loading build info…") return;
      version.textContent = v.is_git
        ? `Build ${v.date || ""}${v.commit ? "  ·  " + v.commit : ""}`
        : "Installed";
    } catch {
      if (version.textContent === "Loading build info…") version.textContent = "";
    }
  })();
}

// The update button cycles through three modes against the /system update
// routes: check → (behind) apply → restart. Each mode rewrites its own label,
// so a single click handler covers the whole flow.
function wireUpdateButton(btn, version) {
  let mode = "check";
  btn.addEventListener("click", async () => {
    if (mode === "restart") {
      btn.disabled = true;
      btn.textContent = "Restarting…";
      version.textContent = "Restarting… this page reconnects when the server is back.";
      fetch("/promptchain/system/restart", { method: "POST" }).catch(() => {});
      return;
    }
    if (mode === "check") {
      btn.disabled = true;
      btn.textContent = "Checking…";
      let data;
      try {
        data = await fetch("/promptchain/system/check-updates", { method: "POST" }).then((r) => r.json());
      } catch {
        data = { status: "unknown", detail: "Couldn't reach the server." };
      }
      btn.disabled = false;
      if (data.status === "current") {
        version.textContent = "✓ You're on the latest version.";
        btn.textContent = "Up to date";
        btn.disabled = true;
      } else if (data.status === "behind") {
        version.textContent = `Update available — ${data.behind} new commit${data.behind > 1 ? "s" : ""}.`;
        btn.textContent = "Update now →";
        mode = "apply";
      } else {
        version.textContent = data.detail || "Couldn't check for updates.";
        btn.textContent = "Check for updates";
      }
      return;
    }
    // mode === "apply" — stages the update (a live pull would fail on the
    // open, locked tag-builder DB); it's applied at the next restart.
    btn.disabled = true;
    btn.textContent = "Staging…";
    let res;
    try {
      res = await fetch("/promptchain/system/apply-update", { method: "POST" }).then((r) => r.json());
    } catch {
      res = { ok: false, detail: "Update failed." };
    }
    btn.disabled = false;
    if (res.ok) {
      version.textContent = "Update staged. Restart ComfyUI to apply it.";
      btn.textContent = "Restart ComfyUI";
      mode = "restart";
    } else {
      version.textContent = res.detail || "Update failed.";
      btn.textContent = "Update now →";
    }
  });
}

if (!window.__pcrAboutListener) {
  window.__pcrAboutListener = true;
  window.addEventListener("promptchain:show-about", (e) => openAboutModal(e?.detail || {}));
}

function getCurrentPreviewMethod() {
  const val = app.ui?.settings?.getSettingValue?.("Comfy.Execution.PreviewMethod");
  return (!val || val === "default") ? "none" : val;
}

function setPreviewMethod(method) {
  app.ui?.settings?.setSettingValue?.("Comfy.Execution.PreviewMethod", method);
}

// Returns the outcome so callers can gate on it: "valid" | "invalid" |
// "unreachable". A network failure/timeout is NOT invalid — we can't confirm
// either way, so we don't block onboarding when CivitAI is merely down.
async function validateCivitaiKey(key, statusEl) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch("/promptchain/civitai/validate-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const data = await res.json();
    if (data.valid) {
      statusEl.textContent = `✓ ${data.username}`;
      statusEl.className = "pcr-onboarding-apikey-status pcr-apikey-valid";
      return "valid";
    }
    statusEl.textContent = "✗ " + (data.error || "Invalid key");
    statusEl.className = "pcr-onboarding-apikey-status pcr-apikey-invalid";
    return "invalid";
  } catch {
    statusEl.textContent = "⚠ couldn't verify (CivitAI unreachable)";
    statusEl.className = "pcr-onboarding-apikey-status";
    return "unreachable";
  }
}

// The install step is driven by the unified section registry
// (/promptchain/install/sections) — the same source of truth the in-app
// Settings install page reads — so the splash detects current install state
// and never drifts from a hand-maintained list.

// A pre-checked settings toggle, with an "already set" disabled state when the
// setting is already at the recommended value.
function recommendedToggle(title, desc, alreadySet) {
  const section = document.createElement("div");
  section.className = "pcr-onboarding-section";
  const label = document.createElement("label");
  label.className = "pcr-onboarding-toggle";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = true;
  const text = document.createElement("div");
  text.className = "pcr-onboarding-toggle-text";
  const t = document.createElement("span");
  t.className = "pcr-onboarding-toggle-title";
  t.textContent = title;
  const d = document.createElement("span");
  d.className = "pcr-onboarding-toggle-desc";
  d.textContent = alreadySet ? "Already set. No change needed." : desc;
  text.append(t, d);
  label.append(cb, text);
  label.addEventListener("click", (e) => { if (e.target !== cb) cb.checked = !cb.checked; });
  if (alreadySet) cb.disabled = true;
  section.appendChild(label);
  return { section, cb };
}

// Step 1 — setup: all settings + the CivitAI key on one screen.
function showSplash() {
  const overlay = document.createElement("div");
  overlay.className = "pcr-onboarding-overlay";

  const card = document.createElement("div");
  card.className = "pcr-onboarding-card";

  // logo
  const logoLink = document.createElement("a");
  logoLink.href = "https://github.com/mobcat40/ComfyUI-PromptChain";
  logoLink.target = "_blank";
  const logo = document.createElement("img");
  logo.src = new URL("../logo.png", import.meta.url).href;
  logo.className = "pcr-onboarding-logo";
  logo.alt = "PromptChain";
  logoLink.appendChild(logo);
  card.appendChild(logoLink);

  const setupNav = stepNav(1, (i) => gotoStep(card, i));
  setupNav.style.margin = "6px 0 16px";
  card.appendChild(setupNav);

  const subtitle = document.createElement("p");
  subtitle.className = "pcr-onboarding-subtitle";
  subtitle.textContent = "One-time setup. Uncheck anything you'd rather leave as-is.";
  card.appendChild(subtitle);

  // ── live preview (TAESD) ──
  const taesd = recommendedToggle(
    "Enable live preview (TAESD)",
    "See images as they generate. Change later in Settings > Execution > Preview Method.",
    ((m) => m === "taesd" || m === "auto" || m === "latent2rgb")(getCurrentPreviewMethod()));
  card.appendChild(taesd.section);

  // ── hide node source badges ──
  const badges = recommendedToggle(
    "Hide node source badges",
    "Removes the type label at the bottom of nodes. Change later in Settings > Node > Source Badge Mode.",
    app.ui?.settings?.getSettingValue?.("Comfy.NodeBadge.NodeSourceBadgeMode") === "None");
  card.appendChild(badges.section);

  // ── Nodes 2.0 ──
  const nodes2 = recommendedToggle(
    "Use Nodes 2.0 (new rendering)",
    "PromptChain's interface is designed for ComfyUI's new Vue-based nodes. Change later in Settings.",
    app.ui?.settings?.getSettingValue?.("Comfy.VueNodes.Enabled") === true);
  card.appendChild(nodes2.section);

  // ── disable workflow auto-restore ──
  const persist = recommendedToggle(
    "Disable workflow auto-restore",
    "Start with a clean canvas each load instead of restoring the previous workflow. Change later in Settings > Comfy > Workflow.",
    app.ui?.settings?.getSettingValue?.("Comfy.Workflow.Persist") === false);
  card.appendChild(persist.section);

  // ── CivitAI API key ──
  const civitai = document.createElement("div");
  civitai.className = "pcr-onboarding-section";

  const civitaiTitle = document.createElement("span");
  civitaiTitle.className = "pcr-onboarding-toggle-title";
  civitaiTitle.textContent = "CivitAI API key (optional)";
  civitai.appendChild(civitaiTitle);

  const civitaiDesc = document.createElement("span");
  civitaiDesc.className = "pcr-onboarding-toggle-desc";
  civitaiDesc.innerHTML = 'Required for auto-downloading models from CivitAI. <a href="https://civitai.com/user/account" target="_blank" style="color: #5b9bd5;">Get your key here.</a>';
  civitaiDesc.style.display = "block";
  civitaiDesc.style.marginBottom = "8px";
  civitai.appendChild(civitaiDesc);

  const civitaiRow = document.createElement("div");
  civitaiRow.style.cssText = "display: flex; align-items: center; gap: 8px;";

  // type=text + CSS masking, NOT type=password: a real password field makes
  // the browser's password manager offer to "save" the API key when the
  // field is removed on Next. Masking gives the same visual hiding without
  // tripping that heuristic.
  const civitaiInput = document.createElement("input");
  civitaiInput.type = "text";
  civitaiInput.style.webkitTextSecurity = "disc";
  civitaiInput.className = "pcr-onboarding-apikey-input";
  civitaiInput.placeholder = "Paste your API key...";
  civitaiInput.spellcheck = false;
  civitaiInput.autocomplete = "off";
  civitaiRow.appendChild(civitaiInput);

  const civitaiStatus = document.createElement("span");
  civitaiStatus.className = "pcr-onboarding-apikey-status";
  civitaiRow.appendChild(civitaiStatus);

  civitai.appendChild(civitaiRow);

  let validateTimer = null;
  // Validation outcome for the value currently in the field, so Next can gate
  // on it: empty | checking | valid | invalid | unreachable.
  let keyState = { value: "", status: "empty" };

  async function runKeyValidation(key) {
    keyState = { value: key, status: "checking" };
    const status = await validateCivitaiKey(key, civitaiStatus);
    // Ignore a stale result the user has already typed past.
    if (civitaiInput.value.trim() === key) keyState = { value: key, status };
    return status;
  }

  civitaiInput.addEventListener("input", () => {
    clearTimeout(validateTimer);
    const val = civitaiInput.value.trim();
    if (!val) {
      civitaiStatus.textContent = "";
      civitaiStatus.className = "pcr-onboarding-apikey-status";
      keyState = { value: "", status: "empty" };
      return;
    }
    civitaiStatus.textContent = "...";
    civitaiStatus.className = "pcr-onboarding-apikey-status";
    keyState = { value: val, status: "checking" };
    validateTimer = setTimeout(() => runKeyValidation(val), 600);
  });

  card.appendChild(civitai);

  // tags section
  const tags = document.createElement("div");
  tags.className = "pcr-onboarding-section";
  const tagsInfo = document.createElement("div");
  tagsInfo.className = "pcr-onboarding-info";
  tagsInfo.innerHTML = "<strong>Tag databases</strong> will be copied to your user folder. You can customize or remove them later.";
  tags.appendChild(tagsInfo);
  card.appendChild(tags);

  // Next → applies the settings + saves the key, then advances to Extras
  // (the install screen).
  const btn = navButton("Next →", true);
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Saving...";

    // Gate on the CivitAI key first. Don't save or advance a confirmed-bad
    // key; an empty field or an unreachable CivitAI passes through.
    const apiKey = civitaiInput.value.trim();
    if (apiKey) {
      let status = keyState.value === apiKey ? keyState.status : "checking";
      if (status === "checking" || status === "empty") {
        clearTimeout(validateTimer);
        btn.textContent = "Checking key...";
        status = await runKeyValidation(apiKey);
      }
      if (status === "invalid") {
        btn.disabled = false;
        btn.textContent = "Next →";
        civitaiInput.focus();
        return;
      }
      try {
        await fetch("/promptchain/civitai/api-key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: apiKey }),
        });
      } catch (e) {
        console.error("[PromptChain] Failed to save CivitAI API key:", e);
      }
    }

    if (taesd.cb.checked && !taesd.cb.disabled) setPreviewMethod("taesd");
    if (badges.cb.checked && !badges.cb.disabled) {
      app.ui?.settings?.setSettingValue?.("Comfy.NodeBadge.NodeSourceBadgeMode", "None");
    }
    if (nodes2.cb.checked && !nodes2.cb.disabled) {
      app.ui?.settings?.setSettingValue?.("Comfy.VueNodes.Enabled", true);
    }
    if (persist.cb.checked && !persist.cb.disabled) {
      app.ui?.settings?.setSettingValue?.("Comfy.Workflow.Persist", false);
    }

    btn.disabled = false;
    btn.textContent = "Next →";
    showChecklist(overlay, card);
  });
  card.appendChild(onboardingBar([btn]));

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // Show the Welcome hero first; the setup form becomes screen 1 behind it.
  captureScreen1(card);
  card._pcrScreen0 = buildWelcomeScreen(overlay, card);
  card.appendChild(card._pcrScreen0);
  setCardMode(card, "welcome");
  showOnly(card, "_pcrScreen0");
}

async function completeOnboarding() {
  try {
    await fetch("/promptchain/onboarding/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  } catch (e) {
    console.error("[PromptChain] Onboarding completion failed:", e);
  }
}

// Screens share one card so Back preserves state: screen1 (setup) is captured
// then hidden, never rebuilt; screen2 (install or skip) and screen3 (checklist)
// are built lazily and toggled.
const NAV_BTN = "font-size:14px;font-weight:500;border-radius:6px;padding:9px 22px;cursor:pointer;line-height:1.2;";

function captureScreen1(card) {
  if (card._pcrScreen1) return;
  const s1 = document.createElement("div");
  while (card.firstChild) s1.appendChild(card.firstChild);
  card.appendChild(s1);
  card._pcrScreen1 = s1;
}

function showOnly(card, key) {
  for (const k of ["_pcrScreen0", "_pcrScreen1", "_pcrScreen2", "_pcrScreen3"]) {
    if (card[k]) card[k].style.display = k === key ? "" : "none";
  }
}

function navButton(label, primary) {
  const b = document.createElement("button");
  b.textContent = label;
  b.style.cssText = NAV_BTN + (primary
    ? "background:#c36216;border:1px solid #c36216;color:#fff;"
    : "background:transparent;border:1px solid #555;color:#ddd;");
  return b;
}

// The ⭐ Star-us footer link, shared by the welcome hero and the form-step bars.
function starFootEl() {
  const foot = document.createElement("div");
  foot.className = "pcr-welcome-foot";
  foot.innerHTML = '⭐ <a href="https://github.com/mobcat40/ComfyUI-PromptChain" target="_blank" rel="noopener">Star us on GitHub!</a>';
  return foot;
}

// Bottom action bar for the form steps (Setup, Extras): star-foot on the left,
// the step's action button(s) on the right. Mirrors the welcome hero's bar.
function onboardingBar(rightButtons) {
  const bar = document.createElement("div");
  bar.className = "pcr-onboarding-bar";
  const right = document.createElement("div");
  right.style.cssText = "display:flex;align-items:center;gap:10px;flex:none;";
  rightButtons.forEach((b) => right.appendChild(b));
  bar.append(starFootEl(), right);
  return bar;
}

const ONBOARD_STEPS = ["Welcome", "Setup", "Extras"];

// The Welcome · Setup · Finish progress indicator, with the active step lit.
// Styled to read both on the hero art and on the dark form/install cards.
function stepNav(active, onNavigate) {
  const nav = document.createElement("div");
  nav.className = "pcr-welcome-steps";
  ONBOARD_STEPS.forEach((label, i) => {
    // Already-completed steps are clickable to go back to them.
    const clickable = i < active && !!onNavigate;
    const step = document.createElement("span");
    step.className = "pcr-welcome-step" + (i === active ? " is-active" : "") + (clickable ? " is-clickable" : "");
    const dot = document.createElement("span");
    dot.className = "pcr-welcome-dot";
    const txt = document.createElement("span");
    txt.textContent = label;
    step.append(dot, txt);
    if (clickable) step.addEventListener("click", () => onNavigate(i));
    nav.appendChild(step);
  });
  return nav;
}

// Navigate to an onboarding step by index — backs the clickable step nav.
function gotoStep(card, index) {
  if (index <= 0) { setCardMode(card, "welcome"); showOnly(card, "_pcrScreen0"); }
  else if (index === 1) { setCardMode(card, "form"); showOnly(card, "_pcrScreen1"); }
  else { setCardMode(card, "form"); showOnly(card, "_pcrScreen3"); }
}

// Welcome uses a full-bleed hero card; the form/install screens use the padded
// dark card. Toggle without inline max-width fighting the welcome-mode class.
function setCardMode(card, mode) {
  if (mode === "welcome") {
    card.style.maxWidth = "";
    card.classList.add("pcr-welcome-mode");
  } else {
    card.classList.remove("pcr-welcome-mode");
    card.style.maxWidth = "560px";
  }
}

// Step 0 — hero welcome screen. The product art (splash-hero.png) is the
// background; logo, step nav, tagline, footer link, and CTA are DOM on top.
function buildWelcomeScreen(overlay, card) {
  const welcome = document.createElement("div");
  welcome.className = "pcr-welcome";
  welcome.style.backgroundImage = `url(${new URL("../splash-hero.png", import.meta.url).href})`;

  const top = document.createElement("div");
  top.className = "pcr-welcome-top";
  const logo = document.createElement("img");
  logo.className = "pcr-welcome-logo";
  logo.src = new URL("../splash-logo.png", import.meta.url).href;
  logo.alt = "PromptChain";
  top.append(logo, stepNav(0));
  welcome.appendChild(top);

  const tagline = document.createElement("div");
  tagline.className = "pcr-welcome-tagline";
  tagline.textContent = "The full prompting IDE toolkit for ComfyUI";
  welcome.appendChild(tagline);

  const bar = document.createElement("div");
  bar.className = "pcr-welcome-bar";
  // Low-key escape — features still self-install on first use. Begin setup
  // stays the obvious primary; Skip is a quiet grey out for those who want it.
  const skip = document.createElement("button");
  skip.className = "pcr-welcome-skip";
  skip.textContent = "Skip";
  skip.title = "Skip setup — features still install the first time you use them";
  skip.addEventListener("click", async () => {
    skip.disabled = true;
    await completeOnboarding();
    overlay.remove();
  });
  const cta = document.createElement("button");
  cta.className = "pcr-welcome-cta";
  cta.textContent = "Begin setup →";
  cta.addEventListener("click", () => {
    setCardMode(card, "form");
    showOnly(card, "_pcrScreen1");
  });
  const right = document.createElement("div");
  right.style.cssText = "display:flex;align-items:center;gap:12px;";
  right.append(skip, cta);
  bar.append(starFootEl(), right);
  welcome.appendChild(bar);

  return welcome;
}

// (The old "install now or skip" choice screen was folded into Extras: Setup →
// Next goes straight there, where the bar offers Skip / Install selected.)

// Step 3 (Extras) — feature checklist + sequential install with live progress.
function showChecklist(overlay, card) {
  card.style.maxWidth = "600px";
  if (!card._pcrScreen3) card._pcrScreen3 = buildChecklistScreen(overlay, card);
  showOnly(card, "_pcrScreen3");
}

function buildChecklistScreen(overlay, card) {
  const screen = document.createElement("div");

  const logo = document.createElement("img");
  logo.src = new URL("../logo.png", import.meta.url).href;
  logo.className = "pcr-onboarding-logo";
  logo.alt = "PromptChain";
  screen.appendChild(logo);

  const nav = stepNav(2, (i) => gotoStep(card, i));
  nav.style.margin = "6px 0 16px";
  screen.appendChild(nav);

  const title = document.createElement("h2");
  title.className = "pcr-onboarding-toggle-title";
  title.style.cssText = "font-size:18px;margin:0 0 4px;";
  title.textContent = "📦 Install features";
  screen.appendChild(title);

  const subtitle = document.createElement("p");
  subtitle.className = "pcr-onboarding-subtitle";
  subtitle.textContent = "Already-installed features are detected and left unchecked. Sizes are approximate; shared models download only once.";
  screen.appendChild(subtitle);

  // Rows are filled async from /install/sections so the step shows real state.
  const listEl = document.createElement("div");
  screen.appendChild(listEl);

  const loading = document.createElement("p");
  loading.className = "pcr-onboarding-subtitle";
  loading.textContent = "Checking what's already installed…";
  listEl.appendChild(loading);

  // Overall progress line + streaming log (hidden until install starts).
  const progressLine = document.createElement("p");
  progressLine.className = "pcr-onboarding-subtitle";
  progressLine.style.cssText = "margin:8px 0 4px;display:none;";
  screen.appendChild(progressLine);

  const logBox = document.createElement("div");
  logBox.className = "pcr-onboarding-info";
  logBox.style.cssText = "display:none;max-height:120px;overflow-y:auto;font-family:ui-monospace,Consolas,monospace;font-size:11px;line-height:1.5;white-space:pre-wrap;background:#1a1a20;color:#9c9;padding:8px 10px;border-radius:6px;";
  screen.appendChild(logBox);
  const log = (line) => {
    logBox.style.display = "block";
    const div = document.createElement("div");
    div.textContent = line;
    logBox.appendChild(div);
    logBox.scrollTop = logBox.scrollHeight;
  };

  // Skip (left) installs nothing and finishes; Install selected (right) runs it.
  const skip = navButton("Skip for now", false);
  skip.addEventListener("click", async () => {
    skip.disabled = true; install.disabled = true;
    await completeOnboarding();
    overlay.remove();
  });
  const install = navButton("Install selected", true);
  install.disabled = true; // enabled once we know what's installed
  screen.appendChild(onboardingBar([skip, install]));

  const rows = [];
  install.addEventListener("click", () => runInstall({ overlay, card, rows, progressLine, log, nav, skip, install }));

  // Detect current install state. A wiped user folder re-runs this splash, but
  // installs live in custom_nodes/ + models/ (OUTSIDE the user folder), so the
  // sections route still finds them: installed → shown done + unchecked,
  // partial → unchecked with an "N of M" note, missing → pre-checked.
  (async () => {
    let sections = [];
    try {
      sections = (await fetch("/promptchain/install/sections").then((r) => r.json())).sections || [];
    } catch {
      loading.textContent = "Couldn't check install status. Restart ComfyUI and reopen, or Skip (features still install on first use).";
      return;
    }
    loading.remove();
    if (!sections.length) {
      const none = document.createElement("p");
      none.className = "pcr-onboarding-subtitle";
      none.textContent = "Nothing optional to install — you're all set.";
      listEl.appendChild(none);
      return;
    }
    for (const sec of sections) rows.push(renderSectionRow(sec, listEl));
    // Nothing left to install (all detected present) → drop Skip/Install for a
    // single Finish; otherwise enable Install.
    if (rows.some((r) => !r.cb.disabled)) {
      install.disabled = false;
    } else {
      subtitle.textContent = "Everything's already installed — you're all set.";
      const finish = navButton("Finish", true);
      finish.addEventListener("click", async () => { await completeOnboarding(); overlay.remove(); });
      skip.replaceWith(finish);
      install.remove();
    }
  })();

  card.appendChild(screen);
  return screen;
}

// One install-step row reflecting a section's detected health.
function fmtBytes(n) {
  if (!n || n < 0) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${u[i]}`;
}

// Render the live download stat for the status cell: "12.3 MB/s · 1.2 GB / 3.2 GB".
function fmtProgress(p) {
  const parts = [];
  if (p.bps) parts.push(`${fmtBytes(p.bps)}/s`);
  if (p.total) parts.push(`${fmtBytes(p.done || 0)} / ${fmtBytes(p.total)}`);
  if (!parts.length) parts.push(`${p.pct || 0}%`);
  return parts.join(" · ");
}

function renderSectionRow(sec, parent) {
  const section = document.createElement("div");
  section.className = "pcr-onboarding-section";
  section.style.cssText = "display:flex;align-items:flex-start;gap:10px;padding:9px 10px;";

  const installed = sec.health === "installed";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.style.marginTop = "2px";
  // Missing → pre-checked (fresh-install default). Partial → off (you already
  // have some; tick to fetch the rest). Installed → off + disabled.
  cb.checked = sec.health === "missing";
  cb.disabled = installed;

  const text = document.createElement("div");
  text.style.cssText = "flex:1;min-width:0;";
  const t = document.createElement("div");
  t.className = "pcr-onboarding-toggle-title";
  t.innerHTML = `${sec.label} <span style="font-weight:400;opacity:.6;font-size:12px;">${sec.size || ""}</span>`;
  const d = document.createElement("div");
  d.className = "pcr-onboarding-toggle-desc";
  const deferredNote = (sec.deferred && sec.deferred.length)
    ? "  ·  +" + sec.deferred.map((x) => ` ${x.label} (${x.size}) on first use`).join(";")
    : "";
  d.textContent = sec.desc + deferredNote;
  text.append(t, d);

  // Live download progress bar — hidden until this row starts a byte-counted
  // download (bundled-pack copies have no byte stream, so they stay text-only).
  const barTrack = document.createElement("div");
  barTrack.style.cssText = "display:none;height:4px;border-radius:2px;background:rgba(255,255,255,.12);margin-top:7px;overflow:hidden;";
  const barFill = document.createElement("div");
  barFill.style.cssText = "height:100%;width:0%;border-radius:2px;background:#e8821e;transition:width .2s ease;";
  barTrack.appendChild(barFill);
  text.appendChild(barTrack);

  const status = document.createElement("div");
  status.style.cssText = "font-size:12px;white-space:nowrap;max-width:240px;overflow:hidden;text-overflow:ellipsis;text-align:right;margin-top:2px;";
  if (installed) { status.style.color = "#6c6"; status.textContent = "✓ Installed"; }
  else if (sec.health === "partial") { status.style.color = "#e0a13a"; status.textContent = `${sec.installed_count} of ${sec.total} installed`; }

  section.append(cb, text, status);
  section.addEventListener("click", (e) => {
    if (e.target !== cb && !cb.disabled) cb.checked = !cb.checked;
  });
  parent.appendChild(section);
  return { sec, cb, status, barTrack, barFill };
}

// Consume one per-pack install SSE stream, reporting stage text + log lines.
// Throws on an {error} event.
async function installOnePack(spec, onStage, onLog) {
  const res = await fetch(spec.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(spec.body),
    signal: spec.signal,
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `HTTP ${res.status}`);
  }
  const STAGE = {
    clone: "Downloading pack…",
    copy: "Copying files…",
    pin: "Pinning version…",
    pip: "Installing dependencies…",
    install_script: "Running setup…",
    fix_deps: "Verifying core dependencies…",
  };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 2);
      if (!chunk.startsWith("data:")) continue;
      let evt;
      try { evt = JSON.parse(chunk.slice(5).trim()); } catch { continue; }
      if (evt.error) throw new Error(evt.error);
      if (evt.line) { onLog("  " + evt.line); continue; }
      if (evt.stage === "download") { onStage({ pct: evt.pct ?? 0, done: evt.done, total: evt.total, bps: evt.bps, file: evt.file }); continue; }
      if (evt.stage === "prefetch") { onStage(`Pre-fetching ${evt.file || "extra weights"}…`); continue; }
      if (evt.stage === "models") { onStage(`Downloading ${evt.count || ""} model file${evt.count > 1 ? "s" : ""}…`); continue; }
      if (evt.stage) { onStage(STAGE[evt.stage] || evt.stage); continue; }
      // evt.done — pack finished
    }
  }
}

async function runInstall({ overlay, card, rows, progressLine, log, nav, skip, install }) {
  const selected = rows.filter((r) => r.cb.checked && !r.cb.disabled);
  if (!selected.length) { await completeOnboarding(); overlay.remove(); return; }

  if (nav) nav.style.pointerEvents = "none"; // no step-nav back-nav mid-install
  if (skip) skip.disabled = true;
  install.disabled = true;
  install.textContent = "Installing…";
  install.style.opacity = "0.55";
  install.style.cursor = "default";
  rows.forEach((r) => { r.cb.disabled = true; });
  progressLine.style.display = "block";

  // Cancel: aborts the in-flight fetch AND tells the server to stop. The current
  // file finishes its chunk (keeping a .part for resume), then it bails.
  const controller = new AbortController();
  let cancelled = false;
  const cancelBtn = navButton("Cancel", false);
  cancelBtn.style.marginRight = "8px";
  cancelBtn.addEventListener("click", () => {
    if (cancelled) return;
    cancelled = true;
    cancelBtn.disabled = true;
    cancelBtn.textContent = "Cancelling…";
    controller.abort();
    fetch("/promptchain/install/cancel", { method: "POST" }).catch(() => {});
    progressLine.textContent = "Cancelling… the current file finishes, then it stops.";
  });
  install.before(cancelBtn);

  let anyFailed = false;
  for (let i = 0; i < selected.length; i++) {
    if (cancelled) break;
    const { sec, status, barTrack, barFill } = selected[i];
    progressLine.textContent = `Installing ${i + 1} of ${selected.length}…`;
    status.style.color = "#7bd";
    status.textContent = "⏳ starting…";
    if (barTrack) { barTrack.style.display = "none"; barFill.style.width = "0%"; }
    log(`▸ ${sec.label}`);
    try {
      // One SSE per section. The section installer skips already-present members
      // server-side, so a partial section only fetches what's still missing.
      await installOnePack(
        { url: "/promptchain/install/install", body: { section: sec.id }, signal: controller.signal },
        (s) => {
          if (typeof s === "string") {
            if (barTrack) barTrack.style.display = "none";
            status.textContent = s;
          } else {
            // byte-counted download → fill the bar, show rate + size in the cell
            if (barTrack && s.total) { barTrack.style.display = "block"; barFill.style.width = (s.pct || 0) + "%"; }
            status.textContent = fmtProgress(s);
          }
        }, log);
      status.style.color = "#6c6";
      status.textContent = "✓ done";
      if (barTrack) barTrack.style.display = "none";
    } catch (e) {
      if (barTrack) barTrack.style.display = "none";
      if (cancelled || e.name === "AbortError") {
        cancelled = true;
        status.style.color = "#999";
        status.textContent = "— cancelled";
        break;
      }
      anyFailed = true;
      status.style.color = "#e77";
      status.textContent = "✗ failed";
      log(`  ✘ ${sec.label}: ${e.message}`);
    }
  }

  await completeOnboarding();
  cancelBtn.remove();

  // Done — the copied-out packs need a restart to register their nodes. Replace
  // the Install button entirely (not repurpose it — its addEventListener handler
  // can't be cleared by onclick=null and would re-fire runInstall on click).
  progressLine.textContent = cancelled
    ? "Cancelled. Restart ComfyUI to load whatever finished installing."
    : anyFailed
      ? "Finished with some errors (see log). Restart ComfyUI to load what installed."
      : "All set! Restart ComfyUI to load the new features.";
  if (skip) skip.style.display = "none";

  const restartBtn = navButton("Restart ComfyUI", true);
  restartBtn.addEventListener("click", () => {
    restartBtn.disabled = true;
    restartBtn.textContent = "Restarting…";
    fetch("/promptchain/system/restart", { method: "POST" }).catch(() => {});
    progressLine.textContent = "Restarting… this page will reconnect when the server is back.";
  });

  // A quiet "finish without restarting" escape hatch.
  const later = navButton("Later", false);
  later.style.marginLeft = "8px";
  later.addEventListener("click", () => overlay.remove());

  install.replaceWith(restartBtn);
  restartBtn.after(later);
}
