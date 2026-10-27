import { KDF_ITERATIONS, deriveKey, encryptVault, decryptWithKey, unlockVault, randomBytes,
  generatePassword, estimateBits } from "./crypto.js";
import { AUTO_LOCK_MINUTES, HIDDEN_LOCK_SECONDS, CLIPBOARD_CLEAR_SECONDS } from "./config.js";
import { driveConfigured, downloadVault, uploadVault, signOutDrive } from "./drive.js";

const $ = (id) => document.getElementById(id);
const STORE_KEY = "safevault.vault";

// In-memory session. Wiped on lock.
let session = null; // { key, salt, iter, data: { entries: [], updatedAt } }
let editingId = null;
let idleTimer = null, hiddenTimer = null, clipTimer = null;
let failedAttempts = 0;

// ---------- storage ----------
const loadBlob = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch { return null; } };
const storeBlob = (b) => localStorage.setItem(STORE_KEY, JSON.stringify(b));

const driveLinked = () => driveConfigured() && localStorage.getItem("safevault.driveLinked") === "1";

async function persist({ sync = true } = {}) {
  session.data.updatedAt = Date.now();
  const blob = await encryptVault(session.key, session.salt, session.iter, session.data);
  storeBlob(blob);
  // Always pull + merge before pushing, so a stale device never overwrites newer data in Drive.
  if (sync && driveLinked()) syncNow({ quiet: true });
}

// Ask the browser not to evict our storage when the device runs low on space.
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// ---------- screens ----------
function show(name) {
  for (const s of ["setup", "lock", "main"]) $("screen-" + s).hidden = s !== name;
  if (name === "lock") setTimeout(() => $("unlock-pw").focus(), 50);
}
function toast(msg, ms = 2500) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
}
function setSyncStatus(msg) { $("s-sync-status").textContent = msg; }
function lastSyncText() {
  const t = +localStorage.getItem("safevault.lastSync");
  return t ? "Last synced " + new Date(t).toLocaleString() : "Not synced yet";
}

// Password prompt as a dialog (window.prompt would show the password in plain text).
function askPassword(msg) {
  return new Promise((resolve) => {
    const d = $("dlg-pw");
    $("p-msg").textContent = msg; $("p-pw").value = ""; d.returnValue = "";
    d.addEventListener("close", () => {
      const v = d.returnValue === "ok" ? $("p-pw").value : null;
      $("p-pw").value = ""; resolve(v);
    }, { once: true });
    d.showModal();
  });
}

function meter(el, pw) {
  const bits = estimateBits(pw);
  const pct = Math.min(100, (bits / 100) * 100);
  el.style.width = pct + "%";
  el.style.background = bits < 40 ? "#dc2626" : bits < 60 ? "#f59e0b" : bits < 80 ? "#84cc16" : "#16a34a";
  return bits;
}

// ---------- setup ----------
$("setup-pw").addEventListener("input", (e) => {
  const bits = meter($("setup-meter"), e.target.value);
  $("setup-hint").textContent = e.target.value ? `Strength: ~${bits} bits ${bits < 60 ? "(make it longer)" : "✓ good"}` : "At least 10 characters. A long sentence is great.";
});
$("form-setup").addEventListener("submit", async (e) => {
  e.preventDefault();
  const pw = $("setup-pw").value, pw2 = $("setup-pw2").value;
  if (pw !== pw2) return toast("Passwords don't match");
  if (pw.length < 10) return toast("Use at least 10 characters");
  if (estimateBits(pw) < 50 && !confirm("This master password is weak. Use it anyway?")) return;
  toast("Creating vault…");
  const salt = randomBytes(16);
  const key = await deriveKey(pw, salt, KDF_ITERATIONS);
  session = { key, salt, iter: KDF_ITERATIONS, data: { entries: [], updatedAt: Date.now() } };
  $("setup-pw").value = $("setup-pw2").value = "";
  await persist({ sync: false });
  enterMain();
});

