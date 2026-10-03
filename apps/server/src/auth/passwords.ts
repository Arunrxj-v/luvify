/**
 * Password hashing with scrypt (RFC 7914), using Node's built-in `crypto`.
 *
 * scrypt is a memory-hard KDF, so GPU/ASIC crackers gain far less than they do
 * against plain PBKDF2, and it needs no native dependency that could fail to
 * build inside the deployment image. Parameters: N=2^15, r=8, p=1 - 32 MB and
 * ~100-200 ms per hash on a laptop, which is expensive to crack offline without
 * turning a login request into a denial-of-service vector.
 *
 * Stored format (self-describing, so parameters can be raised later without a
 * flag day - old hashes keep verifying with their own parameters):
 *
 *     scrypt$<N>$<r>$<p>$<salt base64url>$<derived key base64url>
 *
 * Passwords are NEVER logged, never returned by an API, and never compared with
 * `===` - comparison is length-checked then `timingSafeEqual`.
 */

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const COST = 32768; // 2^15; self-describing format means this can rise without a migration.
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
/** 128 * N * r * p = 32 MB; the extra headroom keeps `maxmem` above it. */
const MAXMEM = 128 * 1024 * 1024;

/** Longest password accepted - bounds the work an attacker can force per call. */
const MAX_PASSWORD_LENGTH = 256;
const MIN_PASSWORD_LENGTH = 8;

export const PASSWORD_MIN_LENGTH = MIN_PASSWORD_LENGTH;
export const PASSWORD_MAX_LENGTH = MAX_PASSWORD_LENGTH;

/** Format-independent length policy, shared by the API validator and here. */
export function passwordPolicyError(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
  return null;
}

/**
 * Unicode-normalized so "e + ́" and "é" hash identically on every platform -
 * otherwise a password typed on a different keyboard stops matching.
 */
function normalize(password: string): Buffer {
  return Buffer.from(password.normalize("NFC"), "utf8");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(normalize(password), salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELISM,
    maxmem: MAXMEM,
  });
  return [
    "scrypt",
    COST,
    BLOCK_SIZE,
    PARALLELISM,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

interface ParsedHash {
  cost: number;
  block: number;
  parallel: number;
  salt: Buffer;
  derived: Buffer;
}

function parseHash(stored: string): ParsedHash | null {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const cost = Number(parts[1]);
  const block = Number(parts[2]);
  const parallel = Number(parts[3]);
  if (!Number.isInteger(cost) || !Number.isInteger(block) || !Number.isInteger(parallel)) return null;
  // Refuse absurd parameters: a tampered row must not turn one verify into a
  // multi-gigabyte allocation.
  if (cost < 1024 || cost > 1 << 20 || block < 1 || block > 32 || parallel < 1 || parallel > 16) return null;
  try {
    const salt = Buffer.from(parts[4] ?? "", "base64url");
    const derived = Buffer.from(parts[5] ?? "", "base64url");
    if (salt.length === 0 || derived.length === 0) return null;
    return { cost, block, parallel, salt, derived };
  } catch {
    return null;
  }
}

/**
 * Constant-shape work performed when no account matched, so a login probe takes
 * the same time whether or not the email exists (user-enumeration guard).
 * The result is always discarded. `POST /signup` spends the same work on its
 * duplicate-address path for the same reason.
 */
let decoyHash: string | null = null;
export async function burnPasswordTime(password: string): Promise<void> {
  decoyHash ??= await hashPassword("decoy-not-a-real-password");
  await verifyPassword(password, decoyHash);
}

/**
 * Verifies a password against a stored hash. Returns false - never throws - for
 * malformed, empty or missing hashes, so a corrupt row cannot become a login.
 */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) {
    await burnPasswordTime(password);
    return false;
  }
  const parsed = parseHash(stored);
  if (!parsed) {
    await burnPasswordTime(password);
    return false;
  }
  let derived: Buffer;
  try {
    derived = await scrypt(normalize(password), parsed.salt, parsed.derived.length, {
      N: parsed.cost,
      r: parsed.block,
      p: parsed.parallel,
      maxmem: MAXMEM,
    });
  } catch {
    return false;
  }
  if (derived.length !== parsed.derived.length) return false;
  return timingSafeEqual(derived, parsed.derived);
}

/** True when `stored` was produced by the current parameters (cheap upgrade hint). */
export function needsRehash(stored: string | null | undefined): boolean {
  const parsed = stored ? parseHash(stored) : null;
  return !parsed || parsed.cost !== COST || parsed.block !== BLOCK_SIZE || parsed.parallel !== PARALLELISM;
}
