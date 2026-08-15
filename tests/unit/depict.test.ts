import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BLOB_MAX, sha256Hex } from "../../src/persist/blob.ts";
import { publicRead } from "../../src/public/read.ts";
import { World, type McpRequest } from "../../src/world/world.ts";

const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": { elicitation: {} },
};

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

function req(method: string, params?: Record<string, unknown>, id = 1): McpRequest {
  return { jsonrpc: "2.0", id, method, params, _meta: META };
}

function call(world: World, body: McpRequest, token?: string) {
  return world.handle({
    body,
    now: 1_000,
    authorization: token === undefined ? undefined : `Bearer ${token}`,
  });
}

function registerNamed(world: World, name: string) {
  const challenge = call(world, req("tools/call", { name: "whoami", arguments: {} }));
  const creds = call(
    world,
    req(
      "tools/call",
      {
        name: "whoami",
        arguments: {},
        inputResponses: { intent: "register" },
        requestState: (challenge.result as { requestState: string }).requestState,
      },
      2,
    ),
  ).result as { identityId: string; sessionToken: string };
  const nameChallenge = call(world, req("tools/call", { name: "whoami", arguments: {} }, 3), creds.sessionToken);
  call(
    world,
    req(
      "tools/call",
      {
        name: "whoami",
        arguments: {},
        inputResponses: { name },
        requestState: (nameChallenge.result as { requestState: string }).requestState,
      },
      4,
    ),
    creds.sessionToken,
  );
  const identity = world.clerk.identities.get(creds.identityId);
  if (identity !== undefined) {
    identity.ticksPresent = 100;
    identity.currency = 40;
  }
  return creds;
}

function defineLikeness(world: World, token: string) {
  call(
    world,
    req(
      "tools/call",
      {
        name: "propose",
        arguments: {
          patch: {
            kind: "schema.define_type",
            name: "likeness",
            fields: {
              caption: { type: "string", visibility: "public" },
              mime: { type: "string", visibility: "public" },
              hash: { type: "string", visibility: "public" },
              painter: { type: "id", visibility: "public" },
              scene: { type: "string", visibility: "public" },
            },
          },
        },
      },
      5,
    ),
    token,
  );
  call(world, req("tools/call", { name: "whoami", arguments: {} }, 6), token);
  world.advanceTick();
}

