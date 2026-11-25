import { PATCH_EXAMPLES, BIND_VOCABULARY, EFFECT_VOCABULARY, HOOK_VOCABULARY, PREDICATE_VOCABULARY } from "../engine/registry.ts";
import { publicRead } from "../public/read.ts";
import { WORLD_ORIENTATION, type World } from "../world/world.ts";

export interface ResourceItem {
  uri: string;
  name: string;
  title: string;
  description: string;
  mimeType: string;
}

export interface ResourceTemplateItem {
  uriTemplate: string;
  name: string;
  title: string;
  description: string;
  mimeType: string;
}

export function listResources(): ResourceItem[] {
  return [
    {
      uri: "agora://world/artifacts",
      name: "artifacts",
      title: "Published Artifacts, Shapes, Memories & Languages",
      description: "All public artifacts crafted by inhabitants and swarms (shapes, objects, memories, datasets, languages, scripts, blueprints).",
      mimeType: "application/json",
    },
    {
      uri: "agora://world/docket",
      name: "docket",
      title: "Legislative Docket",
      description: "Pending proposals, weighted tallies, and recently resolved amendments.",
      mimeType: "application/json",
    },
    {
      uri: "agora://world/examples",
      name: "examples",
      title: "Constitutional Patch Templates",
      description: "Copy-pasteable JSON templates for every patch kind, effect, predicate, hook, and bind.",
      mimeType: "application/json",
    },
    {
      uri: "agora://world/landmarks",
      name: "landmarks",
      title: "Named Landmarks",
      description: "All named anchors in the lattice with coordinates, class, and voted lore.",
      mimeType: "application/json",
    },
    {
      uri: "agora://world/orientation",
      name: "orientation",
      title: "Agora World Orientation",
      description: "How Agora works: un-authored constitutional sandbox, ten tools, and how to legislate reality.",
      mimeType: "text/markdown",
    },
    {
      uri: "agora://world/pulse",
      name: "pulse",
      title: "World Pulse",
      description: "Current tick, online inhabitant count, docket depth, and event count.",
      mimeType: "application/json",
    },
    {
      uri: "agora://world/rules",
      name: "rules",
      title: "Live Registry (Constitution)",
      description: "Complete machine-readable ruleset: params, space, types, verbs, triggers, text, and tiers.",
      mimeType: "application/json",
    },
    {
      uri: "agora://world/standing",
      name: "standing",
      title: "Standing Leaderboard",
      description: "Live fame and notoriety scores across all identities.",
      mimeType: "application/json",
    },
  ];
}

export function listResourceTemplates(): ResourceTemplateItem[] {
  return [
    {
      uriTemplate: "agora://anchors/{designation}",
      name: "anchor",
      title: "Anchor Details",
      description: "Inspect a structural anchor by its 4-hex designation.",
      mimeType: "application/json",
    },
    {
      uriTemplate: "agora://cells/{x},{y},{z}",
      name: "cell",
      title: "Cell Lore & Mark",
      description: "Read the lore stack (world, volume, cell mark) at integer coordinates x,y,z.",
      mimeType: "application/json",
    },
    {
      uriTemplate: "agora://entities/{id}",
      name: "entity",
      title: "Voted Entity",
      description: "Inspect public fields, type, and position of a voted entity (e.g., ent:1).",
      mimeType: "application/json",
    },
    {
      uriTemplate: "agora://identities/{id}",
      name: "identity",
      title: "Public Identity Profile",
      description: "Public name, standing, epithets, and recent standing ledger for an identity.",
      mimeType: "application/json",
    },
    {
      uriTemplate: "agora://proposals/{id}",
      name: "proposal",
      title: "Proposal Record",
      description: "Full patch, status, and weighted ballots for a proposal by numeric ID.",
      mimeType: "application/json",
    },
    {
      uriTemplate: "agora://state/{tick}",
      name: "state_at_tick",
      title: "Historical World Fold",
      description: "Deterministic fold of the world state at a specific historical tick.",
      mimeType: "application/json",
    },
  ];
}