$("btn-restore-drive").addEventListener("click", async () => {
  try {
    const blob = await downloadVault();
    if (!blob) return toast("No SafeVault found in this Google account");
    storeBlob(blob);
    localStorage.setItem("safevault.driveLinked", "1");
    toast("Vault restored. Enter your master password.");
    show("lock");
  } catch (e) { toast(e.message, 4000); }
});
$("btn-restore-file").addEventListener("click", () => $("file-import").click());
$("file-import").addEventListener("change", async (e) => {
  const f = e.target.files[0]; if (!f) return;
  e.target.value = "";
  let blob;
  try {
    blob = JSON.parse(await f.text());
    if (blob.v !== 1 || !blob.ct) throw new Error();
  } catch { return toast("That isn't a valid SafeVault backup"); }
  if (!session) { storeBlob(blob); toast("Backup imported. Enter its master password."); return show("lock"); }

  // Unlocked: merge the backup into the current vault (newer version of each entry wins).
  let data;
  try { data = await decryptWithKey(session.key, blob); }
  catch {
    const pw = await askPassword("This backup uses a different master password. Enter that password to import it.");
    if (!pw) return;
    try { data = (await unlockVault(pw, blob)).data; } catch { return toast("Wrong password for this backup"); }
  }
  if (!session) return;
  const before = liveEntries().length;
  session.data.entries = mergeEntries(session.data.entries, data.entries || []);
  await persist(); render();
  toast(`Imported. ${liveEntries().length - before} new password(s) added.`, 3500);
});

// ---------- unlock / lock ----------
$("form-unlock").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("btn-unlock"); btn.disabled = true; btn.textContent = "Unlocking…";
  $("unlock-error").hidden = true;
  try {
    session = await unlockVault($("unlock-pw").value, loadBlob());
    failedAttempts = 0;
    $("unlock-pw").value = "";
    $("lock-logo").firstElementChild.classList.add("open"); // shackle pops open
    await new Promise((r) => setTimeout(r, 300));
    enterMain();
  } catch {
    failedAttempts++;
    // Small growing delay to slow down someone guessing on this device.
    await new Promise((r) => setTimeout(r, Math.min(30000, 500 * 2 ** failedAttempts)));
    $("unlock-error").textContent = "Wrong master password.";
    $("unlock-error").hidden = false;
  } finally { btn.disabled = false; btn.textContent = "Unlock"; }
});

$("btn-reset").addEventListener("click", () => {
  if (prompt('This deletes the vault on THIS device only (your Drive copy is kept). Type ERASE to confirm.') === "ERASE") {
    localStorage.removeItem(STORE_KEY); lock(); show("setup");
  }
});

function lock() {
  session = null; editingId = null;
  clearTimeout(idleTimer); clearTimeout(hiddenTimer);
  for (const d of document.querySelectorAll("dialog")) d.open && d.close();
  $("list").replaceChildren(); $("search").value = "";
  for (const id of ["e-pass", "g-out", "c-old", "c-new", "c-new2", "p-pw"]) $(id).value = "";
  $("lock-logo").firstElementChild.classList.remove("open");
  if (loadBlob()) show("lock"); else show("setup");
}
$("btn-lock").addEventListener("click", () => {
  $("lock-ic").classList.remove("open"); // shackle snaps shut, then lock
  setTimeout(lock, 300);
});

function resetIdle() {
  if (!session) return;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { lock(); toast("Locked after inactivity"); }, AUTO_LOCK_MINUTES * 60000);
}
for (const ev of ["pointerdown", "keydown", "scroll", "touchstart"]) addEventListener(ev, resetIdle, { passive: true });
document.addEventListener("visibilitychange", () => {
  clearTimeout(hiddenTimer);
  if (document.hidden && session) hiddenTimer = setTimeout(lock, HIDDEN_LOCK_SECONDS * 1000);
});

function enterMain() {
  show("main"); render(); resetIdle();
  $("lock-ic").classList.add("open");
  if (driveLinked()) syncNow({ quiet: true }); // pick up changes made on other devices
}
// Retry a sync that failed while offline as soon as the connection comes back.
addEventListener("online", () => { if (session && localStorage.getItem("safevault.pendingSync")) syncNow({ quiet: true }); });

// ---------- list ----------
const liveEntries = () => session.data.entries.filter((x) => !x.deleted);

function render() {
  const q = $("search").value.trim().toLowerCase();
  const items = liveEntries()
    .filter((x) => !q || [x.title, x.username, x.url].some((v) => (v || "").toLowerCase().includes(q)))
    .sort((a, b) => a.title.localeCompare(b.title));
  const list = $("list");
  list.replaceChildren();
  $("empty").hidden = liveEntries().length > 0;
  for (const x of items) {
    // Built with textContent only — never innerHTML — so saved data can't inject code.
    const li = document.createElement("li"); li.className = "item";
    const av = document.createElement("div"); av.className = "avatar";
    av.textContent = (x.title[0] || "?").toUpperCase();
    av.style.background = `hsl(${[...x.title].reduce((h, c) => h + c.charCodeAt(0), 0) % 360} 60% 45%)`;
    const info = document.createElement("div"); info.className = "info";
    const t = document.createElement("div"); t.className = "t"; t.textContent = x.title;
    const u = document.createElement("div"); u.className = "u"; u.textContent = x.username || "—";
    info.append(t, u); info.addEventListener("click", () => openEntry(x.id));
    const cu = document.createElement("button"); cu.textContent = "User";
    cu.addEventListener("click", () => copy(x.username, "Username copied"));
    const cp = document.createElement("button"); cp.textContent = "Copy"; cp.className = "primary";
    cp.addEventListener("click", () => copy(x.password, `Password copied — clears in ${CLIPBOARD_CLEAR_SECONDS}s`, true));
    li.append(av, info, cu, cp);
    list.appendChild(li);
  }
}
$("search").addEventListener("input", render);

