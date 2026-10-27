# 🔐 SafeVault

**A free, encrypted password manager I built so I'd only have to remember one password.**

👉 **Live app: <https://nuhanhabib.github.io/safevault/>**

I was tired of reusing passwords and forgetting the ones I didn't reuse. So I made SafeVault: it keeps all my passwords (Facebook, Instagram, Gmail, banking…) behind **one master password**.
It runs on **Android, iPhone, Windows, Mac and Linux**, needs **no server and no domain**, and syncs between my devices through **my own Google Drive**.

## How I kept it safe

| Protection | What it means |
|---|---|
| **Zero-knowledge encryption** | Everything is encrypted *on your device* with AES-256-GCM before it's saved or uploaded. Nobody can read it without your master password: not Google, not GitHub, not me. |
| **Strong key derivation** | Your master password goes through PBKDF2-SHA256 with 600,000 rounds, so guessing it is very slow. |
| **Master password never stored** | It isn't saved anywhere, so it can't leak. *(That also means nobody can recover it if you forget it.)* |
| **Minimal Google permission** | It uses the `drive.appdata` scope: the app sees only its own hidden folder, **not your other Drive files**. |
| **Auto-lock** | Locks after 5 minutes of inactivity, or after 1 minute in the background. |
| **Clipboard auto-clear** | Copied passwords are wiped from the clipboard after 30 seconds. |
| **No third-party code** | Encryption uses the browser's built-in Web Crypto API. No npm packages, trackers or analytics. |
| **Content Security Policy** | Blocks any script that isn't mine and any network call except to Google Drive. |
| **Tamper detection** | If someone changes the vault file, decryption fails instead of loading bad data. |

The full design is in [SECURITY.md](SECURITY.md).

## 📱 Install it like an app

Open <https://nuhanhabib.github.io/safevault/>, then:

- **Android (Chrome):** ⋮ menu → **Install app** / **Add to Home screen**
- **iPhone (Safari):** Share → **Add to Home Screen**
- **Windows / Mac (Chrome or Edge):** click the install icon in the address bar

It opens full-screen with its own icon and works offline.

## ☁️ Google Drive sync setup

Do this once. It gives the app a **Client ID**, which lets it ask Google for permission to save the encrypted vault in your Drive.

### Step 1: Create the project ✅
At <https://console.cloud.google.com/>, create a project named **SafeVault** and make sure it's selected in the top bar.

### Step 2: Turn on the Google Drive API
1. Open <https://console.cloud.google.com/apis/library/drive.googleapis.com> (check the top bar still says **SafeVault**).
2. Click **Enable**.

### Step 3: Set up the Google Auth Platform (consent screen)
1. Open <https://console.cloud.google.com/auth/overview> and click **Get started**.
2. The wizard has 4 parts:
   - **App Information:** App name `SafeVault`, User support email = your Gmail → **Next**
   - **Audience:** choose **External** → **Next**
   - **Contact Information:** your Gmail → **Next**
   - **Finish:** tick "I agree…" → **Continue** → **Create**

### Step 4: Add yourself as a test user
1. In the left menu click **Audience**.
2. Under **Test users**, click **+ Add users**, type your Gmail (and any friend's Gmail who will use it), then **Save**.

> While the app is in *Testing* mode, **only these emails can sign in**. Anyone else gets an "access blocked" error.

### Step 5: Add the Drive permission (scope)
1. In the left menu click **Data Access** → **Add or remove scopes**.
2. In the filter box type `drive.appdata`.
3. Tick **`.../auth/drive.appdata`** → **Update** → **Save** (at the bottom of the page).

### Step 6: Create the Client ID
1. In the left menu click **Clients** → **+ Create client**.
2. **Application type:** `Web application`. **Name:** `SafeVault Web`.
3. Under **Authorized JavaScript origins** click **+ Add URI** twice and add:
   - `https://nuhanhabib.github.io`
   - `http://localhost:8000`

   ⚠️ No `/safevault/` and no slash at the end. Only the origin.
4. Leave **Authorized redirect URIs** empty → **Create**.
5. A popup shows your **Client ID** (it looks like `1234567890-abc123.apps.googleusercontent.com`). Copy it.
   You can ignore the client secret; this app doesn't use one.

### Step 7: Put the Client ID in the app
Open [js/config.js](js/config.js) and paste it between the quotes:
```js
export const GOOGLE_CLIENT_ID = "1234567890-abc123.apps.googleusercontent.com";
```
The Client ID is public, so committing it is fine. **Never** commit a client *secret*.

### Step 8: Push and test
1. Commit and push to GitHub. Wait 1–2 minutes for GitHub Pages to update.
2. Open the live app and **refresh** it (on the installed app, close and reopen it so it picks up the new version).
3. Unlock, tap ☁️, sign in with the Gmail you added in Step 4, and allow access.
4. On a new phone, choose **Restore from Google Drive**.

### If something goes wrong
| Error | Fix |
|---|---|
| `Error 400: origin_mismatch` | The origin in Step 6 doesn't match exactly. It must be `https://nuhanhabib.github.io`. |
| `Access blocked: app has not completed verification` | That email isn't in **Test users** (Step 4). |
| `Error 403: access_denied` | Same as above: add the email as a test user. |
| Drive API error / 403 on upload | The Drive API isn't enabled (Step 2). |
| Changes aren't showing | Changes in Google Cloud can take 5–10 minutes. Wait, then hard-refresh. |

> To let the public (not just test users) use Drive sync, you'd need to **publish** the app in **Audience**, and Google may ask for verification. Until then, up to 100 test users can use it.

## 💻 Run it on your computer

```bash
npx http-server -p 8000 -c-1      # needs Node.js
# or: python -m http.server 8000   # needs Python
# open http://localhost:8000
```
It must be served over `http://localhost` or `https://`. Opening `index.html` directly won't work, because browsers disable the encryption APIs on `file://`.

## 🚀 Host your own copy (free, GitHub Pages)

1. Fork or upload this repo to your GitHub.
2. **Settings → Pages → Source: Deploy from a branch → `main` / root → Save**.
3. About a minute later it's live at `https://YOUR-USERNAME.github.io/safevault/`. Follow the Drive setup above with your own username.

## Project structure

```
index.html            App screens
style.css             Mobile-first design, light & dark mode
js/crypto.js          Encryption, key derivation, password generator
js/app.js             App logic (lock, list, editor, sync, settings)
js/drive.js           Google Drive (appDataFolder) sync
js/config.js          Google Client ID + lock timings
sw.js                 Offline support
manifest.webmanifest  Makes it installable
```

## ⚠️ Important

- **Don't forget your master password.** There's no reset. Write it on paper and keep it somewhere safe.
- Download an **encrypted backup** (Settings) now and then.
- Keep your phone and browser updated and use a screen lock. No app can protect you from malware on your device.

## Author

Made by **Nuhan Habib**. [MIT License](LICENSE)
