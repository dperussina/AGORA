import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BLOB_MAX, checkBlob, decodeDepictData, getBlob, putBlob, sha256Hex } from "../../src/persist/blob.ts";

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c49444154789c6360010000000500010d0a2db40000000049454e44ae426082",
  "hex",
);

function webpPad(size: number): Buffer {
  const header = Buffer.alloc(12);
  header.write("RIFF", 0);
  header.writeUInt32LE(size - 8, 4);
  header.write("WEBP", 8);
  return Buffer.concat([header, Buffer.alloc(Math.max(0, size - 12), 1)]);
}

describe("blob store", () => {
  const prior = process.env["AGORA_BLOB_DIR"];
  let dir = "";

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "agora-blob-"));
    process.env["AGORA_BLOB_DIR"] = dir;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (prior === undefined) {
      delete process.env["AGORA_BLOB_DIR"];
    } else {
      process.env["AGORA_BLOB_DIR"] = prior;
    }
  });

  it("accepts a matching png and rejects the rest", () => {
    const hash = sha256Hex(PNG);
    expect(putBlob(hash, PNG, "image/png")).toEqual({ ok: true });
    expect(getBlob(hash)?.bytes.equals(PNG)).toBe(true);
    expect(checkBlob(hash, PNG, "image/jpeg").ok).toBe(false);
    expect(checkBlob("ab", PNG, "image/png").ok).toBe(false);
    const big = Buffer.concat([PNG, Buffer.alloc(BLOB_MAX)]);
    expect(checkBlob(sha256Hex(big), big, "image/png").ok).toBe(false);
    const other = Buffer.from("not-an-image");
    expect(checkBlob(sha256Hex(other), other, "image/png").ok).toBe(false);
    expect(checkBlob(createHash("sha256").update("nope").digest("hex"), PNG, "image/png").ok).toBe(false);
  });

  it("stores a 48KiB webp once", () => {
    const bytes = webpPad(BLOB_MAX);
    const hash = sha256Hex(bytes);
    expect(putBlob(hash, bytes, "image/webp")).toEqual({ ok: true });
    expect(putBlob(hash, bytes, "image/webp")).toEqual({ ok: true });
    expect(getBlob(hash)?.mime).toBe("image/webp");
    expect(getBlob(hash)?.bytes.length).toBe(BLOB_MAX);
  });

  it("decodes standard and url-safe base64", () => {
    const raw = PNG.toString("base64");
    expect(decodeDepictData(raw)?.equals(PNG)).toBe(true);
    expect(decodeDepictData(`data:image/png;base64,${raw}`)?.equals(PNG)).toBe(true);
    expect(decodeDepictData(raw.replace(/\+/g, "-").replace(/\//g, "_"))?.equals(PNG)).toBe(true);
    expect(decodeDepictData("%%%")).toBeNull();
  });

  it("does not treat a non-hash as a path", () => {
    expect(getBlob("../secret")).toBeNull();
    expect(getBlob("not-hex")).toBeNull();
  });
});
