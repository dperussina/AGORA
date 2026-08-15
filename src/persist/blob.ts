import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const BLOB_MAX = 49_152;
export const HASH_RE = /^[0-9a-f]{64}$/;

export function blobDir(): string {
  const explicit = process.env["AGORA_BLOB_DIR"];
  if (explicit !== undefined && explicit.length > 0) {
    return explicit;
  }
  const log = process.env["AGORA_LOG"];
  if (log !== undefined && log.length > 0) {
    return join(dirname(log), "blob");
  }
  return "./blob";
}

export function sniffMime(bytes: Buffer): "image/png" | "image/webp" | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function decodeDepictData(raw: string): Buffer | null {
  const stripped = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
  const normalized = stripped.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (normalized.length === 0 || !/^[A-Za-z0-9+/]+=*$/.test(normalized)) {
    return null;
  }
  const bytes = Buffer.from(normalized, "base64");
  return bytes.length === 0 ? null : bytes;
}

export function checkBlob(
  hash: string,
  bytes: Buffer,
  mime: string,
): { ok: true } | { ok: false; reason: string } {
  if (!HASH_RE.test(hash)) {
    return { ok: false, reason: "hash must be 64 hex" };
  }
  if (bytes.length > BLOB_MAX) {
    return { ok: false, reason: "blob too large" };
  }
  if (mime !== "image/webp" && mime !== "image/png") {
    return { ok: false, reason: "mime not allowed" };
  }
  const sniffed = sniffMime(bytes);
  if (sniffed === null || sniffed !== mime) {
    return { ok: false, reason: "magic mismatch" };
  }
  if (sha256Hex(bytes) !== hash) {
    return { ok: false, reason: "hash mismatch" };
  }
  return { ok: true };
}

export function putBlob(
  hash: string,
  bytes: Buffer,
  mime: string,
): { ok: true } | { ok: false; reason: string } {
  const checked = checkBlob(hash, bytes, mime);
  if (!checked.ok) {
    return checked;
  }
  const dir = blobDir();
  mkdirSync(dir, { recursive: true });
  const path = join(dir, hash);
  if (existsSync(path)) {
    const existing = readFileSync(path);
    return sha256Hex(existing) === hash ? { ok: true } : { ok: false, reason: "hash collision" };
  }
  writeFileSync(path, bytes);
  return { ok: true };
}

export function getBlob(hash: string): { bytes: Buffer; mime: string } | null {
  if (!HASH_RE.test(hash)) {
    return null;
  }
  const path = join(blobDir(), hash);
  if (!existsSync(path)) {
    return null;
  }
  const bytes = readFileSync(path);
  const mime = sniffMime(bytes);
  if (mime === null) {
    return null;
  }
  return { bytes, mime };
}