describe("depict", () => {
  const prior = process.env["AGORA_BLOB_DIR"];
  let dir = "";

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "agora-depict-"));
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

  it("rejects unknown kind free and writes nothing", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const at = world.bodies.get(ada.identityId)!;
    const bytes = webpPad(BLOB_MAX);
    const hash = sha256Hex(bytes);
    const blocked = call(
      world,
      req(
        "tools/call",
        {
          name: "act",
          arguments: {
            verb: "depict",
            kind: "likeness",
            position: `${at.x},${at.y},${at.z}`,
            caption: "Deep Commons",
            mime: "image/webp",
            hash,
            data: bytes.toString("base64"),
          },
        },
        7,
      ),
      ada.sessionToken,
    );
    expect(blocked.result).toMatchObject({ accepted: false, reason: "unknown kind" });
    expect(world.log.events().some((event) => event.type === "act.depict")).toBe(false);
  });

  it("hangs a 48KiB webp beside the log", async () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    defineLikeness(world, ada.sessionToken);
    const at = world.bodies.get(ada.identityId)!;
    const bytes = webpPad(BLOB_MAX);
    const hash = sha256Hex(bytes);
    const accepted = call(
      world,
      req(
        "tools/call",
        {
          name: "act",
          arguments: {
            verb: "depict",
            kind: "likeness",
            position: `${at.x},${at.y},${at.z}`,
            caption: "Deep Commons",
            mime: "image/webp",
            hash,
            data: bytes.toString("base64"),
            scene: "hearth, stall, door, window",
          },
        },
        8,
      ),
      ada.sessionToken,
    );
    expect(accepted.result).toMatchObject({ accepted: true, verb: "depict" });
    world.advanceTick();
    const hung = world.log.events().find((event) => event.type === "act.depict");
    expect(hung).toBeDefined();
    expect(hung?.payload["data"]).toBeUndefined();
    expect(JSON.stringify(hung?.payload).length).toBeLessThan(800);
    const id = hung?.payload["id"];
    expect(typeof id).toBe("string");
    const inspected = call(
      world,
      req("tools/call", { name: "inspect", arguments: { target: id } }, 9),
      ada.sessionToken,
    ).result as { fields: { src: string; hash: string; caption: string; data?: unknown; scene?: string } };
    expect(inspected.fields.hash).toBe(hash);
    expect(inspected.fields.src.endsWith(`/blob/${hash}`)).toBe(true);
    expect(inspected.fields.data).toBeUndefined();
    expect(inspected.fields.scene).toBe("hearth, stall, door, window");
    const seen = call(
      world,
      req("tools/call", { name: "observe", arguments: {} }, 10),
      ada.sessionToken,
    ).result as { narration: string };
    expect(seen.narration).toContain("A likeness hangs here.");
    expect(seen.narration).toContain("Deep Commons");
    expect(seen.narration).not.toContain(hash);
    expect(seen.narration).not.toContain("/blob/");
    const map = publicRead(world, "/map") as { entities: Array<{ hash?: string; caption?: string; data?: unknown }> };
    expect(map.entities.some((item) => item.hash === hash && item.caption === "Deep Commons" && item.data === undefined)).toBe(
      true,
    );

    const { createMcpServer } = await import("../../src/mcp/http.ts");
    const server = createMcpServer(world);
    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      server.close();
      throw new Error("no port");
    }
    const base = `http://127.0.0.1:${address.port}`;
    const ok = await fetch(`${base}/blob/${hash}`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/webp");
    expect(Buffer.from(await ok.arrayBuffer()).equals(bytes)).toBe(true);
    const missing = await fetch(`${base}/blob/${"0".repeat(64)}`);
    expect(missing.status).toBe(404);
    const traversal = await fetch(`${base}/blob/..%2fpackage.json`);
    expect(traversal.status).toBe(404);
    const junk = await fetch(`${base}/blob/not-a-hash`);
    expect(junk.status).toBe(404);
    const cold = new World(world.log);
    cold.hydrate(null);
    const folded = cold.entities.get(String(id));
    expect(folded?.fields["hash"]).toBe(hash);
    expect(folded?.fields["scene"]).toBeUndefined();
    server.close();
  });

  it("rejects hash mismatch, jpeg, and oversize free", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    defineLikeness(world, ada.sessionToken);
    const at = world.bodies.get(ada.identityId)!;
    const bytes = webpPad(100);
    const bad = call(
      world,
      req(
        "tools/call",
        {
          name: "act",
          arguments: {
            verb: "depict",
            kind: "likeness",
            position: `${at.x},${at.y},${at.z}`,
            caption: "no",
            mime: "image/webp",
            hash: "0".repeat(64),
            data: bytes.toString("base64"),
          },
        },
        12,
      ),
      ada.sessionToken,
    );
    expect(bad.result).toMatchObject({ accepted: false, reason: "hash mismatch" });
    const jpeg = call(
      world,
      req(
        "tools/call",
        {
          name: "act",
          arguments: {
            verb: "depict",
            kind: "likeness",
            position: `${at.x},${at.y},${at.z}`,
            caption: "no",
            mime: "image/jpeg",
            hash: sha256Hex(PNG),
            data: PNG.toString("base64"),
          },
        },
        13,
      ),
      ada.sessionToken,
    );
    expect(jpeg.result).toMatchObject({ accepted: false, reason: "mime not allowed" });
    expect(world.log.events().some((event) => event.type === "act.depict")).toBe(false);
  });
});