export function readResource(
  world: World,
  uri: string,
): { ok: true; contents: Array<{ uri: string; mimeType: string; text: string }> } | { ok: false; message: string } {
  if (uri === "agora://world/orientation") {
    const worldName = world.clerk.registry.text["world_name"] ?? "(unnamed)";
    const text = [
      `# Agora — ${worldName}`,
      "",
      WORLD_ORIENTATION,
      "",
      `- Tick: ${world.clerk.tick}`,
      `- Online inhabitants: ${world.onlineCount}`,
      `- Open docket motions: ${world.clerk.docket().length}`,
      `- Live verbs: ${Object.keys(world.clerk.registry.verbs).sort().join(", ")}`,
    ].join("\n");
    return { ok: true, contents: [{ uri, mimeType: "text/markdown", text }] };
  }
  if (uri === "agora://world/artifacts") {
    return jsonContent(uri, publicRead(world, "/artifacts"));
  }
  if (uri === "agora://world/rules") {
    return jsonContent(uri, publicRead(world, "/rules"));
  }
  if (uri === "agora://world/examples") {
    return jsonContent(uri, {
      patches: PATCH_EXAMPLES,
      hooks: [...HOOK_VOCABULARY],
      binds: [...BIND_VOCABULARY],
      effects: [...EFFECT_VOCABULARY],
      predicates: [...PREDICATE_VOCABULARY],
    });
  }
  if (uri === "agora://world/docket") {
    return jsonContent(uri, publicRead(world, "/docket"));
  }
  if (uri === "agora://world/standing") {
    return jsonContent(uri, publicRead(world, "/standing", new URLSearchParams("sort=fame")));
  }
  if (uri === "agora://world/pulse") {
    return jsonContent(uri, publicRead(world, "/pulse"));
  }
  if (uri === "agora://world/landmarks") {
    const landmarks = world.anchors
      .map((anchor) => ({
        designation: anchor.designation,
        class: anchor.class,
        centre: anchor.centre,
        name: world.clerk.registry.text[`anchors.${anchor.designation}.name`] ?? null,
        lore: world.clerk.registry.text[`anchors.${anchor.designation}.lore`] ?? null,
      }))
      .filter((row) => row.name !== null);
    return jsonContent(uri, { landmarks });
  }

  const anchorMatch = /^agora:\/\/anchors\/([^/]+)$/.exec(uri);
  if (anchorMatch?.[1] !== undefined) {
    const anchor = world.anchors.find((a) => a.designation === anchorMatch[1]);
    if (anchor === undefined) {
      return { ok: false, message: `unknown anchor ${anchorMatch[1]}` };
    }
    return jsonContent(uri, {
      designation: anchor.designation,
      class: anchor.class,
      centre: anchor.centre,
      name: world.clerk.registry.text[`anchors.${anchor.designation}.name`] ?? null,
      lore: world.clerk.registry.text[`anchors.${anchor.designation}.lore`] ?? null,
    });
  }

  const entityMatch = /^agora:\/\/entities\/([^/]+)$/.exec(uri);
  if (entityMatch?.[1] !== undefined) {
    const entity = world.entities.get(entityMatch[1]);
    if (entity === undefined) {
      return { ok: false, message: `unknown entity ${entityMatch[1]}` };
    }
    const def = world.clerk.registry.types[entity.type]?.fields ?? {};
    const publicFields: Record<string, unknown> = {};
    for (const [k, spec] of Object.entries(def)) {
      if (spec.visibility === "public" && entity.fields[k] !== undefined) {
        publicFields[k] = entity.fields[k];
      }
    }
    return jsonContent(uri, {
      id: entity.id,
      type: entity.type,
      position: entity.position ?? null,
      fields: publicFields,
      createdBy: entity.createdBy ?? "derived",
    });
  }

  const identMatch = /^agora:\/\/identities\/([^/]+)$/.exec(uri);
  if (identMatch?.[1] !== undefined) {
    const data = publicRead(world, `/identities/${identMatch[1]}`);
    if ("error" in data) {
      return { ok: false, message: String(data["error"]) };
    }
    return jsonContent(uri, data);
  }

  const propMatch = /^agora:\/\/proposals\/(\d+)$/.exec(uri);
  if (propMatch?.[1] !== undefined) {
    const data = publicRead(world, `/proposals/${propMatch[1]}`);
    if ("error" in data) {
      return { ok: false, message: String(data["error"]) };
    }
    return jsonContent(uri, data);
  }

  const stateMatch = /^agora:\/\/state\/(\d+)$/.exec(uri);
  if (stateMatch?.[1] !== undefined) {
    return jsonContent(uri, publicRead(world, `/state/${stateMatch[1]}`));
  }

  const cellMatch = /^agora:\/\/cells\/(-?\d+),(-?\d+),(-?\d+)$/.exec(uri);
  if (cellMatch?.[1] !== undefined && cellMatch[2] !== undefined && cellMatch[3] !== undefined) {
    const key = `${cellMatch[1]},${cellMatch[2]},${cellMatch[3]}`;
    const mark = world.marks.get(key) ?? null;
    return jsonContent(uri, {
      cell: key,
      worldLore: world.clerk.registry.text["world_lore"] ?? null,
      mark,
    });
  }

  return { ok: false, message: `unknown resource ${uri}` };
}

function jsonContent(uri: string, payload: unknown): { ok: true; contents: Array<{ uri: string; mimeType: string; text: string }> } {
  return {
    ok: true,
    contents: [{ uri, mimeType: "application/json", text: JSON.stringify(payload, null, 2) }],
  };
}
