# Security design

## Threat model
SafeVault protects your passwords if **someone gets your vault file**: from Google Drive, from a backup, from GitHub, or from your device storage while the app is locked.
It **cannot** protect you if your device is infected with malware or a keylogger while you unlock the vault, or if your master password is weak or reused.

## Cryptography
- **KDF:** PBKDF2-HMAC-SHA256, 600,000 iterations, 128-bit random salt per vault (new salt whenever the master password changes).
- **Cipher:** AES-256-GCM with a fresh random 96-bit IV on every save. The header (version, KDF, iterations, salt) is authenticated as AAD.
- **Keys:** Derived as non-extractable `CryptoKey` objects; kept in memory only while unlocked and dropped on lock.
- **Randomness:** `crypto.getRandomValues` only. The password generator uses rejection sampling, so there's no modulo bias.
- **Implementation:** the browser's native Web Crypto API. There are no third-party crypto libraries.

### Vault file format
```json
{ "v":1, "kdf":"PBKDF2-SHA256", "iter":600000, "salt":"<b64>", "iv":"<b64>", "ct":"<b64 ciphertext+tag>" }
```
Everything else (site names, usernames, passwords, notes) is inside `ct`.

## Application hardening
- Strict Content-Security-Policy: own scripts plus Google Identity only; no inline scripts; network limited to Google APIs.
- All user data is rendered with `textContent` (never `innerHTML`) to prevent XSS.
- `no-referrer` policy; no analytics, ads, or external fonts.
- The Google OAuth access token is held in memory only; scope is `drive.appdata`.
- Auto-lock on inactivity and when backgrounded; clipboard cleared after 30s.
- Increasing delay after each wrong unlock attempt on the device.

## Known limitations / future work
- PBKDF2 is less resistant to GPU cracking than Argon2id. A long master password is the best defense.
- JavaScript can't guarantee memory wiping of strings.
- The clipboard auto-clear may not work if the app is in the background (OS restriction).
- Hosted web apps rely on the integrity of the hosting (GitHub). Enable 2FA on your GitHub account.

## Reporting a vulnerability
Please open a private security advisory on the GitHub repo instead of a public issue.
