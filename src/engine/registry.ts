export const EFFECT_VOCABULARY = [
  "create",
  "destroy",
  "move",
  "transfer",
  "set_field",
  "reveal",
  "emit",
] as const;

export type EffectName = (typeof EFFECT_VOCABULARY)[number];

export const MAX_EFFECTS = 16;

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

export function seedRegistry(): Registry {
  return {
    version: 0,
    meta: { genesisTick: 0, quorumFloor: 4, residencyPeriod: 50 },
    params: {
      tick_seconds: { value: 60, type: "int", tier: 1, min: 1, max: 3600 },
      action_budget: { value: 3, type: "int", tier: 1, min: 1, max: 99 },
      proposal_cost: { value: 10, type: "int", tier: 1, min: 0, max: 1_000_000 },
      amendments_per_tick: { value: 3, type: "int", tier: 1, min: 1, max: 20 },
      cooling_ticks_l1: { value: 10, type: "int", tier: 1, min: 1, max: 10_000 },
      budget_carry_cap: { value: 3, type: "int", tier: 1, min: 0, max: 99 },
      founding_grant: { value: 25, type: "int", tier: 1, min: 0, max: 1_000_000 },
      weight_cap_ticks: { value: 2000, type: "int", tier: 1, min: 1, max: 100_000 },
      weight_decay_rate: { value: 1, type: "int", tier: 1, min: 0, max: 99 },
      participation_quorum: { value: 33, type: "int", tier: 1, min: 1, max: 100 },
      threshold_l1: { value: 67, type: "int", tier: 1, min: 1, max: 100 },
      threshold_l2: { value: 50, type: "int", tier: 1, min: 1, max: 100 },
      fame_decay: { value: 2, type: "int", tier: 1, min: 0, max: 99 },
      notoriety_decay: { value: 5, type: "int", tier: 1, min: 0, max: 999 },
      speak_fame_scaling: { value: 500, type: "int", tier: 1, min: 0, max: 10_000 },
      residency_period: { value: 50, type: "int", tier: 1, min: 1, max: 10_000 },
      mark_length_max: { value: 280, type: "int", tier: 2, min: 1, max: 10_000 },
      cairn_mark_multiplier: { value: 4, type: "int", tier: 2, min: 1, max: 20 },
      hollow_perception: { value: 0, type: "int", tier: 2, min: 0, max: 8 },
      warden_spacing: { value: 16, type: "int", tier: 1, min: 1, max: 64 },
      anchor_count: { value: 24, type: "int", tier: 1, min: 1, max: 64 },
      anchor_radius: { value: 2, type: "int", tier: 1, min: 1, max: 8 },
      anchor_min_separation: { value: 12, type: "int", tier: 1, min: 1, max: 64 },
      drift_population_cap: { value: 40, type: "int", tier: 1, min: 0, max: 400 },
      drift_spawn_interval: { value: 25, type: "int", tier: 1, min: 1, max: 10_000 },
      perception_radius: { value: 8, type: "int", tier: 2, min: 0, max: 64 },
      vantage_perception_mult: { value: 3, type: "int", tier: 2, min: 1, max: 20 },
      currency_per_tick: { value: 1, type: "int", tier: 1, min: 0, max: 1000 },
      speak_base_radius: { value: 12, type: "int", tier: 2, min: 1, max: 64 },
      speak_messages_per_tick: { value: 20, type: "int", tier: 1, min: 1, max: 200 },
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
      agent: { fields: { name: { type: "string" }, position: { type: "vec" } } },
      mark: { fields: { text: { type: "string" }, author: { type: "id" }, position: { type: "vec" }, tick_created: { type: "int" } } },
      warden: { fields: { axis: { type: "string" }, face: { type: "int" }, position: { type: "vec" } } },
      drift: { fields: { position: { type: "vec" }, seed: { type: "string" } } },
      anchor: { fields: { designation: { type: "string" }, class: { type: "string" }, centre: { type: "vec" }, name: { type: "string" } } },
    },
    verbs: {
      move: { cost: 1, params: { delta: "vec" }, preconditions: ["in_bounds", "unoccupied"], effects: [] },
      wait: { cost: 0, params: {}, preconditions: [], effects: [] },
      mark: { cost: 1, params: { text: "string" }, preconditions: ["length_ok", "cell_unmarked"], effects: [] },
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
    },
    tiers: {},
  };
}
