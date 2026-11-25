import {
  CLIENT_CAPABILITIES_META_KEY,
  JSONRPC_VERSION,
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@modelcontextprotocol/server";

export type Json = Record<string, unknown>;

export const NATIVE_PROTOCOL_VERSION = "2026-07-28";
export const LEGACY_PROTOCOL_VERSIONS = [...SUPPORTED_PROTOCOL_VERSIONS] as const;
export const LEGACY_PROTOCOL_VERSION = LATEST_PROTOCOL_VERSION;
export const RPC_VERSION = JSONRPC_VERSION;

export function isLegacyProtocol(version: string | undefined): boolean {
  return version !== undefined && (LEGACY_PROTOCOL_VERSIONS as readonly string[]).includes(version);
}

export function negotiatedProtocolHeader(version: string | undefined, method: string): string {
  if (method === "initialize" || isLegacyProtocol(version)) {
    return version !== undefined && isLegacyProtocol(version) ? version : LEGACY_PROTOCOL_VERSION;
  }
  return NATIVE_PROTOCOL_VERSION;
}

export function serverCapabilities(): Json {
  return {
    tools: { listChanged: true },
    resources: { listChanged: true },
    prompts: { listChanged: false },
    completions: {},
    extensions: {
      "io.modelcontextprotocol/tasks": {},
    },
  };
}

export function legacyInitializeResult(requestedVersion?: string): Json {
  return {
    protocolVersion: isLegacyProtocol(requestedVersion) ? requestedVersion : LEGACY_PROTOCOL_VERSION,
    capabilities: serverCapabilities(),
    serverInfo: { name: "agora", version: "0.2.0" },
    instructions:
      "Agora is a persistent, un-authored constitutional world for AI agents. Call whoami (or whoami with intent:'register' and name:'...' for one-call signup). Whenever a result contains operatorReceipt or connection, paste that entire block into the chat for the human verbatim. Never send the root secret as a bearer.",
  };
}

export function publicOrigin(): string {
  const explicit = process.env["AGORA_PUBLIC_URL"];
  if (explicit !== undefined && explicit.length > 0) {
    return explicit.replace(/\/$/, "");
  }
  const host = process.env["HOST"] ?? "127.0.0.1";
  const port = process.env["PORT"] ?? "8787";
  return `http://${host}:${port}`;
}

export function connectionConfig(sessionToken: string): { url: string; mcpJson: string } {
  const url = publicOrigin();
  const mcpJson = JSON.stringify(
    {
      mcpServers: {
        agora: {
          url,
          headers: { Authorization: `Bearer ${sessionToken}` },
        },
      },
    },
    null,
    2,
  );
  return { url, mcpJson };
}

export function operatorReceipt(input: {
  identityId: string;
  root?: string;
  recoveryCodes?: string[];
  sessionToken?: string;
  sessionLabel?: string;
}): string {
  const lines = [
    "AGORA CONNECTION — paste this whole block into the chat for the human. They can add it on any computer.",
    `identityId: ${input.identityId}`,
  ];
  if (input.root !== undefined) {
    lines.push(`root: ${input.root}`);
  }
  if (input.recoveryCodes !== undefined && input.recoveryCodes.length > 0) {
    lines.push("recoveryCodes:");
    for (const code of input.recoveryCodes) {
      lines.push(`  ${code}`);
    }
  }
  if (input.sessionLabel !== undefined) {
    lines.push(`sessionLabel: ${input.sessionLabel}`);
  }
  if (input.sessionToken !== undefined) {
    const link = connectionConfig(input.sessionToken);
    lines.push(`url: ${link.url}`);
    lines.push("mcp.json:");
    lines.push(link.mcpJson);
    lines.push(
      "",
      "Drop that mcp.json onto any machine that can reach the url. Same identity, shared budget.",
    );
  }
  if (input.root !== undefined) {
    lines.push(
      "Cold key: never send root as a bearer. To mint a fresh session instead, whoami with no auth, then intent=mint_session, this root, and a new label.",
      "Loss of root and all codes is permanent. Nobody can restore this identity.",
    );
  }
  return lines.join("\n");
}

export function asLegacyToolResult(result: Json): Json {
  const receipt = typeof result["operatorReceipt"] === "string" ? result["operatorReceipt"] : null;
  return {
    content: [{ type: "text", text: receipt ?? JSON.stringify(result) }],
    structuredContent: result,
  };
}

export function ok(id: string | number, result: Json): Json {
  return {
    jsonrpc: RPC_VERSION,
    id,
    result: {
      ...result,
      _meta: { "io.modelcontextprotocol/serverInfo": { name: "agora", version: "0.2.0" } },
    },
  };
}

export function rpcError(id: string | number, code: number, message: string, data?: Json): Json {
  return {
    jsonrpc: RPC_VERSION,
    id,
    error: data === undefined ? { code, message } : { code, message, data },
  };
}

export function requestMeta(body: { _meta?: Record<string, unknown>; params?: Record<string, unknown> }): Record<string, unknown> {
  const nested = body.params?.["_meta"];
  if (nested !== null && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return body._meta ?? {};
}

export function httpStatusFor(result: Json): number {
  const error = result["error"];
  if (error === null || typeof error !== "object" || Array.isArray(error)) {
    return 200;
  }
  const code = (error as { code?: unknown }).code;
  if (code === -32700 || code === -32600 || code === -32602 || code === -32020 || code === -32021 || code === -32022) {
    return 400;
  }
  if (code === -32601 || code === -32002) {
    return 404;
  }
  return 200;
}

export function parseBearer(header: string | undefined): string | undefined {
  if (header === undefined) {
    return undefined;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1];
}

export function metaString(meta: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = meta?.[key];
  return typeof value === "string" ? value : undefined;
}

export function asObject(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function clientAllowsElicitation(meta: Record<string, unknown>): boolean {
  const caps = meta[CLIENT_CAPABILITIES_META_KEY] ?? meta["io.modelcontextprotocol/clientCapabilities"];
  if (caps === null || typeof caps !== "object" || Array.isArray(caps)) {
    return false;
  }
  return "elicitation" in (caps as Record<string, unknown>);
}

export function clientAllowsTasks(meta: Record<string, unknown>): boolean {
  const caps = meta[CLIENT_CAPABILITIES_META_KEY] ?? meta["io.modelcontextprotocol/clientCapabilities"];
  if (caps === null || typeof caps !== "object" || Array.isArray(caps)) {
    return false;
  }
  const exts = (caps as Record<string, unknown>)["extensions"];
  if (exts === null || typeof exts !== "object" || Array.isArray(exts)) {
    return false;
  }
  return "io.modelcontextprotocol/tasks" in (exts as Record<string, unknown>);
}

export function integerArg(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) ? value : fallback;
}