async function copy(text, msg, sensitive = false) {
  if (!text) return toast("Nothing to copy");
  try { await navigator.clipboard.writeText(text); } catch { return toast("Copy blocked by the browser"); }
  toast(msg);
  if (sensitive) {
    clearTimeout(clipTimer);
    clipTimer = setTimeout(async () => { try { await navigator.clipboard.writeText(""); } catch {} }, CLIPBOARD_CLEAR_SECONDS * 1000);
  }
}

// ---------- entry editor ----------
function openEntry(id = null) {
  editingId = id;
  const x = id ? session.data.entries.find((e) => e.id === id) : {};
  $("entry-title").textContent = id ? "Edit password" : "Add password";
  $("e-title").value = x.title || ""; $("e-user").value = x.username || "";
  $("e-pass").value = x.password || ""; $("e-url").value = x.url || ""; $("e-notes").value = x.notes || "";
  $("e-pass").type = "password"; $("e-delete").hidden = !id;
  meter($("e-meter"), $("e-pass").value);
  $("dlg-entry").showModal();
}
$("btn-add").addEventListener("click", () => openEntry());
$("e-cancel").addEventListener("click", () => $("dlg-entry").close());
$("e-show").addEventListener("click", () => { const p = $("e-pass"); p.type = p.type === "password" ? "text" : "password"; });
$("e-gen").addEventListener("click", () => { $("e-pass").value = generatePassword(20); $("e-pass").type = "text"; meter($("e-meter"), $("e-pass").value); });
$("e-pass").addEventListener("input", (e) => meter($("e-meter"), e.target.value));

$("form-entry").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fields = { title: $("e-title").value.trim(), username: $("e-user").value.trim(), password: $("e-pass").value,
    url: $("e-url").value.trim(), notes: $("e-notes").value, updated: Date.now() };
  if (!fields.title) return;
  if (editingId) Object.assign(session.data.entries.find((x) => x.id === editingId), fields);
  else session.data.entries.push({ id: crypto.randomUUID(), ...fields });
  $("dlg-entry").close(); $("e-pass").value = "";
  await persist(); render(); toast("Saved");
});
$("e-delete").addEventListener("click", async () => {
  if (!confirm("Delete this password?")) return;
  const x = session.data.entries.find((e) => e.id === editingId);
  // Keep a "tombstone" so the deletion also syncs to other devices.
  Object.assign(x, { deleted: true, title: "", username: "", password: "", url: "", notes: "", updated: Date.now() });
  $("dlg-entry").close(); await persist(); render(); toast("Deleted");
});

// ---------- sync ----------
function mergeEntries(a, b) {
  const map = new Map();
  for (const x of [...a, ...b]) { const cur = map.get(x.id); if (!cur || (x.updated || 0) > (cur.updated || 0)) map.set(x.id, x); }
  return [...map.values()];
}
// The master password was changed on another device: ask for the new one and switch to it,
// keeping any entries that only exist on this device.
async function adoptRemotePassword(remote) {
  const pw = await askPassword("Your master password was changed on another device. Enter the NEW master password to keep syncing.");
  if (!pw || !session) return false;
  try {
    const s = await unlockVault(pw, remote);
    s.data.entries = mergeEntries(session.data.entries, s.data.entries || []);
    session = s;
    toast("Master password updated on this device", 3500);
    return true;
  } catch { toast("That password didn't work", 3500); return false; }
}

