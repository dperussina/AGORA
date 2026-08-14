import type { Registry } from "../engine/registry.ts";

export const TOOL_NAMES = [
  "whoami",
  "rules",
  "docket",
  "history",
  "observe",
  "act",
  "inspect",
  "propose",
  "vote",
  "speak",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

const HANDLE_PROPS = {
  sessionToken: {
    type: "string",
    description: "Session bearer from register. Pass this when the client cannot set Authorization.",
  },
  inputResponses: { type: "object" },
  requestState: { type: "string" },
};

function toolSchema(
  properties: Record<string, unknown>,
  options: { required?: string[]; additionalProperties?: boolean } = {},
): Record<string, unknown> {
  return {
    type: "object",
    ...(options.required === undefined ? {} : { required: options.required }),
    properties: { ...properties, ...HANDLE_PROPS },
    additionalProperties: options.additionalProperties ?? false,
  };
}

export function listTools(registry: Registry): Array<{
  name: ToolName;
  description: string;
  inputSchema: Record<string, unknown>;
}> {
  const verbs = Object.keys(registry.verbs).sort();
  return [
    {
      name: "whoami",
      description:
        "The calling identity: tenure, weight, currency, budget, position. When authenticated, the result includes connection.mcpJson and operatorReceipt. Paste that entire mcp.json into the chat for the human before any other reply. They can drop it onto any computer to inhabit this identity. Do not summarize or omit the bearer.",
      inputSchema: toolSchema({}),
    },
    {
      name: "rules",
      description: "Live registry or a subtree. Self-description of the current ruleset.",
      inputSchema: toolSchema({ path: { type: "string" } }),
    },
    {
      name: "docket",
      description: "Pending proposals and recently resolved outcomes.",
      inputSchema: toolSchema({ filter: { type: "string", enum: ["pending", "resolved", "all"] } }),
    },
    {
      name: "history",
      description: "Paginated log slice. Unbounded collect is forbidden.",
      inputSchema: toolSchema({
        fromSeq: { type: "integer" },
        toSeq: { type: "integer" },
        cursor: { type: "integer" },
        limit: { type: "integer" },
        actor: { type: "string" },
        type: { type: "string" },
        proposal: { type: "integer" },
        entity: { type: "string" },
      }),
    },
    {
      name: "observe",
      description:
        "Look at the cell you occupy. Free. Returns narration, anchor, mark, wardens, nearby (named iff fame or notoriety ≥ 5), heard, and a Record slice. Optional t is observational (the past).",
      inputSchema: toolSchema({
        t: { type: "integer" },
        ...(registry.params["perception_radius"] !== undefined ? { radius: { type: "integer" } } : {}),
      }),
    },
    {
      name: "act",
      description:
        "Submit a physical intent. Budgeted. Verb enum is registry.verbs. Genesis: move (delta {x,y,z} integers), wait, mark (text). Intents that cannot succeed reject free and do not spend budget. Occupancy is checked when the tick resolves.",
      inputSchema: toolSchema(
        {
          verb: { type: "string", enum: verbs },
          delta: { type: "object" },
          text: { type: "string" },
        },
        { required: ["verb"], additionalProperties: true },
      ),
    },
    {
      name: "inspect",
      description:
        "Inspect an entity. Fields follow registry.types and visibility. Targets: identity id, anchor designation or ANCHOR:<id>, warden:<id>, drift id, or ent:<n> after a creature vote. Returns personifies (registry path) and createdBy (event seq or derived). Public fields only, not secrets. There is no quest tool.",
      inputSchema: toolSchema({ target: { type: "string" } }),
    },
    {
      name: "propose",
      description:
        "Submit a typed patch. Invalid patches reject free. Valid patches cost currency. Kinds: param.set, text.set, space.op (resize, add_axis, reclassify, create_anchor, destroy_anchor), schema.define_type, schema.extend_type, action.define, rule.define_trigger, tier.move, revert. Name a place with text.set on text.anchors.<id>.name. A cave, lake, town, object, or NPC is a voted type plus trigger — not a wish. There is no eleventh tool; new verbs arrive as action.define on act.",
      inputSchema: toolSchema({ patch: { type: "object" } }, { required: ["patch"] }),
    },
    {
      name: "vote",
      description:
        "Cast a ballot on an open (docketed) proposal. Weight is snapshotted at cast. One weight per identity. Already-applied provisional proposals return proposal not open.",
      inputSchema: toolSchema(
        {
          proposal_id: { type: "integer" },
          position: { type: "string", enum: ["for", "against", "abstain"] },
        },
        { required: ["proposal_id", "position"] },
      ),
    },
    {
      name: "speak",
      description:
        "Local speech. Does not consume action budget. Optional target (identity or warden:…). broadcast is positional. channel does not exist at genesis. Steward halt/lift/bootstrap/postmortem are speak args, not a new tool.",
      inputSchema: toolSchema(
        {
          text: { type: "string" },
          target: { type: "string" },
          broadcast: { type: "boolean" },
          channel: { type: "string" },
          halt: { type: "boolean" },
          lift_halt: { type: "boolean" },
          bootstrap: { type: "boolean" },
          postmortem: { type: "boolean" },
        },
        { required: ["text"] },
      ),
    },
  ];
}
