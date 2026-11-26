import { beforeAll, describe, expect, it } from "vitest";
import { initSandbox, runSandboxScript } from "../../src/engine/sandbox.ts";
import { foldWorld } from "../../src/engine/world-fold.ts";
import { publicRead } from "../../src/public/read.ts";
import { World, type McpRequest } from "../../src/world/world.ts";

const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": { elicitation: {} },
};

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

function quickRegister(world: World, name: string) {
  return call(
    world,
    req("tools/call", { name: "whoami", arguments: { intent: "register", name } }),
  ).result as { identityId: string; sessionToken: string; name: string };
}

describe("QuickJS WebAssembly Code Execution Sandbox", () => {
  beforeAll(async () => {
    await initSandbox();
  });

  it("executes real ES2023 JS deterministically, captures stdout, and terminates infinite loops safely", () => {
    const r1 = runSandboxScript(
      `console.log("hi", arg); return { sum: [1,2,3,4].reduce((a,b)=>a+b, 0), roll: Math.random(), now: Date.now() };`,
      { targetId: "ent:1", selfId: "id_a", tick: 7, input: "go", arg: "world", treasury: 0 },
    );
    const r2 = runSandboxScript(
      `console.log("hi", arg); return { sum: [1,2,3,4].reduce((a,b)=>a+b, 0), roll: Math.random(), now: Date.now() };`,
      { targetId: "ent:1", selfId: "id_a", tick: 7, input: "go", arg: "world", treasury: 0 },
    );
    expect(r1.ok).toBe(true);
    expect(r1).toEqual(r2);
    if (r1.ok) {
      expect(r1.stdout).toEqual(["hi world"]);
      expect((r1.result as { sum: number; now: number }).sum).toBe(10);
      expect((r1.result as { sum: number; now: number }).now).toBe(7000);
    }

    // Infinite loop must be interrupted cleanly by the 50ms CPU cap
    const loop = runSandboxScript(`while (true) {}`, {
      targetId: "ent:1",
      selfId: "id_a",
      tick: 7,
      input: "hang",
      treasury: 0,
    });
    expect(loop.ok).toBe(false);
    if (!loop.ok) {
      expect(loop.reason).toContain("sandbox error");
    }

    // No host/Node globals exist inside WASM
    const host = runSandboxScript(`return { proc: typeof process, req: typeof require, fet: typeof fetch };`, {
      targetId: "ent:1",
      selfId: "id_a",
      tick: 7,
      input: "probe",
      treasury: 0,
    });
    expect(host.ok).toBe(true);
    if (host.ok) {
      expect(host.result).toEqual({ proc: "undefined", req: "undefined", fet: "undefined" });
    }
  });

  it("supports ephemeral inline code execution and stateful economic script artifacts with foldWorld replay", () => {
    const world = new World();
    const ada = quickRegister(world, "Ada");
    const bob = quickRegister(world, "Bob");

    // 1. Ephemeral inline JS execution via act(verb:'run', code:'...', immediate:true)
    const inline = call(
      world,
      req("tools/call", {
        name: "act",
        arguments: {
          verb: "run",
          immediate: true,
          code: `const fib = (n) => n <= 1 ? n : fib(n-1) + fib(n-2); return { reply: "fib(10)=" + fib(10), val: fib(10) };`,
        },
      }),
      ada.sessionToken,
    ).result as { accepted: boolean; resolved: boolean; outcome: { reply: string; result: { val: number } } };
    expect(inline.accepted).toBe(true);
    expect(inline.resolved).toBe(true);
    expect(inline.outcome.reply).toBe("fib(10)=55");
    expect(inline.outcome.result.val).toBe(55);

    // 2. Stateful economic script artifact (funded with 25 coin, pays 8 coin when Bob passes prime check)
    const scriptArtifact = JSON.stringify({
      state: { solved: 0, winners: [] },
      code: `
        const n = Number(arg);
        const isPrime = n > 1 && Array.from({ length: Math.floor(Math.sqrt(n)) - 1 }, (_, i) => i + 2).every((d) => n % d !== 0);
        if (input === "check" && isPrime && n > 100) {
          state.solved += 1;
          state.winners.push(self);
          return { reply: n + " is prime! Paid 8 coin.", payout: 8, state };
        }
        return { reply: n + " is not a valid prime > 100", state };
      `,
    });
    const crafted = call(
      world,
      req("tools/call", {
        name: "act",
        arguments: { verb: "craft", immediate: true, kind: "script", name: "Prime Bounty", data: scriptArtifact },
      }),
      ada.sessionToken,
    ).result as { accepted: boolean; outcome: { id: string } };
    const scriptId = crafted.outcome.id;

    call(
      world,
      req("tools/call", {
        name: "act",
        arguments: { verb: "give", immediate: true, target: scriptId, amount: 25 },
      }),
      ada.sessionToken,
    );

    const bobBefore = world.clerk.identities.get(bob.identityId)!.currency;
    const ran = call(
      world,
      req("tools/call", {
        name: "act",
        arguments: { verb: "run", immediate: true, target: scriptId, input: "check", arg: "101" },
      }),
      bob.sessionToken,
    ).result as { accepted: boolean; outcome: { reply: string; payoutReceived: number; treasury: number } };
    expect(ran.accepted).toBe(true);
    expect(ran.outcome.reply).toBe("101 is prime! Paid 8 coin.");
    expect(ran.outcome.payoutReceived).toBe(8);
    expect(ran.outcome.treasury).toBe(17);
    expect(world.clerk.identities.get(bob.identityId)!.currency).toBe(bobBefore + 8);

    // Appears in whoami.briefing.directory.scripts
    const who = call(world, req("tools/call", { name: "whoami", arguments: {} }), bob.sessionToken).result as {
      briefing: { directory: { scripts: Array<{ id: string; treasury: number }> } };
    };
    expect(who.briefing.directory.scripts.some((s) => s.id === scriptId && s.treasury === 17)).toBe(true);

    // Exact replay equivalence via foldWorld
    const folded = foldWorld(world.log.events());
    expect(folded.entities[scriptId]?.fields["data"]).toBe(world.entities.get(scriptId)?.fields["data"]);
    expect(folded.entities[scriptId]?.fields["currency"]).toBe(17);
  });

  it("supports time-based scheduled artifacts (every/atTick seasons) and reactive onEvent if/else triggers", () => {
    const world = new World();
    const ada = quickRegister(world, "Ada");
    const bob = quickRegister(world, "Bob");

    // 1. Time-based seasonal clock (fires every 3 ticks)
    const seasonData = JSON.stringify({
      every: 3,
      state: { season: "Spring", cycle: 0 },
      code: `
        const seasons = ["Spring", "Summer", "Autumn", "Winter"];
        state.cycle += 1;
        state.season = seasons[state.cycle % 4];
        return { reply: "Season shifted to " + state.season, state };
      `,
    });
    const seasonCraft = call(
      world,
      req("tools/call", {
        name: "act",
        arguments: { verb: "craft", immediate: true, kind: "script", name: "World Seasons", data: seasonData },
      }),
      ada.sessionToken,
    ).result as { outcome: { id: string } };
    const seasonId = seasonCraft.outcome.id;

    // 2. Reactive onEvent if/else trigger (if someone speaks "open sesame", pay 5 coin; else stay silent)
    const gateData = JSON.stringify({
      onEvent: ["speak"],
      state: { opens: 0 },
      code: `
        const ev = JSON.parse(arg || "{}");
        if (typeof ev.text === "string" && ev.text.toLowerCase().includes("open sesame")) {
          state.opens += 1;
          return { reply: "The Vault Gate opens for " + self + "!", payout: 5, state };
        } else {
          return { silent: true, state };
        }
      `,
    });
    const gateCraft = call(
      world,
      req("tools/call", {
        name: "act",
        arguments: { verb: "craft", immediate: true, kind: "script", name: "Sesame Gate", data: gateData },
      }),
      ada.sessionToken,
    ).result as { outcome: { id: string } };
    const gateId = gateCraft.outcome.id;
    call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "give", immediate: true, target: gateId, amount: 15 } }),
      ada.sessionToken,
    );

    // Advance 3 ticks (keeping Ada present each tick) -> tick 3 triggers World Seasons!
    for (let i = 0; i < 3; i += 1) {
      call(world, req("tools/call", { name: "whoami", arguments: {} }), ada.sessionToken);
      world.advanceTick(2_000 + i * 1_000);
    }
    const seasonAfter = JSON.parse(String(world.entities.get(seasonId)?.fields["data"])) as {
      state: { season: string; cycle: number };
    };
    expect(seasonAfter.state).toEqual({ season: "Summer", cycle: 1 });
    expect(world.log.events().some((e) => e.type === "act.run" && e.payload["scheduled"] === true)).toBe(true);

    // Bob speaks unrelated phrase -> gate stays silent, no payout
    const bobBefore = world.clerk.identities.get(bob.identityId)!.currency;
    call(world, req("tools/call", { name: "speak", arguments: { broadcast: true, text: "hello world" } }), bob.sessionToken);
    expect(world.clerk.identities.get(bob.identityId)!.currency).toBe(bobBefore);

    // Bob speaks "open sesame" -> reactive if/else trigger fires and pays Bob 5 coin!
    call(world, req("tools/call", { name: "speak", arguments: { broadcast: true, text: "Please open sesame!" } }), bob.sessionToken);
    expect(world.clerk.identities.get(bob.identityId)!.currency).toBe(bobBefore + 5);
    expect(world.log.events().some((e) => e.type === "act.run" && e.payload["reactive"] === true)).toBe(true);

    // Deterministic replay equivalence via foldWorld
    const folded = foldWorld(world.log.events());
    expect(folded.entities[seasonId]?.fields["data"]).toBe(world.entities.get(seasonId)?.fields["data"]);
    expect(folded.entities[gateId]?.fields["currency"]).toBe(10);
  });

  it("never crashes on float returns (Math.random / decimals) and enforces maxFee cap against balance-draining scripts", () => {
    const world = new World();
    const ada = quickRegister(world, "Ada");
    const bob = quickRegister(world, "Bob");

    // P0 regression: returning Math.random() or float state must NEVER throw in canonicalJson
    const rand = call(
      world,
      req("tools/call", {
        name: "act",
        arguments: { verb: "run", immediate: true, code: `return { roll: Math.random(), pi: 3.14159265 };` },
      }),
      ada.sessionToken,
    ).result as { accepted: boolean; resolved: boolean; outcome: { result: { roll: string; pi: string } } };
    expect(rand.accepted).toBe(true);
    expect(rand.resolved).toBe(true);
    expect(typeof rand.outcome.result.roll).toBe("string");
    expect(rand.outcome.result.pi).toBe("3.141593");

    // Fee-drain protection: script demanding fee: 80 is blocked by default maxFee (10)
    const drainData = JSON.stringify({
      state: {},
      code: `return { reply: "drained!", fee: 80, state };`,
    });
    const drainCraft = call(
      world,
      req("tools/call", {
        name: "act",
        arguments: { verb: "craft", immediate: true, kind: "script", name: "Drain Trap", data: drainData },
      }),
      ada.sessionToken,
    ).result as { outcome: { id: string } };
    const blocked = call(
      world,
      req("tools/call", {
        name: "act",
        arguments: { verb: "run", immediate: true, target: drainCraft.outcome.id, input: "go" },
      }),
      bob.sessionToken,
    ).result as { accepted: boolean; reason: string };
    expect(blocked.accepted).toBe(false);
    expect(blocked.reason).toContain("exceeds maxFee");
  });

  it("enforces Round 2 hardening: machine maxFee, negative maxFee, artifact BiDi/null, DM privacy, schedule/listener caps, trigger inbox, and /digest wakeup", () => {
    const world = new World();
    const ada = quickRegister(world, "Ada");
    const bob = quickRegister(world, "Bob");

    // 1. Plain state machine enforces default maxFee (10) AND rejects negative maxFee (-1)
    const priceyMachine = JSON.stringify({
      machine: {
        state: { runs: 0 },
        rules: [{ on: "go", fee: 15, set: { runs: "$state.runs + 1" }, reply: "charged 15" }],
      },
    });
    const mCraft = call(
      world,
      req("tools/call", {
        name: "act",
        arguments: { verb: "craft", immediate: true, kind: "machine", name: "Pricey Machine", data: priceyMachine },
      }),
      ada.sessionToken,
    ).result as { outcome: { id: string } };
    const mId = mCraft.outcome.id;

    const mBlocked = call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "run", immediate: true, target: mId, input: "go" } }),
      bob.sessionToken,
    ).result as { accepted: boolean; reason: string };
    expect(mBlocked.accepted).toBe(false);
    expect(mBlocked.reason).toContain("exceeds maxFee");

    const negFee = call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "run", immediate: true, target: mId, input: "go", maxFee: -1 } }),
      bob.sessionToken,
    ).result as { accepted: boolean; reason: string };
    expect(negFee.accepted).toBe(false);
    expect(negFee.reason).toContain("non-negative integer");

    const tipBeforeRun = world.log.tip()!.seq;
    const mAllowed = call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "run", immediate: true, target: mId, input: "go", maxFee: 15 } }),
      bob.sessionToken,
    ).result as { accepted: boolean; outcome: { feePaid: number } };
    expect(mAllowed.accepted).toBe(true);
    expect(mAllowed.outcome.feePaid).toBe(15);

    // 2. /digest wakes Ada when Bob ran her artifact and paid her fee!
    const digest = publicRead(world, "/digest", new URLSearchParams({ for: ada.identityId, since: String(tipBeforeRun) })) as {
      shouldWake: boolean;
      myArtifactRuns: number;
      myEarnings: number;
    };
    expect(digest.shouldWake).toBe(true);
    expect(digest.myArtifactRuns).toBe(1);
    expect(digest.myEarnings).toBe(15);

    // 3. /export.state.json includes standing/fame totals + merkleRoot + stateHash
    const stateExport = publicRead(world, "/export.state.json", new URLSearchParams()) as {
      merkleRoot: string;
      stateHash: string;
      standing: Array<{ id: string; fame: number }>;
    };
    expect(typeof stateExport.merkleRoot).toBe("string");
    expect(stateExport.stateHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stateExport.standing.some((s) => s.id === ada.identityId)).toBe(true);

    // 3b. Direct coin gift wakes Ada in /digest with myGifts + myEarnings + highlights
    const tipBeforeGift = world.log.tip()!.seq;
    call(world, req("tools/call", { name: "act", arguments: { verb: "give", immediate: true, target: ada.identityId, amount: 7 } }), bob.sessionToken);
    const giftDigest = publicRead(world, "/digest", new URLSearchParams({ for: ada.identityId, since: String(tipBeforeGift) })) as {
      shouldWake: boolean;
      myGifts: number;
      myEarnings: number;
      highlights: Array<{ type: string; amount?: number }>;
    };
    expect(giftDigest.shouldWake).toBe(true);
    expect(giftDigest.myGifts).toBe(1);
    expect(giftDigest.myEarnings).toBe(7);
    expect(giftDigest.highlights.some((h) => h.type === "gift" && h.amount === 7)).toBe(true);

    // 4. Artifact name/kind rejects BiDi override and null bytes
    const bidiCraft = call(
      world,
      req("tools/call", {
        name: "act",
        arguments: { verb: "craft", immediate: true, kind: "note", name: "Safe\u202eEvil", data: "hi" },
      }),
      ada.sessionToken,
    ).result as { accepted: boolean; reason: string };
    expect(bidiCraft.accepted).toBe(false);
    expect(bidiCraft.reason).toContain("bidi");

    const nullCraft = call(
      world,
      req("tools/call", {
        name: "act",
        arguments: { verb: "craft", immediate: true, kind: "note", name: "Null\u0000Byte", data: "hi" },
      }),
      ada.sessionToken,
    ).result as { accepted: boolean; reason: string };
    expect(nullCraft.accepted).toBe(false);
    expect(nullCraft.reason).toContain("control");

    // 5. Schedule every < 3 fails loudly at craft time
    const badSched = call(
      world,
      req("tools/call", {
        name: "act",
        arguments: { verb: "craft", immediate: true, kind: "script", name: "Fast Clock", data: JSON.stringify({ every: 2, code: "return { reply: 'x' };" }) },
      }),
      ada.sessionToken,
    ).result as { accepted: boolean; reason: string };
    expect(badSched.accepted).toBe(false);
    expect(badSched.reason).toContain(">= 3");

    // 6. Private DMs NEVER leak to reactive onEvent:"speak" listeners, while public speech DOES fire & delivers reply to actor inbox
    const spyData = JSON.stringify({
      onEvent: ["speak"],
      state: { heard: [] },
      code: `
        const ev = JSON.parse(arg || "{}");
        state.heard.push(ev.text || "");
        return { reply: "Echoed: " + (ev.text || ""), state };
      `,
    });
    const spyCraft = call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "craft", immediate: true, kind: "script", name: "Public Listener", data: spyData } }),
      ada.sessionToken,
    ).result as { outcome: { id: string } };
    const spyId = spyCraft.outcome.id;

    // Bob sends a private targeted DM to Ada -> listener MUST NOT receive it AND plaintext MUST NOT appear in public log!
    call(world, req("tools/call", { name: "speak", arguments: { target: ada.identityId, text: "TOP_SECRET_DM" } }), bob.sessionToken);
    const spyAfterDm = JSON.parse(String(world.entities.get(spyId)?.fields["data"])) as { state: { heard: string[] } };
    expect(spyAfterDm.state.heard).toEqual([]);
    expect(JSON.stringify(world.log.events())).not.toContain("TOP_SECRET_DM");
    const adaObs = call(world, req("tools/call", { name: "observe", arguments: {} }), ada.sessionToken).result as {
      heard: Array<{ from: string; text: string }>;
    };
    expect(adaObs.heard.some((m) => m.text === "TOP_SECRET_DM")).toBe(true);

    // Private artifact: non-owner inspect refused, mailbox notes refused, /state redacts data, and private schedules rejected loudly
    const privArt = call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "craft", immediate: true, kind: "mailbox", name: "Private Diary", visibility: "private", data: "PRIVATE_INTERNAL_DATA" } }),
      ada.sessionToken,
    ).result as { outcome: { id: string } };
    const bobInspectPriv = call(world, req("tools/call", { name: "inspect", arguments: { target: privArt.outcome.id } }), bob.sessionToken).result as {
      ok?: boolean;
      reason?: string;
      fields: Record<string, unknown>;
    };
    expect(bobInspectPriv.ok).toBe(false);
    expect(bobInspectPriv.reason).toContain("private");
    expect(bobInspectPriv.fields["data"]).toBeUndefined();

    const privNoteRes = call(
      world,
      req("tools/call", { name: "speak", arguments: { target: privArt.outcome.id, text: "PRIVATE_DIARY_SECRET" } }),
      ada.sessionToken,
    ).result as { ok: boolean; reason: string };
    expect(privNoteRes.ok).toBe(false);
    expect(privNoteRes.reason).toContain("private");

    const stateSnap = publicRead(world, "/state", new URLSearchParams()) as {
      entities: Record<string, { fields: Record<string, unknown> }>;
    };
    expect(stateSnap.entities[privArt.outcome.id]?.fields["data"]).toBe("[redacted-private]");

    // Non-standard Unicode whitespace (\u00a0, \u3000) rejected in artifact names
    const nbspCraft = call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "craft", immediate: true, kind: "note", name: "Look\u00a0Alike", data: "x" } }),
      ada.sessionToken,
    ).result as { accepted: boolean; reason: string };
    expect(nbspCraft.accepted).toBe(false);
    expect(nbspCraft.reason).toContain("whitespace");

    // Private scheduled script rejected loudly instead of silently no-oping
    const privSched = call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "craft", immediate: true, kind: "script", name: "Hidden Clock", visibility: "private", data: JSON.stringify({ every: 5, code: "return { silent: true };" }) } }),
      ada.sessionToken,
    ).result as { accepted: boolean; reason: string };
    expect(privSched.accepted).toBe(false);
    expect(privSched.reason).toContain("visibility: 'public'");

    // Scheduled artifact cap (max 4 public every/atTick per identity) + past atTick rejected
    const pastAt = call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "craft", immediate: true, kind: "script", name: "Past Clock", data: JSON.stringify({ atTick: 0, code: "return { reply: 'x' };" }) } }),
      bob.sessionToken,
    ).result as { accepted: boolean; reason: string };
    expect(pastAt.accepted).toBe(false);
    for (let i = 0; i < 4; i += 1) {
      const okS = call(
        world,
        req("tools/call", { name: "act", arguments: { verb: "craft", immediate: true, kind: "script", name: `Sched ${i + 1}`, data: JSON.stringify({ every: 5, code: "return { silent: true };" }) } }),
        bob.sessionToken,
      ).result as { accepted: boolean };
      expect(okS.accepted).toBe(true);
    }
    const fifthSched = call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "craft", immediate: true, kind: "script", name: "Sched 5", data: JSON.stringify({ every: 5, code: "return { silent: true };" }) } }),
      bob.sessionToken,
    ).result as { accepted: boolean; reason: string };
    expect(fifthSched.accepted).toBe(false);
    expect(fifthSched.reason).toContain("scheduled artifact limit");

    // Bob speaks publicly -> listener fires AND delivers reply into Bob's inbox!
    call(world, req("tools/call", { name: "speak", arguments: { broadcast: true, text: "PUBLIC_HELLO" } }), bob.sessionToken);
    const spyAfterPub = JSON.parse(String(world.entities.get(spyId)?.fields["data"])) as { state: { heard: string[] } };
    expect(spyAfterPub.state.heard).toEqual(["PUBLIC_HELLO"]);
    const bobObs = call(world, req("tools/call", { name: "observe", arguments: {} }), bob.sessionToken).result as {
      heard: Array<{ from: string; text: string }>;
    };
    expect(bobObs.heard.some((m) => m.from === spyId && m.text.includes("Echoed: PUBLIC_HELLO"))).toBe(true);

    // 7. Per-identity reactive listener cap (max 4 public onEvent artifacts)
    for (let i = 0; i < 3; i += 1) {
      const okL = call(
        world,
        req("tools/call", {
          name: "act",
          arguments: { verb: "craft", immediate: true, kind: "script", name: `Listener ${i + 2}`, data: JSON.stringify({ onEvent: "act.craft", code: "return { silent: true };" }) },
        }),
        ada.sessionToken,
      ).result as { accepted: boolean };
      expect(okL.accepted).toBe(true);
    }
    const fifthListener = call(
      world,
      req("tools/call", {
        name: "act",
        arguments: { verb: "craft", immediate: true, kind: "script", name: "Listener 5", data: JSON.stringify({ onEvent: "act.craft", code: "return { silent: true };" }) },
      }),
      ada.sessionToken,
    ).result as { accepted: boolean; reason: string };
    expect(fifthListener.accepted).toBe(false);
    expect(fifthListener.reason).toContain("listener limit");

    // 8. Private act.craft MUST NOT trigger public onEvent:["act.craft"] listeners
    const craftSpy = call(
      world,
      req("tools/call", {
        name: "act",
        arguments: {
          verb: "craft",
          immediate: true,
          kind: "script",
          name: "Craft Newsletter",
          data: JSON.stringify({ onEvent: ["act.craft"], state: { names: [] }, code: "const ev = JSON.parse(arg || '{}'); state.names.push(ev.name || ''); return { silent: true, state };" }),
        },
      }),
      bob.sessionToken,
    ).result as { outcome: { id: string } };
    call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "craft", immediate: true, kind: "note", name: "Secret Private Craft", visibility: "private", data: "shh" } }),
      ada.sessionToken,
    );
    const spyNames = (JSON.parse(String(world.entities.get(craftSpy.outcome.id)?.fields["data"])) as { state: { names: string[] } }).state.names;
    expect(spyNames).not.toContain("Secret Private Craft");

    // 9. Authenticated whoami does NOT leak sessionToken / operatorReceipt unless includeReceipt:true
    const normalWho = call(world, req("tools/call", { name: "whoami", arguments: {} }), ada.sessionToken).result as Record<string, unknown>;
    expect(normalWho["operatorReceipt"]).toBeUndefined();
    expect(normalWho["connection"]).toBeUndefined();

    // 10. Voting "yes" gives clear "for", "against", or "abstain" hint
    const badVote = call(world, req("tools/call", { name: "vote", arguments: { proposal_id: 1, position: "yes" } }), ada.sessionToken).result as { ok: boolean; reason: string };
    expect(badVote.ok).toBe(false);
    expect(badVote.reason).toContain("for");
    expect(badVote.reason).toContain("against");
    expect(badVote.reason).toContain("abstain");

    // 11. Read-only world view inside QuickJS WASM sandbox (can verify public artifacts & callerPos, NEVER private artifacts)
    const worldCheck = call(
      world,
      req("tools/call", {
        name: "act",
        arguments: {
          verb: "run",
          immediate: true,
          code: `return { hasPos: Boolean(world.callerPos), pubOwner: world.artifact("${mId}")?.owner || null, privVisible: Boolean(world.artifact("${privArt.outcome.id}")), anchorCount: world.anchors.length };`,
        },
      }),
      bob.sessionToken,
    ).result as { accepted: boolean; outcome: { result: { hasPos: boolean; pubOwner: string | null; privVisible: boolean; anchorCount: number } } };
    expect(worldCheck.accepted).toBe(true);
    expect(worldCheck.outcome.result.hasPos).toBe(true);
    expect(worldCheck.outcome.result.pubOwner).toBe(ada.identityId);
    expect(worldCheck.outcome.result.privVisible).toBe(false);
    expect(worldCheck.outcome.result.anchorCount).toBeGreaterThan(0);
  });
});
