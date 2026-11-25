export const EFFECT_VOCABULARY = [
  "create",
  "destroy",
  "destroy_where",
  "move",
  "transfer",
  "set_field",
  "reveal",
  "emit",
  "expire",
] as const;

export type EffectName = (typeof EFFECT_VOCABULARY)[number];

export const HOOK_VOCABULARY = ["tick_boundary", "move.end", "act.end", "speak.end"] as const;

export type HookName = (typeof HOOK_VOCABULARY)[number];

/** Trigger/effect binds the engine substitutes. Not a new effect primitive. */
export const BIND_VOCABULARY = [
  "$self",
  "$target",
  "$tick",
  "$param.<name>",
  "$each_<type>",
  "$nearest_body",
  "$toward",
  "$oracle_position",
  "$oracle_step",
] as const;

export const PREDICATE_VOCABULARY = [
  "in_bounds",
  "unoccupied",
  "length_ok",
  "cell_unmarked",
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "mod",
  "within",
  "within_reach",
  "type_is",
  "field_eq",
  "owner_is",
  "exists",
  "count_where",
  "and",
  "or",
  "not",
] as const;

export const SEED_VERBS = new Set(["move", "wait", "mark", "depict", "craft", "edit", "give", "dismantle", "run"]);
export const SEED_TRIGGERS = new Set(["drift_spawn", "drift_walk"]);

export const MAX_EFFECTS = 32;

export const LAYER0_PATHS = new Set([
  "identity.root_secret_unique",
  "log.append_only",
  "fold.deterministic",
  "amendment.typed",
  "enfranchise.nonzero",
  "budget.exists",
  "arbiter.exists",
  "steward.sunset",
]);

export interface RegistryParam {
  value: number;
  type: "int";
  tier: 1 | 2;
  min?: number;
  max?: number;
  lastAmendment?: number;
}

export interface Registry {
  version: number;
  meta: {
    genesisTick: number;
    quorumFloor: number;
    residencyPeriod: number;
  };
  params: Record<string, RegistryParam>;
  space: {
    topology: "lattice";
    axes: Array<{ name: string; size: number; wrap: boolean; writable: boolean; lastAmendment?: number }>;
    anchorClass?: Record<string, "nexus" | "cairn" | "vantage" | "hollow">;
    extraAnchors?: Array<{
      designation: string;
      class: "nexus" | "cairn" | "vantage" | "hollow";
      centre: { x: number; y: number; z: number };
    }>;
    removedAnchors?: string[];
  };
  types: Record<string, { fields: Record<string, { type: string; default?: unknown; visibility?: string }> }>;
  verbs: Record<
    string,
    { cost: number; params: Record<string, string>; preconditions: unknown[]; effects: unknown[] }
  >;
  triggers: Record<string, { when: string; condition: unknown; effects: unknown[] }>;
  text: Record<string, string | null>;
  tiers: Record<string, 1 | 2>;
}

export const PATCH_EXAMPLES: Record<string, Record<string, unknown>> = {
  "param.set": { kind: "param.set", path: "params.perception_radius", value: 16 },
  "text.set": { kind: "text.set", path: "text.world_name", value: "Your World Name" },
  "space.op": { kind: "space.op", op: "reclassify", designation: "26b8", class: "vantage" },
  "schema.define_type": {
    kind: "schema.define_type",
    name: "bounty",
    fields: {
      title: { type: "string", visibility: "public" },
      owner: { type: "id", visibility: "public" },
      currency: { type: "int", visibility: "public", default: 0 },
    },
  },
  "schema.extend_type": {
    kind: "schema.extend_type",
    type: "bounty",
    fields: { status: { type: "string", visibility: "public", default: "open" } },
  },
  "action.define": {
    kind: "action.define",
    name: "post_bounty",
    cost: 1,
    params: { title: "string", position: "string" },
    preconditions: [{ pred: "within_reach", args: ["$position"] }],
    effects: [
      { effect: "create", args: ["bounty", "$position", { title: "$title", owner: "$self", currency: 0 }] },
      { effect: "emit", args: ["bounty.posted"] },
    ],
  },
  "action.update": {
    kind: "action.update",
    name: "post_bounty",
    cost: 1,
    params: { title: "string", position: "string" },
    preconditions: [{ pred: "within_reach", args: ["$position"] }],
    effects: [
      { effect: "create", args: ["bounty", "$position", { title: "$title", owner: "$self", currency: 0 }] },
      { effect: "emit", args: ["bounty.posted"] },
    ],
  },
  "action.remove": { kind: "action.remove", name: "post_bounty" },
  "rule.define_trigger": {
    kind: "rule.define_trigger",
    id: "bounty_expire",
    when: "tick_boundary",
    condition: { pred: "mod", args: ["$tick", 10, 0] },
    effects: [{ effect: "expire", args: ["bounty", 100] }],
  },
  "rule.update_trigger": {
    kind: "rule.update_trigger",
    id: "bounty_expire",
    when: "tick_boundary",
    condition: { pred: "mod", args: ["$tick", 20, 0] },
    effects: [{ effect: "expire", args: ["bounty", 200] }],
  },
  "rule.remove_trigger": { kind: "rule.remove_trigger", id: "bounty_expire" },
  "tier.move": { kind: "tier.move", path: "params.perception_radius", tier: 1 },
  revert: { kind: "revert", proposalId: 1 },
};

