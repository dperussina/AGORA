import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
const LEGACY_N = 1024;

export function scryptN(): number {
  const raw = process.env["AGORA_SCRYPT_N"];
  const parsed = raw === undefined ? 16_384 : Number(raw);
  return Number.isInteger(parsed) && parsed >= 1024 ? parsed : 16_384;
}

export function randomToken(prefix: string, bytes = 32): string {
  return `${prefix}_${randomBytes(bytes).toString("hex")}`;
}

export function hashSecret(secret: string): string {
  const n = scryptN();
  const salt = randomBytes(16);
  const hash = scryptSync(secret, salt, SCRYPT_KEYLEN, {
    N: n,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${n}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifySecret(secret: string, stored: string): boolean {
  if (stored.startsWith("scrypt$")) {
    const parts = stored.split("$");
    const n = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const saltHex = parts[4];
    const hashHex = parts[5];
    if (saltHex === undefined || hashHex === undefined || !Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
      return false;
    }
    return compareScrypt(secret, saltHex, hashHex, n, r, p);
  }
  const [saltHex, hashHex] = stored.split(":");
  if (saltHex === undefined || hashHex === undefined) {
    return false;
  }
  return compareScrypt(secret, saltHex, hashHex, LEGACY_N, SCRYPT_R, SCRYPT_P);
}

function compareScrypt(
  secret: string,
  saltHex: string,
  hashHex: string,
  n: number,
  r: number,
  p: number,
): boolean {
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(secret, salt, expected.length, { N: n, r, p });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hashBearer(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export interface RequestStatePayload {
  v: 1;
  exp: number;
  nonce: string;
  purpose: "first_contact" | "name";
  identityId?: string;
}

export function sealRequestState(serverKey: Buffer, payload: RequestStatePayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", serverKey).update(body, "utf8").digest("base64url");
  return `${body}.${sig}`;
}

export function openRequestState(serverKey: Buffer, token: string, now: number): RequestStatePayload | null {
  const [body, sig] = token.split(".");
  if (body === undefined || sig === undefined) {
    return null;
  }
  const expected = createHmac("sha256", serverKey).update(body, "utf8").digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as RequestStatePayload;
  if (payload.v !== 1 || payload.exp < now) {
    return null;
  }
  return payload;
}

export function isLegalName(name: string): string | null {
  if (name.length < 1 || name.length > 32) {
    return "name must be 1–32 characters";
  }
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    return "name may not contain control characters";
  }
  if (/[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/.test(name)) {
    return "name may not contain zero-width or bidi characters";
  }
  if (/^(arbiter|steward)$/i.test(name.trim())) {
    return "name may not mimic Arbiter or Steward";
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,31}$/.test(name)) {
    return "name charset is letters, digits, space, _ . -";
  }
  return null;
}
