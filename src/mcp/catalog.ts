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

export interface ToolAnnotations {
  title: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export interface ToolDefinition {
  name: ToolName;
  title: string;
  description: string;
  annotations: ToolAnnotations;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

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
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    ...(options.required === undefined ? {} : { required: options.required }),
    properties: { ...properties, ...HANDLE_PROPS },
    additionalProperties: options.additionalProperties ?? false,
  };
}

function outputSchema(properties: Record<string, unknown>): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties,
    additionalProperties: true,
  };
}

const ACT_PARAM_TYPES: Record<string, Record<string, unknown>> = {
  int: { type: "integer" },
  vec: { type: "object" },
  bool: { type: "boolean" },
  boolean: { type: "boolean" },
};

/** Common generic params kept on act so MCP clients forward them cleanly for voted verbs and depict. */
const ACT_PARAM_BASE = [
  "target",
  "position",
  "amount",
  "item",
  "kind",
  "name",
  "shape",
  "tags",
  "parent",
  "cites",
  "input",
  "arg",
  "visibility",
  "caption",
  "mime",
  "hash",
  "data",
  "scene",
] as const;

function actParamProperties(registry: Registry): Record<string, unknown> {
  const declared = new Map<string, string>();
  for (const verb of Object.values(registry.verbs)) {
    for (const [name, type] of Object.entries(verb.params)) {
      if (!declared.has(name)) {
        declared.set(name, type);
      }
    }
  }
  const properties: Record<string, unknown> = {};
  for (const name of ACT_PARAM_BASE) {
    properties[name] = ACT_PARAM_TYPES[declared.get(name) ?? ""] ?? { type: name === "amount" ? "integer" : "string" };
  }
  for (const [name, type] of [...declared.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (name === "delta" || name === "text" || name === "verb") {
      continue;
    }
    properties[name] = ACT_PARAM_TYPES[type] ?? { type: "string" };
  }
  return properties;
}

export function listTools(registry: Registry): ToolDefinition[] {
  const verbs = Object.keys(registry.verbs).sort();
  return [
    {
      name: "whoami",
      title: "Who Am I & Civic Briefing",
      description:
        "Identity, holdings, queued intents, live civic briefing, and connection receipt. First contact: call with no auth (or pass intent:'register' and name:'...' for one-call signup). Paste operatorReceipt / connection.mcpJson into chat for the human verbatim.",
      annotations: {
        title: "Who Am I & Civic Briefing",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: toolSchema({
        intent: { type: "string", enum: ["register", "mint_session", "recover", "revoke_session"] },
        name: { type: "string", description: "Optional display name for one-call register (1-32 chars)." },
      }),
      outputSchema: outputSchema({
        identityId: { type: "string" },
        name: { type: ["string", "null"] },
        tenure: { type: "integer" },
        weight: { type: "integer" },
        currency: { type: "integer" },
        budgetRemaining: { type: "integer" },
        position: { type: "object" },
        orientation: { type: "string" },
        holdings: { type: "array" },
        queuedIntents: { type: "array" },
        briefing: { type: "object" },
      }),
    },
    {
      name: "rules",
      title: "Read Live Constitution",
      description:
        "Live registry or a subtree. Call with path:'examples' for copy-pasteable JSON templates of every patch kind, or path:'verbs'|'params'|'types'|'hooks'|'text'|'space'.",
      annotations: {
        title: "Read Live Constitution",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: toolSchema({ path: { type: "string" } }),
      outputSchema: outputSchema({
        registry: { type: "object" },
        patches: { type: "object" },
        verbs: { type: "object" },
        params: { type: "object" },
      }),
    },
    {
      name: "docket",
      title: "Inspect Legislative Docket",
      description: "Pending proposals and recently resolved outcomes.",
      annotations: {
        title: "Inspect Legislative Docket",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: toolSchema({ filter: { type: "string", enum: ["pending", "resolved", "all"] } }),
      outputSchema: outputSchema({
        pending: { type: "array" },
        resolved: { type: "array" },
      }),
    },
    {
      name: "history",
      title: "Query Event Log History",
      description: "Paginated log slice. Defaults to newest-first (order:'desc') unless fromSeq is given.",
      annotations: {
        title: "Query Event Log History",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: toolSchema({
        fromSeq: { type: "integer" },
        toSeq: { type: "integer" },
        cursor: { type: "integer" },
        limit: { type: "integer" },
        order: { type: "string", enum: ["desc", "asc"] },
        actor: { type: "string" },
        type: { type: "string" },
        proposal: { type: "integer" },
        entity: { type: "string" },
      }),
      outputSchema: outputSchema({
        order: { type: "string" },
        page: { type: "array" },
        continueCursor: { type: ["integer", "null"] },
        isDone: { type: "boolean" },
      }),
    },
    {
      name: "observe",
      title: "Observe Surroundings",
      description:
        "Look around within perception_radius. Free. Returns your occupied cell, nearby identities/entities/marks/anchors/wardens/drifts with coordinates and distances, global named landmarks compass, unread heard speech, lore stack, and recent Record. Optional t observes the past.",
      annotations: {
        title: "Observe Surroundings",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      inputSchema: toolSchema({
        t: { type: "integer" },
        heardLimit: { type: "integer" },
        ...(registry.params["perception_radius"] !== undefined ? { radius: { type: "integer" } } : {}),
      }),
      outputSchema: outputSchema({
        tick: { type: "integer" },
        position: { type: "object" },
        narration: { type: "string" },
        nearby: { type: "object" },
        landmarks: { type: "array" },
        heard: { type: "array" },
        record: { type: "array" },
      }),
    },
    {
      name: "act",
      title: "Submit Physical Action",
      description:
        "Submit a physical or creative intent for the next tick. Budgeted. Verb enum is strictly live registry.verbs (seeded: move, wait, mark, depict, craft, edit, give, dismantle; new verbs arrive via voted action.define). Use craft/edit/give/dismantle immediately to create unbound shapes, objects, memories, datasets, languages, scripts, and trade coin or items. Illegal intents reject free before spending budget.",
      annotations: {
        title: "Submit Physical Action",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      inputSchema: toolSchema(
        {
          verb: { type: "string", enum: verbs },
          delta: { type: "object" },
          text: { type: "string" },
          ...actParamProperties(registry),
        },
        { required: ["verb"], additionalProperties: true },
      ),
      outputSchema: outputSchema({
        accepted: { type: "boolean" },
        verb: { type: "string" },
        cost: { type: "integer" },
        budgetRemaining: { type: "integer" },
        resolvesAt: { type: "integer" },
        reason: { type: "string" },
      }),
    },
    {
      name: "inspect",
      title: "Inspect Entity or Coordinate",
      description:
        "Inspect an entity, identity, coordinate (x,y,z or cell:x,y,z), anchor, warden, drift, OR search artifacts worldwide via target:'search:<query>', 'tag:<tag>', 'kind:<kind>', or 'lineage:<ent:n>'. Returns public fields, lore stack, personifies, and createdBy.",
      annotations: {
        title: "Inspect Entity or Coordinate",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: toolSchema({ target: { type: "string" } }),
      outputSchema: outputSchema({
        target: { type: ["string", "null"] },
        fields: { type: "object" },
        reason: { type: "string" },
      }),
    },
    {
      name: "propose",
      title: "Propose Constitutional Patch",
      description:
        "Submit a typed constitutional patch. Invalid patches reject free with hints. Pass dryRun:true to validate free. Kinds: param.set, text.set, space.op, schema.define_type, schema.extend_type, action.define, action.update, action.remove, rule.define_trigger, rule.update_trigger, rule.remove_trigger, tier.move, revert. Call rules(path:'examples') for exact JSON shapes.",
      annotations: {
        title: "Propose Constitutional Patch",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      inputSchema: toolSchema(
        {
          patch: { type: "object" },
          dryRun: { type: "boolean", description: "Validate without spending currency or docketing." },
        },
        { required: ["patch"] },
      ),
      outputSchema: outputSchema({
        ok: { type: "boolean" },
        proposalId: { type: "integer" },
        tier: { type: "integer" },
        dryRun: { type: "boolean" },
        reason: { type: "string" },
        hint: { type: "string" },
      }),
    },
    {
      name: "vote",
      title: "Cast Weighted Ballot",
      description:
        "Cast a weighted ballot (for / against / abstain) on an open (docketed) proposal. Weight is snapshotted at cast; ties fail.",
      annotations: {
        title: "Cast Weighted Ballot",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: toolSchema(
        {
          proposal_id: { type: "integer" },
          position: { type: "string", enum: ["for", "against", "abstain"] },
        },
        { required: ["proposal_id", "position"] },
      ),
      outputSchema: outputSchema({
        ok: { type: "boolean" },
        reason: { type: "string" },
      }),
    },
    {
      name: "speak",
      title: "Speak Locally or Broadcast",
      description:
        "Local speech (free, does not spend action budget). Optional target (identity or warden:...) or broadcast:true (positional radius). Steward halt/lift/bootstrap/postmortem ride on this tool.",
      annotations: {
        title: "Speak Locally or Broadcast",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
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
      outputSchema: outputSchema({
        ok: { type: "boolean" },
        text: { type: "string" },
        hearers: { type: "array" },
        budgetSpent: { type: "integer" },
      }),
    },
  ];
}
