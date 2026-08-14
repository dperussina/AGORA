import type { Registry } from "./registry.ts";

export function coherenceProblem(registry: Registry): string | null {
  for (const [key, param] of Object.entries(registry.params).sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (param.min !== undefined && param.max !== undefined && param.min > param.max) {
      return `param ${key} min exceeds max`;
    }
    if (param.min !== undefined && param.value < param.min) {
      return `param ${key} below min`;
    }
    if (param.max !== undefined && param.value > param.max) {
      return `param ${key} above max`;
    }
  }
  if (registry.params["action_budget"] === undefined) {
    return "action_budget missing";
  }
  if (registry.params["proposal_cost"] === undefined) {
    return "proposal_cost missing";
  }
  return null;
}
