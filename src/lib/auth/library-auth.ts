import { createHash, randomBytes, timingSafeEqual } from "crypto";

// PBKDF2-like подход через scrypt из node:crypto
import { scryptSync } from "crypto";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const computed = scryptSync(password, salt, 64);
  const stored_buf = Buffer.from(hash, "hex");
  if (computed.length !== stored_buf.length) return false;
  return timingSafeEqual(computed, stored_buf);
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
