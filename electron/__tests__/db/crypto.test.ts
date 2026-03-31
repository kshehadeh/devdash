import {
  encrypt,
  decrypt,
  shouldMigrateEncryptedEnvelope,
  SAFE_STORAGE_PREFIX,
} from "../../db/crypto";

describe("SAFE_STORAGE_PREFIX", () => {
  it("has the correct value", () => {
    expect(SAFE_STORAGE_PREFIX).toBe("dd:ss1:");
  });
});

describe("encrypt / decrypt (legacy mode)", () => {
  it("round-trips a simple string", () => {
    const plaintext = "ghp_my_secret_token_12345";
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("throws on empty string (empty ciphertext block fails validation)", () => {
    const encrypted = encrypt("");
    // AES-GCM with empty plaintext produces empty ciphertext, which fails the
    // truthy check in decryptLegacy — this is expected behavior since tokens
    // should never be empty.
    expect(() => decrypt(encrypted)).toThrow("Invalid legacy token envelope");
  });

  it("round-trips unicode text", () => {
    const plaintext = "tökéñ-with-ünîcödë-🔑";
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it("round-trips a long string", () => {
    const plaintext = "x".repeat(10_000);
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it("produces different ciphertext each time (random IV)", () => {
    const plaintext = "same-input";
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a).not.toBe(b);
    // Both should still decrypt to the same value
    expect(decrypt(a)).toBe(plaintext);
    expect(decrypt(b)).toBe(plaintext);
  });

  it("legacy encrypted values do not start with the safeStorage prefix", () => {
    const encrypted = encrypt("test");
    expect(encrypted.startsWith(SAFE_STORAGE_PREFIX)).toBe(false);
  });
});

describe("decrypt error handling", () => {
  it("throws on completely invalid data", () => {
    expect(() => decrypt("not-valid-base64-data")).toThrow();
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encrypt("valid-token");
    const parts = encrypted.split(":");
    // Corrupt the ciphertext portion
    parts[2] = "AAAA" + parts[2]!.slice(4);
    expect(() => decrypt(parts.join(":"))).toThrow();
  });

  it("throws on truncated data (missing parts)", () => {
    const encrypted = encrypt("token");
    const parts = encrypted.split(":");
    expect(() => decrypt(parts[0]!)).toThrow("Invalid legacy token envelope");
  });
});

describe("shouldMigrateEncryptedEnvelope", () => {
  it("returns false for legacy encryption when safeStorage is unavailable", () => {
    const encrypted = encrypt("test-token");
    // safeStorage.isEncryptionAvailable() is mocked to return false
    expect(shouldMigrateEncryptedEnvelope(encrypted)).toBe(false);
  });

  it("returns false for safeStorage-prefixed values", () => {
    const safeStorageValue = `${SAFE_STORAGE_PREFIX}${Buffer.from("test").toString("base64")}`;
    expect(shouldMigrateEncryptedEnvelope(safeStorageValue)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(shouldMigrateEncryptedEnvelope("")).toBe(false);
  });
});
