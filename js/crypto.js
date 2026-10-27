// SafeVault crypto layer — uses only the browser's built-in Web Crypto API (no third-party code).
// Master password --PBKDF2-SHA256 (600k iterations)--> AES-256-GCM key (non-extractable).
// The master password and the key are never stored or sent anywhere.

export const KDF_ITERATIONS = 600000; // OWASP 2023+ recommendation for PBKDF2-SHA256
const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
export function fromB64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

export async function deriveKey(password, salt, iterations = KDF_ITERATIONS) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false, // non-extractable: JavaScript can't read the raw key bytes
    ["encrypt", "decrypt"]
  );
}

// Header fields are bound to the ciphertext as "additional authenticated data",
// so tampering with them makes decryption fail.
function aad(header) {
  return enc.encode(`safevault|v${header.v}|${header.kdf}|${header.iter}|${header.salt}`);
}

export async function encryptVault(key, salt, iterations, data) {
  const iv = randomBytes(12); // fresh random IV on every save
  const header = { v: 1, kdf: "PBKDF2-SHA256", iter: iterations, salt: toB64(salt) };
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(header) },
    key,
    enc.encode(JSON.stringify(data))
  );
  return { ...header, iv: toB64(iv), ct: toB64(ct) };
}

export async function decryptWithKey(key, blob) {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(blob.iv), additionalData: aad(blob) },
    key,
    fromB64(blob.ct)
  );
  return JSON.parse(dec.decode(pt));
}

// Throws if the password is wrong or the file was modified.
export async function unlockVault(password, blob) {
  if (!blob || blob.v !== 1 || blob.kdf !== "PBKDF2-SHA256") throw new Error("Unsupported vault format");
  const salt = fromB64(blob.salt);
  const key = await deriveKey(password, salt, blob.iter);
  const data = await decryptWithKey(key, blob);
  return { key, salt, iter: blob.iter, data };
}

// Unbiased random password generator (rejection sampling).
export function generatePassword(length = 20, opts = { lower: true, upper: true, digits: true, symbols: true }) {
  const sets = [];
  if (opts.lower) sets.push("abcdefghijkmnopqrstuvwxyz");
  if (opts.upper) sets.push("ABCDEFGHJKLMNPQRSTUVWXYZ");
  if (opts.digits) sets.push("23456789");
  if (opts.symbols) sets.push("!@#$%^&*()-_=+[]{};:,.?");
  if (!sets.length) sets.push("abcdefghijkmnopqrstuvwxyz");
  const all = sets.join("");
  const pick = (chars) => {
    const limit = 256 - (256 % chars.length);
    while (true) {
      const b = crypto.getRandomValues(new Uint8Array(1))[0];
      if (b < limit) return chars[b % chars.length];
    }
  };
  const out = sets.map(pick); // at least one of each chosen type
  while (out.length < length) out.push(pick(all));
  // Fisher–Yates shuffle with secure randomness
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join("");
}

// Rough strength estimate in bits.
export function estimateBits(pw) {
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 32;
  let bits = pw.length * Math.log2(pool || 1);
  if (/(.)\1{2,}/.test(pw)) bits *= 0.8;
  if (/^(password|123456|qwerty|admin|letmein)/i.test(pw)) bits = Math.min(bits, 10);
  return Math.round(bits);
}