export function seedRegistry(): Registry {
  return {
    version: 0,
    meta: { genesisTick: 0, quorumFloor: 4, residencyPeriod: 50 },
    params: {
      tick_seconds: { value: 15, type: "int", tier: 1, min: 1, max: 3600 },
      action_budget: { value: 10, type: "int", tier: 1, min: 1, max: 500 },
      proposal_cost: { value: 10, type: "int", tier: 1, min: 0, max: 1_000_000 },
      amendments_per_tick: { value: 10, type: "int", tier: 1, min: 1, max: 100 },
      cooling_ticks_l1: { value: 8, type: "int", tier: 1, min: 1, max: 10_000 },
      budget_carry_cap: { value: 25, type: "int", tier: 1, min: 0, max: 500 },
      founding_grant: { value: 100, type: "int", tier: 1, min: 0, max: 1_000_000 },
      weight_cap_ticks: { value: 2000, type: "int", tier: 1, min: 1, max: 100_000 },
      weight_decay_rate: { value: 1, type: "int", tier: 1, min: 0, max: 99 },
      participation_quorum: { value: 33, type: "int", tier: 1, min: 1, max: 100 },
      threshold_l1: { value: 67, type: "int", tier: 1, min: 1, max: 100 },
      threshold_l2: { value: 50, type: "int", tier: 1, min: 1, max: 100 },
      fame_decay: { value: 2, type: "int", tier: 1, min: 0, max: 99 },
      notoriety_decay: { value: 5, type: "int", tier: 1, min: 0, max: 999 },
      standing_name_threshold: { value: 3, type: "int", tier: 1, min: 0, max: 1000 },
      speak_fame_scaling: { value: 500, type: "int", tier: 1, min: 0, max: 10_000 },
      residency_period: { value: 50, type: "int", tier: 1, min: 1, max: 10_000 },
      mark_length_max: { value: 1000, type: "int", tier: 2, min: 1, max: 50_000 },
      artifact_data_max: { value: 16_000, type: "int", tier: 2, min: 100, max: 100_000 },
      cairn_mark_multiplier: { value: 4, type: "int", tier: 2, min: 1, max: 20 },
      hollow_perception: { value: 0, type: "int", tier: 2, min: 0, max: 16 },
      warden_spacing: { value: 16, type: "int", tier: 1, min: 1, max: 64 },
      anchor_count: { value: 24, type: "int", tier: 1, min: 1, max: 64 },
      anchor_radius: { value: 2, type: "int", tier: 1, min: 1, max: 8 },
      anchor_min_separation: { value: 12, type: "int", tier: 1, min: 1, max: 64 },
      drift_population_cap: { value: 100, type: "int", tier: 1, min: 0, max: 1000 },
      drift_spawn_interval: { value: 25, type: "int", tier: 1, min: 1, max: 10_000 },
      perception_radius: { value: 16, type: "int", tier: 2, min: 0, max: 64 },
      max_move_step: { value: 5, type: "int", tier: 2, min: 1, max: 64 },
      reach: { value: 16, type: "int", tier: 2, min: 1, max: 64 },
      vantage_perception_mult: { value: 3, type: "int", tier: 2, min: 1, max: 20 },
      currency_per_tick: { value: 5, type: "int", tier: 1, min: 0, max: 10_000 },
      speak_base_radius: { value: 16, type: "int", tier: 2, min: 1, max: 64 },
      speak_messages_per_tick: { value: 200, type: "int", tier: 1, min: 1, max: 10_000 },
      nexus_speak_multiplier: { value: 4, type: "int", tier: 2, min: 1, max: 20 },
      feed_lag: { value: 100, type: "int", tier: 1, min: 0, max: 10_000 },
    },
    space: {
      topology: "lattice",
      axes: [
        { name: "x", size: 64, wrap: false, writable: true },
        { name: "y", size: 64, wrap: false, writable: true },
        { name: "z", size: 64, wrap: false, writable: true },
        { name: "t", size: 128, wrap: false, writable: false },
      ],
    },
    types: {
      agent: { fields: { name: { type: "string", visibility: "public" }, position: { type: "vec", visibility: "public" } } },
      mark: { fields: { text: { type: "string", visibility: "public" }, author: { type: "id", visibility: "public" }, position: { type: "vec", visibility: "public" }, tick_created: { type: "int", visibility: "public" } } },
      warden: { fields: { axis: { type: "string", visibility: "public" }, face: { type: "int", visibility: "public" }, position: { type: "vec", visibility: "public" } } },
      drift: { fields: { position: { type: "vec", visibility: "public" }, seed: { type: "string", visibility: "public" } } },
      anchor: { fields: { designation: { type: "string", visibility: "public" }, class: { type: "string", visibility: "public" }, centre: { type: "vec", visibility: "public" }, name: { type: "string", visibility: "public" } } },
      artifact: {
        fields: {
          kind: { type: "string", visibility: "public" },
          name: { type: "string", visibility: "public" },
          shape: { type: "string", visibility: "public" },
          tags: { type: "string", visibility: "public" },
          data: { type: "string", visibility: "public" },
          owner: { type: "id", visibility: "public" },
          parent: { type: "id", visibility: "public" },
          cites: { type: "string", visibility: "public" },
          currency: { type: "int", visibility: "public", default: 0 },
          visibility: { type: "string", visibility: "public", default: "public" },
        },
      },
    },
    verbs: {
      move: { cost: 1, params: { delta: "vec" }, preconditions: ["in_bounds", "unoccupied"], effects: [] },
      wait: { cost: 0, params: {}, preconditions: [], effects: [] },
      mark: { cost: 1, params: { text: "string" }, preconditions: ["length_ok", "cell_unmarked"], effects: [] },
      depict: {
        cost: 1,
        params: { kind: "string", position: "string", caption: "string", mime: "string", hash: "string", data: "string", scene: "string" },
        preconditions: [],
        effects: [],
      },
      craft: {
        cost: 1,
        params: { kind: "string", name: "string", shape: "string", data: "string", tags: "string", parent: "id", cites: "string", position: "string", visibility: "string" },
        preconditions: [],
        effects: [],
      },
      edit: {
        cost: 1,
        params: { target: "id", kind: "string", name: "string", shape: "string", data: "string", tags: "string", cites: "string", visibility: "string" },
        preconditions: [],
        effects: [],
      },
      give: {
        cost: 1,
        params: { target: "id", amount: "int", item: "id" },
        preconditions: [],
        effects: [],
      },
      dismantle: {
        cost: 1,
        params: { target: "id" },
        preconditions: [],
        effects: [],
      },
      run: {
        cost: 1,
        params: { target: "id", input: "string", arg: "string" },
        preconditions: [],
        effects: [],
      },
    },
    triggers: {
      drift_spawn: {
        when: "tick_boundary",
        condition: { pred: "mod", args: ["$tick", "$drift_spawn_interval", 0] },
        effects: [{ effect: "create", args: ["drift", "$oracle_position", {}] }],
      },
      drift_walk: {
        when: "tick_boundary",
        condition: null,
        effects: [{ effect: "move", args: ["$each_drift", "$oracle_step"] }],
      },
    },
    text: {
      world_name: null,
      world_lore: null,
      "narrate.empty": "An unmarked lattice.",
      "narrate.mark": "A mark is inscribed here.",
      "narrate.occupied": "Others occupy this cell.",
      "narrate.anchor": "Inside {label}, a {class}.",
      "narrate.warden": "Axis {axis} size {size}. Last amendment {amendmentId}. Amend space.axes.{axis}.size at Layer 1.",
      "narrate.likeness": "A likeness hangs here.",
    },
    tiers: {},
  };
}
