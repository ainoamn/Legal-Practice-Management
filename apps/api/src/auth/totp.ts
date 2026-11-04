import {
  createHmac,
  timingSafeEqual,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Encode(buffer: Buffer) {
  let value = 0,
    bits = 0,
    output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += alphabet[(value >>> bits) & 31];
    }
    value &= (1 << bits) - 1;
  }
  if (bits) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}
export function base32Decode(secret: string) {
  let value = 0,
    bits = 0;
  const bytes: number[] = [];
  for (const char of secret) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("Invalid base32 secret");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 255);
    }
    value &= (1 << bits) - 1;
  }
  return Buffer.from(bytes);
}
// RFC 6238 / RFC 4226 HMAC-SHA1, 30-second steps. Official vectors live in unit tests.
export function totp(secret: string, time = Date.now(), digits = 6) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 30000)));
  const digest = createHmac("sha1", base32Decode(secret))
    .update(counter)
    .digest();
  const offset = digest[digest.length - 1]! & 15;
  return String(
    (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits,
  ).padStart(digits, "0");
}
export function matchCounter(
  secret: string,
  code: string,
  lastCounter: bigint = -1n,
  time = Date.now(),
): bigint | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(time / 30000);
  for (const delta of [0, -1, 1]) {
    const counter = BigInt(current + delta);
    if (counter <= lastCounter) continue;
    if (
      timingSafeEqual(
        Buffer.from(code),
        Buffer.from(totp(secret, Number(counter) * 30000)),
      )
    )
      return counter;
  }
  return null;
}
function key() {
  const encoded = process.env.MFA_ENCRYPTION_KEY ?? "";
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded))
    throw new Error(
      "MFA_ENCRYPTION_KEY must contain 32 random bytes in base64",
    );
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.length !== 32) throw new Error("Invalid MFA encryption key");
  return decoded;
}
export function mfaConfigured() {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}
export function encryptSecret(secret: string, userId: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(userId));
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}
export function decryptSecret(encrypted: string, userId: string) {
  const [version, iv, tag, ciphertext] = encrypted.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext)
    throw new Error("Invalid encrypted MFA secret");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64"),
  );
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
