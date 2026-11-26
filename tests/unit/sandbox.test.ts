import { beforeAll, describe, expect, it } from "vitest";
import { initSandbox, runSandboxScript } from "../../src/engine/sandbox.ts";
import { foldWorld } from "../../src/engine/world-fold.ts";
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
});
