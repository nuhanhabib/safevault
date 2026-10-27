# 🔐 SafeVault: a free, encrypted password manager

SafeVault keeps all your passwords (Facebook, Instagram, Gmail, banking…) behind **one master password**.
It runs on **Android, iPhone, Windows, Mac and Linux**, needs **no server or domain**, and syncs between your devices with **your own Google Drive**.

## How it keeps you safe

| Protection | What it means |
|---|---|
| **Zero-knowledge encryption** | Everything is encrypted *on your device* with AES-256-GCM before it's saved or uploaded. Nobody can read it without your master password: not Google, not GitHub, not the developer. |
| **Strong key derivation** | Your master password goes through PBKDF2-SHA256 with 600,000 rounds, which makes guessing very slow. |
| **Master password never stored** | It's not saved anywhere, so it can't leak. *(It also means nobody can recover it if you forget it.)* |
| **Minimal Google permission** | Uses the `drive.appdata` scope: the app can only see its own hidden folder, **not your other Drive files**. |
| **Auto-lock** | Locks after 5 minutes of inactivity, or after 1 minute in the background. |
| **Clipboard auto-clear** | Copied passwords are cleared from the clipboard after 30 seconds. |
| **No third-party code** | Encryption uses the browser's built-in Web Crypto API. There are no npm packages, trackers or analytics. |
| **Content Security Policy** | Blocks any script that isn't ours from running, and blocks network calls to anywhere except Google Drive. |
| **Tamper detection** | If the vault file is changed by anyone, decryption fails instead of loading bad data. |

See [SECURITY.md](SECURITY.md) for the full design.

## 🚀 Put it online for free (GitHub Pages)

1. Create a GitHub repo (e.g. `safevault`) and upload these files.
2. In the repo, open **Settings → Pages → Source: Deploy from a branch → `main` / root → Save**.
3. After about a minute your app is live at `https://YOUR-USERNAME.github.io/safevault/`.

That's free HTTPS hosting, with no domain needed.

## 📱 Install it like an app

- **Android (Chrome):** open the link → ⋮ menu → **Install app** / **Add to Home screen**
- **iPhone (Safari):** open the link → Share → **Add to Home Screen**
- **Windows / Mac (Chrome or Edge):** click the install icon in the address bar

It then opens full-screen with its own icon, and it works offline.

## ☁️ Google Drive sync setup (one time, ~10 minutes)

1. Go to <https://console.cloud.google.com/> → create a project named "SafeVault".
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **APIs & Services → OAuth consent screen** (Google Auth Platform) → External → fill in the app name and your email.
   Add the scope `.../auth/drive.appdata`. While the app is in *Testing*, add yourself (and friends) as **Test users**.
4. **Credentials → Create credentials → OAuth client ID → Web application**.
   Under **Authorized JavaScript origins** add:
   - `https://YOUR-USERNAME.github.io`
   - `http://localhost:8000` (for testing on your computer)
5. Copy the **Client ID** into `js/config.js`:
   ```js
   export const GOOGLE_CLIENT_ID = "1234-abc.apps.googleusercontent.com";
   ```
   The Client ID is public, so committing it is fine. **Never** create or commit a *client secret*. This app doesn't use one.
6. Commit and push. In the app tap ☁️ to sync. On a new phone, choose **Restore from Google Drive**.

> To let the public (not just test users) use your Drive sync, Google needs you to **publish** the consent screen, and it may ask for verification. Until then, up to 100 test users can use it.

## 💻 Run it on your computer

```bash
python3 -m http.server 8000
# open http://localhost:8000
```
(It must be served over `http://localhost` or `https://`. Opening `index.html` directly won't work, because browsers disable encryption APIs on `file://`.)

## Project structure

```
index.html            App screens
style.css             Mobile-first design, light & dark mode
js/crypto.js          Encryption, key derivation, password generator
js/app.js             App logic (lock, list, editor, sync, settings)
js/drive.js           Google Drive (appDataFolder) sync
js/config.js          Your Google Client ID + lock timings
sw.js                 Offline support
manifest.webmanifest  Makes it installable
```

## ⚠️ Important

- **Do not forget your master password.** There is no reset. Write it on paper and keep it somewhere safe.
- Download an **encrypted backup** (Settings) now and then.
- Keep your phone and browser updated, and use a screen lock. No app can protect you from malware on your device.

## License
MIT
