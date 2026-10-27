// Google Drive sync. Uses the narrow "drive.appdata" scope: the app can only see its own
// hidden folder — it can NOT read any of your other Drive files. Only the encrypted vault is uploaded.
import { GOOGLE_CLIENT_ID } from "./config.js";

const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const FILE_NAME = "safevault.json";
let tokenClient = null;
let token = null;
let tokenExpiry = 0;
let gisPromise = null;

export const driveConfigured = () => Boolean(GOOGLE_CLIENT_ID);

function loadGis() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = resolve;
    s.onerror = () => { gisPromise = null; reject(new Error("Could not load Google sign-in (are you offline?)")); };
    document.head.appendChild(s);
  });
  return gisPromise;
}

async function getToken() {
  if (token && Date.now() < tokenExpiry - 60000) return token;
  if (!driveConfigured()) throw new Error("Google Drive is not configured. Add your Client ID in js/config.js.");
  await loadGis();
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({ client_id: GOOGLE_CLIENT_ID, scope: SCOPE, callback: () => {} });
    }
    tokenClient.callback = (r) => {
      if (r.error) return reject(new Error(r.error_description || r.error));
      token = r.access_token; // kept in memory only, never saved
      tokenExpiry = Date.now() + (r.expires_in || 3600) * 1000;
      resolve(token);
    };
    tokenClient.error_callback = (e) => reject(new Error(e.message || "Google sign-in was cancelled"));
    tokenClient.requestAccessToken({ prompt: "" });
  });
}

async function api(url, opts = {}) {
  const t = await getToken();
  const res = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${t}` } });
  if (res.status === 401) { token = null; throw new Error("Google session expired, please try again."); }
  if (!res.ok) throw new Error(`Google Drive error ${res.status}`);
  return res;
}

async function findFile() {
  const q = encodeURIComponent(`name='${FILE_NAME}'`);
  const res = await api(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)`);
  const { files } = await res.json();
  return files && files[0];
}

export async function downloadVault() {
  const f = await findFile();
  if (!f) return null;
  const res = await api(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`);
  return res.json();
}

export async function uploadVault(blob) {
  const body = JSON.stringify(blob);
  const f = await findFile();
  if (f) {
    await api(`https://www.googleapis.com/upload/drive/v3/files/${f.id}?uploadType=media`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body,
    });
    return;
  }
  const boundary = "sv" + crypto.getRandomValues(new Uint32Array(2)).join("");
  const meta = JSON.stringify({ name: FILE_NAME, parents: ["appDataFolder"] });
  const multipart =
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  await api("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body: multipart,
  });
}

export function signOutDrive() {
  if (token && window.google) google.accounts.oauth2.revoke(token, () => {});
  token = null; tokenExpiry = 0;
}