async function doSync({ quiet = false } = {}) {
  if (!driveConfigured()) { if (!quiet) toast("Drive isn't set up yet — see README", 4000); return false; }
  if (!session) return false;
  setSyncStatus("Syncing…"); if (!quiet) toast("Syncing with Google Drive…");
  try {
    const remote = await downloadVault();
    if (remote && session) {
      let remoteData = null;
      try { remoteData = await decryptWithKey(session.key, remote); }
      catch {
        if (localStorage.getItem("safevault.pwChangedPending")) {
          // We changed the password here but the upload didn't finish; our copy is the newest.
        } else if (!(await adoptRemotePassword(remote))) {
          setSyncStatus("Sync paused: the Drive vault uses a different master password. Tap Sync now to enter it.");
          return false;
        }
      }
      if (remoteData) session.data.entries = mergeEntries(session.data.entries, remoteData.entries || []);
    }
    if (!session) return false; // locked while syncing
    localStorage.setItem("safevault.driveLinked", "1");
    await persist({ sync: false });
    await uploadVault(loadBlob());
    for (const k of ["safevault.pendingSync", "safevault.pwChangedPending"]) localStorage.removeItem(k);
    localStorage.setItem("safevault.lastSync", Date.now());
    if (session) render();
    setSyncStatus(lastSyncText()); if (!quiet) toast("Synced ✓");
    return true;
  } catch (e) {
    localStorage.setItem("safevault.pendingSync", "1");
    setSyncStatus(`Not synced (${e.message}). It will retry automatically.`);
    if (!quiet) toast("Sync failed: " + e.message, 4000);
    return false;
  }
}
// Run syncs one at a time so two saves can't race each other.
let syncQueue = Promise.resolve();
let activeSyncs = 0; // spins the cloud icon while any sync is running
function syncNow(opts) {
  activeSyncs++; $("btn-sync").classList.add("syncing");
  return (syncQueue = syncQueue.then(() => doSync(opts)).finally(() => {
    if (--activeSyncs === 0) $("btn-sync").classList.remove("syncing");
  }));
}

$("btn-sync").addEventListener("click", () => syncNow());
$("s-sync").addEventListener("click", () => syncNow());
$("s-signout").addEventListener("click", () => { signOutDrive(); localStorage.removeItem("safevault.driveLinked"); setSyncStatus("Disconnected from Google"); });

// ---------- settings ----------
let gearTurn = 0;
$("btn-settings").addEventListener("click", () => {
  $("btn-settings").querySelector(".gear").style.transform = `rotate(${(gearTurn += 180)}deg)`;
  setSyncStatus(!driveConfigured() ? "Not configured: add your Google Client ID in js/config.js"
    : driveLinked() ? lastSyncText() : "Not connected. Tap Sync now to connect your Google account.");
  $("g-out").value = generatePassword(+$("g-len").value); $("dlg-settings").showModal();
});
$("s-close").addEventListener("click", () => { $("g-out").value = ""; $("dlg-settings").close(); });
$("g-len").addEventListener("input", (e) => { $("g-len-v").textContent = e.target.value; $("g-out").value = generatePassword(+e.target.value); });
$("g-new").addEventListener("click", () => ($("g-out").value = generatePassword(+$("g-len").value)));
$("g-copy").addEventListener("click", () => copy($("g-out").value, "Copied", true));

$("s-export").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(loadBlob())], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = `safevault-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Encrypted backup downloaded");
});
$("s-import").addEventListener("click", () => $("file-import").click());

$("s-change").addEventListener("click", () => { $("c-error").hidden = true; $("dlg-change").showModal(); });
$("c-cancel").addEventListener("click", () => $("dlg-change").close());
$("form-change").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = (m) => { $("c-error").textContent = m; $("c-error").hidden = false; };
  if ($("c-new").value !== $("c-new2").value) return err("New passwords don't match");
  if ($("c-new").value.length < 10) return err("Use at least 10 characters");
  try { await unlockVault($("c-old").value, loadBlob()); } catch { return err("Current password is wrong"); }
  // Pull in other devices' changes first, so re-uploading under the new password loses nothing.
  if (driveLinked() && !(await syncNow({ quiet: true })))
    return err("Couldn't sync with Google Drive first. Check your internet and try again, or Disconnect Google in Settings.");
  const salt = randomBytes(16);
  session.key = await deriveKey($("c-new").value, salt, KDF_ITERATIONS);
  session.salt = salt; session.iter = KDF_ITERATIONS;
  for (const id of ["c-old", "c-new", "c-new2"]) $(id).value = "";
  if (driveLinked()) localStorage.setItem("safevault.pwChangedPending", "1");
  await persist({ sync: false });
  if (driveLinked()) syncNow({ quiet: true });
  $("dlg-change").close(); toast("Master password changed. Use the new one on your other devices too.", 4000);
});

// ---------- start ----------
if (!window.isSecureContext || !crypto.subtle) {
  document.body.textContent = "SafeVault must be opened over HTTPS (or localhost) for security.";
} else {
  show(loadBlob() ? "lock" : "setup");
  if ("serviceWorker" in navigator) {
    // When a new version takes over, offer a reload instead of reloading under the user (that would lock the vault).
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController) $("update-bar").hidden = false; });
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  $("update-reload").addEventListener("click", () => location.reload());
}
