import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "crypto";
import os from "os";

const ALGORITHM = "aes-256-gcm";
const KEY_LEN = 32;
const SALT = "devdash-v1"; // constant salt — key is machine-specific, not user-provided

function deriveKey(): Buffer {
  const secret = `${os.hostname()}:${os.userInfo().username}:${SALT}`;
  return pbkdf2Sync(secret, SALT, 100_000, KEY_LEN, "sha256");
}

export function encrypt(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decrypt(encoded: string): string {
  const key = deriveKey();
  const [ivB64, authTagB64, dataB64] = encoded.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(data).toString("utf8") + decipher.final("utf8");
}
