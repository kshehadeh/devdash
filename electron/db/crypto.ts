import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "crypto";
import { safeStorage } from "electron";
import os from "os";

const ALGORITHM = "aes-256-gcm";
const KEY_LEN = 32;
const SALT = "devdash-v1";

/** Envelope for OS keychain-backed ciphertext (stable across hostname / network changes). */
export const SAFE_STORAGE_PREFIX = "dd:ss1:";

function deriveLegacyKey(): Buffer {
  const secret = `${os.hostname()}:${os.userInfo().username}:${SALT}`;
  return pbkdf2Sync(secret, SALT, 100_000, KEY_LEN, "sha256");
}

function encryptLegacy(plaintext: string): string {
  const key = deriveLegacyKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptLegacy(encoded: string): string {
  const key = deriveLegacyKey();
  const [ivB64, authTagB64, dataB64] = encoded.split(":");
  if (!ivB64 || !authTagB64 || !dataB64) {
    throw new Error("Invalid legacy token envelope");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(data).toString("utf8") + decipher.final("utf8");
}

export function encrypt(plaintext: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    const buf = safeStorage.encryptString(plaintext);
    return `${SAFE_STORAGE_PREFIX}${buf.toString("base64")}`;
  }
  return encryptLegacy(plaintext);
}

export function decrypt(encoded: string): string {
  if (encoded.startsWith(SAFE_STORAGE_PREFIX)) {
    const b64 = encoded.slice(SAFE_STORAGE_PREFIX.length);
    return safeStorage.decryptString(Buffer.from(b64, "base64"));
  }
  return decryptLegacy(encoded);
}

/** True if this blob should be rewritten with the current preferred encryption (e.g. migrate legacy → safeStorage). */
export function shouldMigrateEncryptedEnvelope(encoded: string): boolean {
  if (!encoded || encoded.startsWith(SAFE_STORAGE_PREFIX)) return false;
  return safeStorage.isEncryptionAvailable();
}
