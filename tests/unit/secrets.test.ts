import { randomBytes, scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashSecret, verifySecret } from "../../src/identity/secrets.ts";
import { IdentityStore } from "../../src/identity/store.ts";

describe("credential hygiene", () => {
  it("encodes scrypt params and still verifies legacy salt:hash", () => {
    const hashed = hashSecret("root_abc");
    expect(hashed.startsWith("scrypt$1024$")).toBe(true);
    expect(verifySecret("root_abc", hashed)).toBe(true);
    expect(verifySecret("nope", hashed)).toBe(false);
    const salt = randomBytes(16);
    const legacy = scryptSync("old", salt, 32, { N: 1024, r: 8, p: 1 });
    const stored = `${salt.toString("hex")}:${legacy.toString("hex")}`;
    expect(verifySecret("old", stored)).toBe(true);
  });

  it("rejects an expired session", () => {
    const store = new IdentityStore(Buffer.alloc(32));
    const { identity } = store.register();
    const previous = process.env["AGORA_SESSION_TTL_MS"];
    process.env["AGORA_SESSION_TTL_MS"] = "10";
    const { token } = store.mintSession(identity, "short", 100);
    expect(store.authenticate(token, 100)).not.toBeNull();
    expect(store.authenticate(token, 111)).toBeNull();
    if (previous === undefined) {
      delete process.env["AGORA_SESSION_TTL_MS"];
    } else {
      process.env["AGORA_SESSION_TTL_MS"] = previous;
    }
  });
});
