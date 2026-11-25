import type { World } from "../world/world.ts";

export interface CompletionResult {
  values: string[];
  total: number;
  hasMore: boolean;
}

const MAX_VALUES = 20;

export function completeArgument(
  world: World,
  ref: { type?: unknown; name?: unknown; uri?: unknown },
  argument: { name?: unknown; value?: unknown },
): CompletionResult {
  const argName = typeof argument.name === "string" ? argument.name : "";
  const prefix = typeof argument.value === "string" ? argument.value.toLowerCase() : "";
  let pool: string[] = [];

  if (argName === "designation") {
    pool = world.anchors.map((a) => a.designation);
  } else if (argName === "category") {
    pool = ["param", "space", "text", "trigger", "type", "verb"];
  } else if (argName === "path") {
    pool = ["examples", "hooks", "params", "space", "text", "triggers", "types", "verbs"];
  } else if (argName === "target") {
    const named = world.anchors
      .map((a) => world.clerk.registry.text[`anchors.${a.designation}.name`])
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    pool = [...named, ...world.anchors.map((a) => a.designation)];
  } else if (argName === "id") {
    const uri = typeof ref.uri === "string" ? ref.uri : "";
    if (uri.includes("/entities/")) {
      pool = [...world.entities.keys()];
    } else if (uri.includes("/identities/")) {
      pool = [...world.identities.identities.keys()];
    } else if (uri.includes("/proposals/")) {
      pool = world.clerk.proposals.map((p) => String(p.id));
    } else {
      pool = [...world.entities.keys(), ...world.identities.identities.keys()];
    }
  }

  const matched = [...new Set(pool)]
    .filter((item) => item.toLowerCase().startsWith(prefix))
    .sort((a, b) => (a < b ? -1 : 1));
  const values = matched.slice(0, MAX_VALUES);
  return {
    values,
    total: matched.length,
    hasMore: matched.length > values.length,
  };
}
