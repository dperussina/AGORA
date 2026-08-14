import { ZERO_HASH, type Event, type FoldState } from "./types.ts";

export function genesisState(): FoldState {
  return {
    tipSeq: -1,
    tipHash: ZERO_HASH,
    tick: 0,
    rulesetVersion: 0,
    mutable: {},
    oracleCursor: 0,
  };
}

export function fold(state: FoldState, event: Event): FoldState {
  const next: FoldState = {
    tipSeq: event.seq,
    tipHash: event.hash,
    tick: event.tick,
    rulesetVersion: state.rulesetVersion,
    mutable: { ...state.mutable },
    oracleCursor: state.oracleCursor,
  };

  if (event.type === "amendment.applied" || event.type === "amendment.provisional") {
    next.rulesetVersion = state.rulesetVersion + 1;
  }
  if (event.type === "amendment.reverted") {
    next.rulesetVersion = Math.max(0, state.rulesetVersion - 1);
  }
  if (event.type === "act.move" || event.type === "identity.spawn") {
    const actor = event.actor.startsWith("identity:") ? event.actor.slice("identity:".length) : "";
    const x = event.payload["x"];
    const y = event.payload["y"];
    const z = event.payload["z"];
    if (actor !== "" && typeof x === "number" && typeof y === "number" && typeof z === "number") {
      next.mutable[`pos:${actor}`] = `${x},${y},${z}`;
    }
  }
  if (event.type === "act.mark") {
    const x = event.payload["x"];
    const y = event.payload["y"];
    const z = event.payload["z"];
    const text = event.payload["text"];
    if (typeof x === "number" && typeof y === "number" && typeof z === "number" && typeof text === "string") {
      next.mutable[`mark:${x},${y},${z}`] = text;
    }
  }
  if (event.type === "append_test") {
    const set = event.payload["set"];
    if (set !== null && typeof set === "object" && !Array.isArray(set)) {
      const entries = Object.entries(set as Record<string, unknown>).sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0,
      );
      for (const [key, value] of entries) {
        if (
          value === null ||
          typeof value === "string" ||
          typeof value === "boolean" ||
          (typeof value === "number" && Number.isInteger(value))
        ) {
          next.mutable[key] = value;
        }
      }
    }
  }

  return next;
}

export function foldAll(events: readonly Event[], from: FoldState = genesisState()): FoldState {
  let state = from;
  for (const event of events) {
    state = fold(state, event);
  }
  return state;
}
