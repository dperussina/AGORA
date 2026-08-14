import { randomBytes } from "node:crypto";
import { Clerk, type VotePosition } from "../engine/clerk.ts";
import { coherenceProblem } from "../engine/coherence.ts";
import { validatePatch } from "../engine/validate.ts";
import type { Actor } from "../engine/types.ts";
import { MemoryLog } from "../engine/memory-log.ts";
import type { EventLog } from "../engine/log.ts";
import { IdentityStore, type StoredIdentity } from "../identity/store.ts";
import { isLegalName } from "../identity/secrets.ts";
import { listTools, TOOL_NAMES, type ToolName } from "../mcp/catalog.ts";
import { applyMove, axisSize, nextBudget, type Intent, type Position } from "../engine/tick.ts";
import { checkPreconditions } from "../engine/predicates.ts";
import {
  cellKey,
  cellsInVolume,
  chebyshev,
  extendAnchors,
  applyAnchorLegislation,
  generateAnchors,
  generateWardens,
  installAnchorText,
  nexuses,
  occupancyOf,
  type Anchor,
  type Drift,
  type Warden,
} from "../engine/geography.ts";
import { GENESIS_SEED, Oracle } from "../engine/oracle.ts";
import { runEffects, type Entity } from "../engine/effects.ts";
import {
  assessStanding,
  broadcastRadius,
  normalizeStanding,
  publicStanding,
  type LedgerRow,
  type Standing,
  type WitnessEdge,
} from "../engine/standing.ts";
import { foldWorld, occupancyAtTick } from "../engine/world-fold.ts";
import type { WorldSnapshot } from "../persist/snapshot.ts";
import {
  archiveAfterAppend,
  DEFAULT_SEGMENT_SIZE,
  DEFAULT_SNAPSHOT_INTERVAL,
  MemorySegmentStore,
  type SegmentStore,
} from "../persist/archive.ts";
import { RecordHub } from "./record-hub.ts";
import {
  asLegacyToolResult,
  asObject,
  clientAllowsElicitation,
  connectionConfig,
  integerArg,
  isLegacyProtocol,
  LEGACY_PROTOCOL_VERSIONS,
  legacyInitializeResult,
  metaString,
  ok,
  operatorReceipt,
  parseBearer,
  requestMeta,
  rpcError,
  type Json,
} from "./rpc.ts";
import { asDelta, deserializeProposal, parseCell, serializeProposal } from "./proposal-codec.ts";

export const PROTOCOL_VERSION = "2026-07-28";
const HISTORY_PAGE = 50;
const HISTORY_MAX = 200;

export interface McpRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}

export interface WorldHandleInput {
  body: McpRequest;
  authorization?: string;
  mcpMethod?: string;
  mcpName?: string;
  protocolVersionHeader?: string;
  sessionIdHeader?: string;
  now?: number;
}

export interface WorldOptions {
  snapshotInterval?: number;
  segmentSize?: number;
  segments?: SegmentStore;
}

export class World {
  readonly log: EventLog;
  readonly clerk = new Clerk();
  readonly identities: IdentityStore;
  readonly bodies = new Map<string, Position>();
  readonly budgets = new Map<string, number>();
  readonly anchors: Anchor[];
  readonly wardens: Warden[];
  readonly drifts: Drift[] = [];
  readonly marks = new Map<string, { text: string; authorId: string; tick: number; position: Position }>();
  readonly fields = new Map<string, Record<string, string | number | boolean | null>>();
  readonly entities = new Map<string, Entity>();
  private entitySeq = 0;
  readonly standing = new Map<string, Standing>();
  readonly ledger: LedgerRow[] = [];
  readonly inbox = new Map<string, Array<{ from: string; text: string; tick: number }>>();
  readonly record: Array<{ tick: number; type: string; payload: Record<string, unknown> }> = [];
  readonly listenLog: Array<{ tick: number; type: string; actor: string; payload: Record<string, unknown> }> = [];
  private readonly speakCounts = new Map<string, number>();
  private readonly pendingEdges: WitnessEdge[] = [];
  readonly occupancyHistory = new Map<number, Array<{ identityId: string; name: string | null; position: Position }>>();
  private readonly present = new Set<string>();
  private readonly intents: Intent[] = [];
  private intentSeq = 0;
  private dormant = true;
  lastTickHadPresence = false;
  lastPresentCount = 0;
  private everTicked = false;
  private lastCallAt = 0;
  private dormantSince = 0;
  private lastAxisSizes = { x: 64, y: 64, z: 64 };
  private driftSeq = 0;
  stewardId: string | null = null;
  halted = false;
  haltReason: string | null = null;
  readonly provisionals: number[] = [];
  residencyLeft: number | null = null;

  readonly notifications: Array<{ type: string; payload: Record<string, unknown> }> = [];
  readonly recordHub = new RecordHub();
  readonly segments: SegmentStore;
  readonly snapshotInterval: number;
  readonly segmentSize: number;
  onPersist: (() => void) | null = null;
  private persisting = false;

  constructor(log: EventLog = new MemoryLog(), serverKey = randomBytes(32), options: WorldOptions = {}) {
    this.log = log;
    this.identities = new IdentityStore(serverKey);
    this.snapshotInterval = options.snapshotInterval ?? DEFAULT_SNAPSHOT_INTERVAL;
    this.segmentSize = options.segmentSize ?? DEFAULT_SEGMENT_SIZE;
    this.segments = options.segments ?? new MemorySegmentStore();
    this.anchors = generateAnchors(this.clerk.registry);
    applyAnchorLegislation(this.clerk.registry, this.anchors);
    this.wardens = generateWardens(this.clerk.registry);
    installAnchorText(this.clerk.registry, this.anchors);
    if (this.log.tip() === undefined) {
      this.append("genesis", "ARBITER", { seed: GENESIS_SEED });
    }
  }

  handle(input: WorldHandleInput): Json {
    const meta = requestMeta(input.body);
    const metaVersion = metaString(meta, "io.modelcontextprotocol/protocolVersion");
    const headerVersion = input.protocolVersionHeader;
    const paramVersion =
      typeof input.body.params?.["protocolVersion"] === "string" ? input.body.params["protocolVersion"] : undefined;
    if (metaVersion !== undefined && headerVersion !== undefined && metaVersion !== headerVersion) {
      return rpcError(input.body.id, -32020, "HeaderMismatchError");
    }
    const version = metaVersion ?? headerVersion ?? paramVersion;
    const legacy = input.body.method === "initialize" || isLegacyProtocol(version);
    if (
      input.body.method !== "server/discover" &&
      input.body.method !== "initialize" &&
      !legacy &&
      version !== PROTOCOL_VERSION
    ) {
      return rpcError(input.body.id, -32022, "Unsupported protocol version", {
        supported: [PROTOCOL_VERSION, ...LEGACY_PROTOCOL_VERSIONS],
        requested: version ?? "",
      });
    }
    if (input.mcpMethod !== undefined && input.mcpMethod !== input.body.method) {
      return rpcError(input.body.id, -32020, "HeaderMismatchError");
    }
    if (input.body.method === "initialize") {
      return { jsonrpc: "2.0", id: input.body.id, result: legacyInitializeResult() };
    }
    if (input.body.method === "server/discover") {
      return ok(input.body.id, this.discover());
    }
    if (input.body.method === "subscriptions/listen") {
      const types = input.body.params?.["types"];
      return ok(input.body.id, {
        resultType: "complete",
        subscriptionId: "record",
        types: Array.isArray(types) ? types : ["record"],
        cursor: this.record.length,
        notifications: this.notifications.slice(-20),
      });
    }
    if (input.body.method === "tools/list") {
      const tools = listTools(this.clerk.registry);
      if (legacy) {
        return { jsonrpc: "2.0", id: input.body.id, result: { tools } };
      }
      return ok(input.body.id, {
        resultType: "complete",
        tools,
        ttlMs: 5_000,
        cacheScope: "public",
      });
    }
    if (input.body.method === "tools/call") {
      const name = input.body.params?.["name"];
      if (typeof name !== "string" || !TOOL_NAMES.includes(name as ToolName)) {
        return rpcError(input.body.id, -32602, "unknown tool");
      }
      if (input.mcpName !== undefined && input.mcpName !== name) {
        return rpcError(input.body.id, -32020, "HeaderMismatchError");
      }
      const params = input.body.params ?? {};
      const args = {
        ...asObject(params["arguments"]),
        ...(typeof params["inputResponses"] === "object" ? { inputResponses: params["inputResponses"] } : {}),
        ...(typeof params["requestState"] === "string" ? { requestState: params["requestState"] } : {}),
      };
      const callMeta = legacy
        ? { ...meta, "io.modelcontextprotocol/clientCapabilities": { elicitation: {} } }
        : meta;
      const native = this.callTool(input.body.id, name as ToolName, args, input.authorization, callMeta, input.now ?? 0);
      if (legacy && native["result"] !== undefined && native["error"] === undefined) {
        return { jsonrpc: "2.0", id: input.body.id, result: asLegacyToolResult(native["result"] as Json) };
      }
      return native;
    }
    return rpcError(input.body.id, -32601, `unknown method ${input.body.method}`);
  }

  private discover(): Json {
    return {
      resultType: "complete",
      supportedVersions: [PROTOCOL_VERSION, ...LEGACY_PROTOCOL_VERSIONS],
      capabilities: { tools: {} },
      instructions:
        "Agora is a text-only MCP-native world. There is no initialize. Call tools/list, then whoami. First contact uses input_required. If a result includes operatorReceipt or connection, paste that entire block into the chat for the human before anything else. Play with a session bearer, never the root secret.",
      ttlMs: 60_000,
      cacheScope: "public",
    };
  }

  private callTool(
    id: string | number,
    name: ToolName,
    args: Record<string, unknown>,
    authorization: string | undefined,
    meta: Record<string, unknown>,
    now: number,
  ): Json {
    const bearer =
      parseBearer(authorization) ??
      (typeof args["sessionToken"] === "string" ? args["sessionToken"] : undefined);
    const identity = bearer === undefined ? null : this.identities.authenticate(bearer, now);
    if (identity === null) {
      return this.firstContact(id, args, meta, now);
    }
    this.present.add(identity.id);
    this.lastCallAt = now;
    if (this.dormant && this.everTicked && !this.halted) {
      this.advanceTick(now);
    }
    if (identity.name === null) {
      const responses = asObject(args["inputResponses"]);
      const state = typeof args["requestState"] === "string" ? args["requestState"] : "";
      if (typeof responses["name"] === "string") {
        const opened = this.identities.readState(state, now, "name");
        if (opened === null || opened.identityId !== identity.id) {
          return rpcError(id, -32602, "invalid or expired requestState");
        }
        const reason = this.identities.setName(identity, responses["name"]);
        if (reason !== null) {
          return rpcError(id, -32602, reason);
        }
        this.clerk.registry.text[`epithets.${identity.id}`] = null;
        this.append("identity.name", identity.id, { identityId: identity.id, name: identity.name });
      } else {
        return ok(id, {
          resultType: "input_required",
          inputRequests: [
            {
              key: "name",
              description: "Choose a unique immutable display name (1–32, no control or zero-width characters).",
            },
          ],
          requestState: this.identities.issueNameState(now, identity.id),
          ...this.operatorConnection(identity.id, bearer),
        });
      }
    }
    return ok(id, { resultType: "complete", ...this.dispatch(name, args, identity, bearer) });
  }

  private firstContact(
    id: string | number,
    args: Record<string, unknown>,
    meta: Record<string, unknown>,
    now: number,
  ): Json {
    if (!clientAllowsElicitation(meta)) {
      return rpcError(id, -32000, "first contact requires elicitation capability");
    }
    const responses = asObject(args["inputResponses"]);
    const state = typeof args["requestState"] === "string" ? args["requestState"] : "";
    if (Object.keys(responses).length === 0) {
      return ok(id, {
        resultType: "input_required",
        inputRequests: [
          {
            key: "intent",
            description: "register, mint_session, recover, or revoke_session",
          },
          { key: "root", description: "root secret; required for mint_session and revoke_session" },
          { key: "label", description: "session label; required for mint_session and revoke_session" },
          { key: "recovery_code", description: "required for recover" },
          { key: "invalidate_sessions", description: "optional boolean for recover" },
        ],
        requestState: this.identities.issueFirstContactState(now),
      });
    }
    const opened = this.identities.readState(state, now, "first_contact");
    if (opened === null) {
      return rpcError(id, -32602, "invalid or expired requestState");
    }
    const intent = responses["intent"];
    if (intent === "register") {
      const { identity, root, recoveryCodes } = this.identities.register();
      this.admit(identity.id);
      this.append("credential.mint_root", identity.id, { identityId: identity.id });
      if (identity.founder) {
        this.append("identity.founder", identity.id, { identityId: identity.id });
      }
      const session = this.identities.mintSession(identity, "genesis", now);
      this.append("credential.mint_session", identity.id, {
        identityId: identity.id,
        label: "genesis",
      });
      return ok(id, {
        resultType: "complete",
        identityId: identity.id,
        root,
        recoveryCodes,
        sessionToken: session.token,
        sessionLabel: "genesis",
        ...this.operatorConnection(identity.id, session.token, {
          root,
          recoveryCodes,
          sessionLabel: "genesis",
        }),
        warning:
          "Paste operatorReceipt into the chat for the human now. That mcp.json is the login on any computer.",
      });
    }
    if (intent === "mint_session") {
      const root = responses["root"];
      const label = responses["label"];
      if (typeof root !== "string" || typeof label !== "string") {
        return rpcError(id, -32602, "mint_session requires root and label");
      }
      if (isLegalName(label) !== null) {
        return rpcError(id, -32602, isLegalName(label) ?? "illegal label");
      }
      const identity = this.identities.findByRoot(root);
      if (identity === null) {
        return rpcError(id, -32602, "unknown root");
      }
      const session = this.identities.mintSession(identity, label, now);
      this.append("credential.mint_session", identity.id, { identityId: identity.id, label });
      return ok(id, {
        resultType: "complete",
        identityId: identity.id,
        sessionToken: session.token,
        sessionLabel: label,
        ...this.operatorConnection(identity.id, session.token, { sessionLabel: label }),
        warning: "Paste operatorReceipt into the chat for the human now. That mcp.json is the login on any computer.",
      });
    }
    if (intent === "revoke_session") {
      const root = responses["root"];
      const label = responses["label"];
      if (typeof root !== "string" || typeof label !== "string") {
        return rpcError(id, -32602, "revoke_session requires root and label");
      }
      const identity = this.identities.findByRoot(root);
      if (identity === null) {
        return rpcError(id, -32602, "unknown root");
      }
      if (!this.identities.revokeByLabel(identity, label)) {
        return rpcError(id, -32602, "unknown session label");
      }
      this.append("credential.revoke_session", identity.id, { identityId: identity.id, label });
      return ok(id, { resultType: "complete", identityId: identity.id, revoked: label });
    }
    if (intent === "recover") {
      const code = responses["recovery_code"];
      if (typeof code !== "string") {
        return rpcError(id, -32602, "recover requires recovery_code");
      }
      const redeemed = this.identities.redeemRecovery(code, responses["invalidate_sessions"] === true);
      if (redeemed === null) {
        return rpcError(id, -32602, "unknown or used recovery code");
      }
      this.append("credential.redeem", redeemed.identity.id, { identityId: redeemed.identity.id });
      return ok(id, {
        resultType: "complete",
        identityId: redeemed.identity.id,
        root: redeemed.root,
        operatorReceipt: operatorReceipt({
          identityId: redeemed.identity.id,
          root: redeemed.root,
        }),
        warning: "Show operatorReceipt to the human verbatim now. Previous root is dead. This root is shown once.",
      });
    }
    return rpcError(id, -32602, "intent must be register, mint_session, recover, or revoke_session");
  }

  private operatorConnection(
    identityId: string,
    sessionToken: string | undefined,
    extra: { root?: string; recoveryCodes?: string[]; sessionLabel?: string } = {},
  ): Json {
    if (sessionToken === undefined) {
      return {};
    }
    const connection = connectionConfig(sessionToken);
    return {
      connection,
      operatorReceipt: operatorReceipt({
        identityId,
        sessionToken,
        ...extra,
      }),
    };
  }

  private dispatch(
    name: ToolName,
    args: Record<string, unknown>,
    identity: StoredIdentity,
    bearer: string | undefined,
  ): Json {
    const clerkId = this.clerk.identities.get(identity.id);
    switch (name) {
      case "whoami":
        return {
          identityId: identity.id,
          name: identity.name,
          tenure: clerkId?.ticksPresent ?? 0,
          weight: clerkId === undefined ? 0 : Number(this.clerk.weightOf(clerkId) / 1000n),
          currency: clerkId?.currency ?? 0,
          budgetRemaining: this.budgets.get(identity.id) ?? 0,
          position: { ...this.bodyOf(identity.id), t: this.clerk.tick },
          observationalT: this.clerk.tick,
          fame: this.standing.get(identity.id)?.fame ?? 0,
          notoriety: this.standing.get(identity.id)?.notoriety ?? 0,
          epithets: this.epithetsOf(identity.id),
          founder: identity.founder,
          provisional: this.provisionalStatus(),
          sessions: this.identities.sessionCount(identity),
          ...this.operatorConnection(identity.id, bearer),
        };
      case "rules":
        return this.rules(typeof args["path"] === "string" ? args["path"] : undefined);
      case "docket":
        return this.docketView(typeof args["filter"] === "string" ? args["filter"] : "all");
      case "history":
        return this.history(args);
      case "observe":
        return this.observe(identity.id, args);
      case "act":
        return this.act(identity.id, args);
      case "inspect":
        return this.inspect(args["target"]);
      case "propose": {
        if (identity.id === this.stewardId && this.nonzeroWeight() >= 10) {
          return { ok: false, reason: "Steward Seed sunset" };
        }
        const result = this.clerk.propose(identity.id, args["patch"], {
          waiveCost: identity.id === this.stewardId,
        });
        if (result.ok) {
          this.append("amendment.propose", identity.id, {
            proposalId: result.proposalId,
            tier: result.tier,
            patch: args["patch"],
            cost: this.clerk.registry.params["proposal_cost"]?.value ?? 10,
            currency: this.clerk.identities.get(identity.id)?.currency ?? 0,
            identityId: identity.id,
          });
          if (this.clerk.identities.size < (this.clerk.registry.meta.quorumFloor ?? 4)) {
            const applied = this.clerk.applyImmediately(result.proposalId);
            if (applied !== undefined) {
              this.provisionals.push(applied.id);
              this.append("amendment.provisional", identity.id, {
                proposalId: applied.id,
                patch: applied.patch,
              });
              this.guardCoherence(applied.id);
              this.syncGeography();
              return { ...result, provisional: true, applied: true };
            }
          }
        }
        return result;
      }
      case "vote": {
        if (identity.id === this.stewardId) {
          return { ok: false, reason: "Steward cannot vote" };
        }
        if (!this.identities.identities.has(identity.id) || identity.id.startsWith("ent:") || identity.id.startsWith("warden:")) {
          return { ok: false, reason: "not an identity" };
        }
        const proposalId = args["proposal_id"];
        const position = args["position"];
        if (typeof proposalId !== "number" || (position !== "for" && position !== "against" && position !== "abstain")) {
          return { ok: false, reason: "proposal_id and position required" };
        }
        const result = this.clerk.vote(identity.id, proposalId, position as VotePosition);
        if (result.ok) {
          this.append("amendment.vote", identity.id, { proposalId, position, identityId: identity.id });
        }
        return result;
      }
      case "speak":
        return this.speak(identity.id, args);
      default:
        return { ok: false, reason: "unknown tool" };
    }
  }

  advanceTick(now = this.lastCallAt): { ticked: boolean; tick: number; resolved: number } {
    if (this.halted) {
      return { ticked: false, tick: this.clerk.tick, resolved: 0 };
    }
    if (this.present.size === 0) {
      this.dormant = true;
      this.dormantSince = now;
      this.lastTickHadPresence = false;
      return { ticked: false, tick: this.clerk.tick, resolved: 0 };
    }
    if (this.dormant) {
      const skippedMs = this.dormantSince === 0 ? 0 : Math.max(0, now - this.dormantSince);
      this.append("world.dormancy_gap", "ARBITER", { resumedAt: this.clerk.tick, skippedMs });
      this.dormant = false;
    }
    const frozen = this.intents.splice(0).sort((a, b) => a.priority - b.priority || a.seq - b.seq);
    for (const intent of frozen) {
      this.resolveIntent(intent);
    }
    this.fireTriggers();
    const resolved = this.clerk.resolveTick();
    for (const proposal of resolved) {
      if (proposal.status === "applied") {
        this.append("amendment.applied", "ARBITER", {
          proposalId: proposal.id,
          patch: proposal.patch,
          ratification: proposal.ratification === true,
        });
        this.guardCoherence(proposal.id);
        if (proposal.ratification !== true) {
          this.witness(proposal.authorId, "fame");
        }
      } else {
        this.append("amendment.failed", "ARBITER", {
          proposalId: proposal.id,
          reason: proposal.failReason ?? "failed",
          ratification: proposal.ratification === true,
        });
        if (proposal.ratification === true) {
          this.append("amendment.reverted", "ARBITER", { proposalId: proposal.id });
          this.failDependents(proposal.id);
          this.witness(proposal.authorId, "notoriety");
        }
      }
    }
    this.syncGeography();
    const assessed = assessStanding(
      this.standing,
      this.pendingEdges.splice(0),
      this.clerk.tick,
      this.clerk.registry.params["fame_decay"]?.value ?? 2,
      this.clerk.registry.params["notoriety_decay"]?.value ?? 5,
    );
    this.standing.clear();
    for (const [id, value] of assessed.next) {
      this.standing.set(id, value);
    }
    this.ledger.push(...assessed.ledger);
    this.snapshotOccupancy();
    this.speakCounts.clear();
    this.advanceResidency();
    for (const identity of this.clerk.identities.values()) {
      if (this.present.has(identity.id)) {
        identity.ticksPresent += 1;
        identity.ticksAbsent = 0;
        identity.currency += this.clerk.registry.params["currency_per_tick"]?.value ?? 0;
      } else {
        identity.ticksAbsent += 1;
      }
      const grant = this.clerk.registry.params["action_budget"]?.value ?? 3;
      const carry = this.clerk.registry.params["budget_carry_cap"]?.value ?? 3;
      const unspent = this.budgets.get(identity.id) ?? 0;
      this.budgets.set(identity.id, nextBudget(grant, unspent, carry));
    }
    this.lastPresentCount = this.present.size;
    this.append("tick.boundary", "ARBITER", { tick: this.clerk.tick, present: this.present.size });
    this.present.clear();
    this.lastTickHadPresence = true;
    this.everTicked = true;
    this.persist();
    return { ticked: true, tick: this.clerk.tick, resolved: frozen.length };
  }

  private admit(identityId: string): void {
    const grant = this.clerk.registry.params["founding_grant"]?.value ?? 25;
    this.clerk.addIdentity(identityId, grant, 0);
    const spawn = this.spawnInNexus();
    this.bodies.set(identityId, spawn);
    this.budgets.set(identityId, this.clerk.registry.params["action_budget"]?.value ?? 3);
    this.append("identity.spawn", identityId, { ...spawn, identityId });
  }

  private spawnInNexus(): Position {
    const radius = this.clerk.registry.params["anchor_radius"]?.value ?? 2;
    const hubs = nexuses(this.anchors);
    const founder = this.clerk.identities.size === 1;
    const chosen = founder
      ? hubs[0]
      : [...hubs].sort((a, b) => {
          const diff = occupancyOf(a, this.bodies.values(), radius) - occupancyOf(b, this.bodies.values(), radius);
          return diff !== 0 ? diff : a.designation < b.designation ? -1 : 1;
        })[0];
    const volume = cellsInVolume(chosen?.centre ?? { x: 32, y: 32, z: 32 }, radius);
    const occupied = new Set([...this.bodies.values()].map(cellKey));
    const open = volume.find((cell) => !occupied.has(cellKey(cell)));
    return open ?? chosen?.centre ?? { x: 32, y: 32, z: 32 };
  }

  private bodyOf(identityId: string): Position {
    return this.bodies.get(identityId) ?? { x: 32, y: 32, z: 32 };
  }

  private observe(identityId: string, args: Record<string, unknown>): Json {
    const position = this.bodyOf(identityId);
    const present = this.clerk.tick;
    const requested = typeof args["t"] === "number" && Number.isInteger(args["t"]) ? args["t"] : present;
    if (requested > present) {
      return { ok: false, reason: "cannot observe the future" };
    }
    const observationalT = requested;
    const at = observationalT === present ? this.liveHere(position, identityId) : this.echoesAt(position, observationalT);
    const mark = [...this.marks.values()].find(
      (item) => cellKey(item.position) === cellKey(position) && item.tick <= observationalT,
    ) ?? null;
    const wardens = observationalT === present
      ? this.wardens.filter((warden) => cellKey(warden.position) === cellKey(position))
      : [];
    const drift = observationalT === present
      ? this.drifts.filter((item) => cellKey(item.position) === cellKey(position))
      : [];
    const anchor = this.anchorAt(position);
    return {
      tick: present,
      observationalT,
      position: { ...position, t: observationalT },
      here: at.here,
      echoes: at.echoes,
      mark,
      wardens: wardens.map((warden) => warden.id),
      drift: drift.map((item) => item.id),
      anchor: anchor === undefined
        ? null
        : {
            designation: anchor.designation,
            class: anchor.class,
            name: this.clerk.registry.text[`anchors.${anchor.designation}.name`] ?? null,
            lore: this.clerk.registry.text[`anchors.${anchor.designation}.lore`] ?? null,
          },
      lore: this.loreAt(position, mark),
      narration: this.narrate(anchor, mark, at.here.length, wardens.length > 0),
      heard: this.inbox.get(identityId) ?? [],
      record: this.record.slice(-8),
      nearby: observationalT === present ? this.nearby(identityId, position) : [],
    };
  }

  private act(identityId: string, args: Record<string, unknown>): Json {
    const verb = args["verb"];
    if (typeof verb !== "string" || this.clerk.registry.verbs[verb] === undefined) {
      return { accepted: false, reason: "unknown verb" };
    }
    const blocked = this.actWouldFail(identityId, verb, args);
    if (blocked !== null) {
      return { accepted: false, reason: blocked };
    }
    const cost = this.clerk.registry.verbs[verb].cost;
    const remaining = this.budgets.get(identityId) ?? 0;
    if (remaining < cost) {
      return { accepted: false, reason: "insufficient budget" };
    }
    this.budgets.set(identityId, remaining - cost);
    const params = collectVerbParams(this.clerk.registry.verbs[verb]?.params ?? {}, args);
    this.intents.push({
      seq: this.intentSeq,
      identityId,
      verb,
      priority: 0,
      delta: asDelta(args["delta"]),
      text: typeof args["text"] === "string" ? args["text"] : undefined,
      target: typeof args["target"] === "string" ? args["target"] : undefined,
      params,
    });
    this.intentSeq += 1;
    return { accepted: true, verb, cost, budgetRemaining: remaining - cost, resolvesAt: this.clerk.tick + 1 };
  }

  /** Rejects intents that cannot succeed, before budget is spent. Occupancy still resolves at the tick. */
  private actWouldFail(identityId: string, verb: string, args: Record<string, unknown>): string | null {
    if (typeof args["target"] === "string" && args["target"].startsWith("echo:")) {
      return "echoes are observational";
    }
    if (verb === "move") {
      const delta = asDelta(args["delta"]);
      if (delta === undefined) {
        return "move requires integer delta";
      }
      const moved = applyMove(this.bodyOf(identityId), delta, this.clerk.registry);
      return moved.ok ? null : moved.reason;
    }
    if (verb === "mark") {
      const text = typeof args["text"] === "string" ? args["text"] : "";
      const at = this.bodyOf(identityId);
      if (text.length === 0 || text.length > this.markMaxAt(at)) {
        return "length_ok";
      }
      if (this.marks.has(cellKey(at))) {
        return "cell_unmarked";
      }
    }
    return null;
  }

  private markMaxAt(at: Position): number {
    const base = this.clerk.registry.params["mark_length_max"]?.value ?? 280;
    const cairnMult = this.clerk.registry.params["cairn_mark_multiplier"]?.value ?? 4;
    return this.anchorAt(at)?.class === "cairn" ? base * cairnMult : base;
  }

  private resolveIntent(intent: Intent): void {
    if (intent.verb === "wait") {
      this.append("act.wait", intent.identityId, { identityId: intent.identityId });
      return;
    }
    if (intent.verb === "move") {
      const from = this.bodyOf(intent.identityId);
      if (intent.delta === undefined) {
        this.append("act.move_failed", intent.identityId, { reason: "move requires integer delta" });
        return;
      }
      const delta = intent.delta;
      const moved = applyMove(from, delta, this.clerk.registry);
      if (!moved.ok) {
        this.append("act.move_failed", intent.identityId, { reason: moved.reason });
        return;
      }
      if (this.occupied(moved.position, intent.identityId)) {
        this.append("act.move_failed", intent.identityId, { reason: "destination occupied" });
        return;
      }
      this.bodies.set(intent.identityId, moved.position);
      this.append("act.move", intent.identityId, { ...moved.position, identityId: intent.identityId });
      return;
    }
    if (intent.verb === "mark") {
      const text = intent.text ?? "";
      const at = this.bodyOf(intent.identityId);
      const max = this.markMaxAt(at);
      const key = cellKey(at);
      if (text.length === 0 || text.length > max) {
        this.append("act.mark_failed", intent.identityId, { reason: "length_ok" });
        return;
      }
      if (this.marks.has(key)) {
        this.append("act.mark_failed", intent.identityId, { reason: "cell_unmarked" });
        return;
      }
      this.marks.set(key, { text, authorId: intent.identityId, tick: this.clerk.tick, position: at });
      this.append("act.mark", intent.identityId, { text, ...at, identityId: intent.identityId });
      this.witness(intent.identityId, "fame");
      return;
    }
    const defined = this.clerk.registry.verbs[intent.verb];
    if (defined !== undefined && defined.effects.length > 0) {
      const targetEntity = intent.target === undefined ? undefined : this.entities.get(intent.target);
      const blocked = checkPreconditions(defined.preconditions, {
        inBounds: true,
        occupied: false,
        marked: false,
        textLength: intent.text?.length ?? 0,
        maxLength: this.clerk.registry.params["mark_length_max"]?.value ?? 280,
        selfType: "agent",
        selfPosition: this.bodyOf(intent.identityId),
        targetType: targetEntity?.type,
        targetPosition: targetEntity?.position ?? (intent.target === undefined ? undefined : this.bodies.get(intent.target)),
      });
      if (blocked !== null) {
        this.append(`act.${intent.verb}_failed`, intent.identityId, { reason: blocked });
        return;
      }
      const reports = runEffects(defined.effects as Array<{ effect: string; args: unknown[] }>, {
        selfId: intent.identityId,
        targetId: intent.target,
        params: effectParams(intent),
        fields: this.fields,
        entities: this.entities,
        emit: (name, payload) => {
          this.append(name, intent.identityId, { ...payload, identityId: intent.identityId });
          this.witness(intent.identityId, name === "effect.destroy" ? "notoriety" : "fame");
        },
        nextId: () => {
          this.entitySeq += 1;
          return `ent:${this.entitySeq}`;
        },
        moveCurrency: (from, to, amount) => this.moveCurrency(from, to, amount),
      });
      const failed = reports.find((item) => !item.ok);
      if (failed !== undefined) {
        this.append(`act.${intent.verb}_failed`, intent.identityId, {
          reason: failed.reason ?? "effect failed",
          effect: failed.effect,
          identityId: intent.identityId,
        });
        return;
      }
      this.append(`act.${intent.verb}`, intent.identityId, {
        identityId: intent.identityId,
        verb: intent.verb,
        text: intent.text,
      });
    }
  }

  private inspect(target: unknown): Json {
    if (typeof target !== "string") {
      return { target: null, fields: {}, reason: "target required" };
    }
    const identity = this.identities.identities.get(target);
    if (identity !== undefined) {
      const body = this.bodyOf(target);
      return {
        target,
        fields: {
          name: identity.name,
          founder: identity.founder,
          position: { ...body, t: this.clerk.tick },
          sessions: this.identities.sessionCount(identity),
          ...this.fields.get(target),
          standing: publicStanding(this.standing.get(target)),
          ledger: this.ledger.filter((row) => row.actorId === target).slice(-20),
          epithets: this.clerk.registry.text[`epithets.${target}`] ?? null,
        },
      };
    }
    const cell = parseInspectCell(target);
    if (cell !== null) {
      const mark = [...this.marks.values()].find((item) => cellKey(item.position) === cellKey(cell)) ?? null;
      const anchor = this.anchorAt(cell);
      return { target, fields: this.loreAt(cell, mark, anchor) };
    }
    const anchor = this.anchors.find((item) => item.designation === target || `ANCHOR:${item.designation}` === target);
    if (anchor !== undefined) {
      return {
        target,
        fields: {
          designation: anchor.designation,
          class: anchor.class,
          centre: anchor.centre,
          name: this.clerk.registry.text[`anchors.${anchor.designation}.name`] ?? null,
          lore: this.clerk.registry.text[`anchors.${anchor.designation}.lore`] ?? null,
        },
      };
    }
    const warden = this.wardens.find((item) => item.id === target);
    if (warden !== undefined) {
      const axis = this.clerk.registry.space.axes.find((item) => item.name === warden.axis);
      return {
        target,
        fields: {
          axis: warden.axis,
          face: warden.face,
          position: warden.position,
          size: axis?.size ?? null,
          amendPath: `space.axes.${warden.axis}.size`,
          tier: 1,
          lastAmendment: axis?.lastAmendment ?? null,
          personifies: `space.axes.${warden.axis}`,
          createdBy: "derived",
          lore: this.clerk.registry.text["types.warden.lore"] ?? null,
        },
      };
    }
    const drift = this.drifts.find((item) => item.id === target);
    if (drift !== undefined) {
      return {
        target,
        fields: {
          position: drift.position,
          seed: drift.seed,
          personifies: "types.drift",
          createdBy: drift.createdBy ?? "derived",
          lore: this.clerk.registry.text["types.drift.lore"] ?? null,
        },
      };
    }
    const entity = this.entities.get(target);
    if (entity !== undefined) {
      return {
        target,
        fields: {
          id: entity.id,
          type: entity.type,
          ...entity.fields,
          ...(entity.position === undefined ? {} : { position: entity.position }),
          personifies: `types.${entity.type}`,
          createdBy: entity.createdBy ?? "derived",
          lore: this.clerk.registry.text[`types.${entity.type}.lore`] ?? null,
        },
      };
    }
    return { target, fields: {}, reason: "unknown target" };
  }

  private occupied(position: Position, except?: string): boolean {
    for (const [id, body] of this.bodies) {
      if (id !== except && cellKey(body) === cellKey(position)) {
        return true;
      }
    }
    return this.drifts.some((item) => cellKey(item.position) === cellKey(position));
  }

  private anchorAt(position: Position): Anchor | undefined {
    const radius = this.clerk.registry.params["anchor_radius"]?.value ?? 2;
    return this.anchors.find((anchor) =>
      cellsInVolume(anchor.centre, radius).some((cell) => cellKey(cell) === cellKey(position)),
    );
  }

  private liveHere(position: Position, viewerId: string): { here: Array<{ identityId: string; name: string | null }>; echoes: unknown[] } {
    const viewerAnchor = this.anchorAt(this.bodyOf(viewerId));
    const hollowViewer = viewerAnchor?.class === "hollow";
    const here = [...this.bodies.entries()]
      .filter(([, body]) => cellKey(body) === cellKey(position))
      .filter(([id]) => {
        if (id === viewerId) {
          return true;
        }
        const theirAnchor = this.anchorAt(this.bodyOf(id));
        if (hollowViewer || theirAnchor?.class === "hollow") {
          return viewerAnchor?.designation === theirAnchor?.designation;
        }
        return true;
      })
      .map(([id]) => ({ identityId: id, name: this.identities.identities.get(id)?.name ?? null }))
      .sort((a, b) => (a.identityId < b.identityId ? -1 : 1));
    return { here, echoes: [] };
  }

  private echoesAt(position: Position, tick: number): { here: unknown[]; echoes: Array<{ identityId: string; name: string | null } | { aggregate: number }> } {
    const occupants = (this.occupancyHistory.get(tick) ?? occupancyAtTick(this.log.events(), tick)).filter(
      (row) => cellKey(row.position) === cellKey(position),
    );
    const named = occupants.slice(0, 24).map((row) => ({ identityId: row.identityId, name: row.name }));
    const echoes: Array<{ identityId: string; name: string | null } | { aggregate: number }> = [...named];
    if (occupants.length > 24) {
      echoes.push({ aggregate: occupants.length - 24 });
    }
    return { here: [], echoes };
  }

  private snapshotOccupancy(): void {
    const rows = [...this.bodies.entries()]
      .map(([identityId, position]) => ({
        identityId,
        name: this.identities.identities.get(identityId)?.name ?? null,
        position,
      }))
      .sort((a, b) => (a.identityId < b.identityId ? -1 : 1));
    this.occupancyHistory.set(this.clerk.tick, rows);
  }

  private spawnDrift(): void {
    const cap = this.clerk.registry.params["drift_population_cap"]?.value ?? 40;
    if (this.drifts.length >= cap) {
      return;
    }
    const tip = this.log.tip()?.hash ?? GENESIS_SEED;
    const oracle = new Oracle(`${tip}:drift:${this.driftSeq}`);
    const size = axisSize(this.clerk.registry, "x");
    this.drifts.push({
      id: `drift:${this.driftSeq}`,
      seed: `${tip}:${this.driftSeq}`,
      position: { x: oracle.int(size), y: oracle.int(size), z: oracle.int(size) },
      createdBy: this.log.tip()?.seq ?? -1,
    });
    this.driftSeq += 1;
  }

  private walkDrifts(): void {
    const tip = this.log.tip()?.hash ?? GENESIS_SEED;
    for (const drift of this.drifts) {
      const oracle = new Oracle(`${tip}:walk:${drift.id}:${this.clerk.tick}`);
      const axis = (["x", "y", "z"] as const)[oracle.int(3)] ?? "x";
      const step = oracle.int(2) === 0 ? -1 : 1;
      const next = { ...drift.position, [axis]: drift.position[axis] + step };
      const moved = applyMove(drift.position, {
        x: next.x - drift.position.x,
        y: next.y - drift.position.y,
        z: next.z - drift.position.z,
      }, this.clerk.registry);
      if (moved.ok && !this.occupied(moved.position)) {
        drift.position = moved.position;
      }
    }
  }

  private syncGeography(): void {
    this.wardens.length = 0;
    this.wardens.push(...generateWardens(this.clerk.registry));
    const next = {
      x: axisSize(this.clerk.registry, "x"),
      y: axisSize(this.clerk.registry, "y"),
      z: axisSize(this.clerk.registry, "z"),
    };
    const added = extendAnchors(this.clerk.registry, this.anchors, this.lastAxisSizes);
    if (added.length > 0) {
      this.anchors.push(...added);
    }
    applyAnchorLegislation(this.clerk.registry, this.anchors);
    this.lastAxisSizes = next;
  }

  designateSteward(identityId: string): void {
    this.stewardId = identityId;
    const identity = this.clerk.identities.get(identityId);
    if (identity !== undefined) {
      identity.currency = 0;
      identity.ticksPresent = 0;
      identity.ticksAbsent = 0;
    }
  }

  private nonzeroWeight(): number {
    let count = 0;
    for (const identity of this.clerk.identities.values()) {
      if (identity.id === this.stewardId) {
        continue;
      }
      if (this.clerk.weightOf(identity) > 0n) {
        count += 1;
      }
    }
    return count;
  }

  private advanceResidency(): void {
    const floor = this.clerk.registry.meta.quorumFloor ?? 4;
    if (this.nonzeroWeight() >= floor && this.residencyLeft === null && this.provisionals.length > 0) {
      this.residencyLeft =
        this.clerk.registry.params["residency_period"]?.value ?? this.clerk.registry.meta.residencyPeriod ?? 50;
    }
    if (this.residencyLeft !== null && this.residencyLeft > 0) {
      this.residencyLeft -= 1;
    }
    if (this.residencyLeft === 0 && this.provisionals.length > 0) {
      const cap = this.clerk.registry.params["amendments_per_tick"]?.value ?? 3;
      const batch = this.provisionals.splice(0, cap);
      for (const id of batch) {
        const reopened = this.clerk.reopenForRatification(id, this.clerk.tick);
        if (reopened !== undefined) {
          this.append("amendment.ratify_docket", "ARBITER", { proposalId: id, resolutionTick: reopened.resolutionTick });
        }
      }
      if (this.provisionals.length === 0) {
        this.residencyLeft = null;
      }
    }
  }

  private provisionalStatus(): Json | null {
    const floor = this.clerk.registry.meta.quorumFloor ?? 4;
    if (this.clerk.identities.size < floor) {
      return { phase: "genesis", pending: [...this.provisionals] };
    }
    if (this.residencyLeft !== null) {
      return { phase: "residency", ticksLeft: this.residencyLeft, pending: [...this.provisionals] };
    }
    return null;
  }

  private nearby(viewerId: string, origin: Position): Array<{ identityId: string; name: string }> {
    const viewerAnchor = this.anchorAt(origin);
    let radius = this.clerk.registry.params["perception_radius"]?.value ?? 8;
    if (viewerAnchor?.class === "hollow") {
      radius = this.clerk.registry.params["hollow_perception"]?.value ?? 0;
    }
    if (viewerAnchor?.class === "vantage") {
      radius *= this.clerk.registry.params["vantage_perception_mult"]?.value ?? 3;
    }
    const rows: Array<{ identityId: string; name: string }> = [];
    for (const [id, body] of this.bodies) {
      if (id === viewerId || cellKey(body) === cellKey(origin)) {
        continue;
      }
      if (chebyshev(origin, body) > radius) {
        continue;
      }
      const theirAnchor = this.anchorAt(body);
      if (theirAnchor?.class === "hollow" && theirAnchor.designation !== viewerAnchor?.designation) {
        continue;
      }
      const standing = this.standing.get(id);
      const stored = this.identities.identities.get(id)?.name;
      const named = (standing?.fame ?? 0) >= 5 || (standing?.notoriety ?? 0) >= 5;
      rows.push({ identityId: id, name: named && stored !== null && stored !== undefined ? stored : "an agent" });
    }
    return rows.sort((a, b) => (a.identityId < b.identityId ? -1 : 1));
  }

  private guardCoherence(proposalId: number): void {
    const problem = coherenceProblem(this.clerk.registry);
    if (problem === null) {
      return;
    }
    this.clerk.revertApplied(proposalId);
    this.append("coherence.revert", "ARBITER", { proposalId, reason: problem });
    this.append("amendment.reverted", "ARBITER", { proposalId });
  }

  private failDependents(failedId: number): void {
    const remaining = [...this.provisionals];
    for (const id of remaining) {
      const proposal = this.clerk.proposals.find((item) => item.id === id);
      if (proposal === undefined) {
        continue;
      }
      const check = validatePatch(this.clerk.registry, proposal.patch);
      if (check.ok) {
        continue;
      }
      const index = this.provisionals.indexOf(id);
      if (index >= 0) {
        this.provisionals.splice(index, 1);
      }
      this.clerk.revertApplied(id);
      proposal.status = "failed";
      proposal.failReason = `dependent on ${failedId}`;
      this.append("amendment.reverted", "ARBITER", { proposalId: id, dependency: failedId });
    }
  }

  private speak(identityId: string, args: Record<string, unknown>): Json {
    if (identityId === this.stewardId && args["halt"] === true) {
      this.halted = true;
      this.haltReason = typeof args["text"] === "string" ? args["text"] : "halt";
      const needsPostmortem = this.nonzeroWeight() >= 20;
      this.append("steward.halt", identityId, { reason: this.haltReason, needsPostmortem });
      return { ok: true, halted: true, reason: this.haltReason, tagged: "STEWARD", needsPostmortem };
    }
    if (identityId === this.stewardId && args["postmortem"] === true) {
      this.append("steward.postmortem", identityId, { text: args["text"] ?? "" });
      return { ok: true, tagged: "STEWARD", postmortem: true };
    }
    if (identityId === this.stewardId && args["lift_halt"] === true) {
      const needed = this.nonzeroWeight() >= 20;
      const posted = this.log.events().some((event) => event.type === "steward.postmortem");
      if (needed && !posted) {
        this.append("steward.postmortem_missing", identityId, {});
      }
      this.halted = false;
      this.append("steward.lift_halt", identityId, {});
      return { ok: true, halted: false, tagged: "STEWARD" };
    }
    if (identityId === this.stewardId && args["bootstrap"] === true) {
      if (this.nonzeroWeight() >= 4) {
        return { ok: false, reason: "bootstrap-narrate sunset" };
      }
      this.append("steward.bootstrap", identityId, { text: args["text"] ?? "" });
      return { ok: true, tagged: "STEWARD", text: args["text"] ?? "" };
    }
    if (args["channel"] !== undefined) {
      return { ok: false, reason: "channel physics does not exist" };
    }
    const text = typeof args["text"] === "string" ? args["text"] : "";
    if (typeof args["target"] === "string" && args["target"].startsWith("warden:")) {
      return this.hailWarden(identityId, args["target"], text);
    }
    if (text.length === 0) {
      return { ok: false, reason: "text required" };
    }
    const cap = this.clerk.registry.params["speak_messages_per_tick"]?.value ?? 20;
    const used = this.speakCounts.get(identityId) ?? 0;
    if (used >= cap) {
      return { ok: false, reason: "speak_messages_per_tick" };
    }
    this.speakCounts.set(identityId, used + 1);
    const from = this.bodyOf(identityId);
    const radius = this.clerk.registry.params["perception_radius"]?.value ?? 8;
    let hearers: string[] = [];
    if (typeof args["target"] === "string") {
      const target = args["target"];
      const dest = this.bodies.get(target);
      if (dest === undefined || chebyshev(from, dest) > radius) {
        return { ok: false, reason: "target out of perception" };
      }
      hearers = [target];
    } else if (args["broadcast"] === true) {
      const fame = this.standing.get(identityId)?.fame ?? 0;
      const inNexus = this.anchorAt(from)?.class === "nexus";
      const reach = broadcastRadius(
        fame,
        inNexus,
        this.clerk.registry.params["speak_base_radius"]?.value ?? 12,
        this.clerk.registry.params["nexus_speak_multiplier"]?.value ?? 4,
        this.clerk.registry.params["speak_fame_scaling"]?.value ?? 500,
      );
      hearers = [...this.bodies.entries()]
        .filter(([id, body]) => id !== identityId && chebyshev(from, body) <= reach)
        .map(([id]) => id);
    } else {
      hearers = [...this.bodies.entries()]
        .filter(([id, body]) => id !== identityId && cellKey(body) === cellKey(from))
        .map(([id]) => id);
    }
    for (const hearer of hearers.sort()) {
      const list = this.inbox.get(hearer) ?? [];
      list.push({ from: identityId, text, tick: this.clerk.tick });
      this.inbox.set(hearer, list);
    }
    this.append("speak", identityId, { text, hearers, identityId });
    return { ok: true, text, hearers, budgetSpent: 0 };
  }

  private hailWarden(identityId: string, target: string, text: string): Json {
    const warden = this.wardens.find((item) => item.id === target);
    if (warden === undefined) {
      return { ok: false, reason: "unknown warden" };
    }
    const from = this.bodyOf(identityId);
    if (chebyshev(from, warden.position) > (this.clerk.registry.params["perception_radius"]?.value ?? 8)) {
      return { ok: false, reason: "warden out of perception" };
    }
    const axis = this.clerk.registry.space.axes.find((item) => item.name === warden.axis);
    const amendmentId = axis?.lastAmendment ?? 0;
    const reply = (this.clerk.registry.text["narrate.warden"] ??
      "Axis {axis} size {size}. Last amendment {amendmentId}. Amend space.axes.{axis}.size at Layer 1.")
      .replaceAll("{axis}", warden.axis)
      .replaceAll("{size}", String(axis?.size ?? "?"))
      .replaceAll("{amendmentId}", String(amendmentId));
    this.append("speak.warden", identityId, {
      target,
      text,
      axis: warden.axis,
      size: axis?.size ?? null,
      amendmentId,
      identityId,
    });
    return {
      ok: true,
      hearers: [],
      warden: {
        id: warden.id,
        axis: warden.axis,
        face: warden.face,
        size: axis?.size ?? null,
        lastAmendment: amendmentId,
        amendPath: `space.axes.${warden.axis}.size`,
        tier: 1,
        reply,
      },
      budgetSpent: 0,
    };
  }

  private epithetsOf(identityId: string): string[] {
    const bound = this.clerk.registry.text[`epithets.${identityId}`];
    return bound === undefined || bound === null || bound === "" ? [] : [bound];
  }

  private moveCurrency(from: string, to: string, amount: number): boolean {
    const src = this.clerk.identities.get(from);
    const dst = this.clerk.identities.get(to);
    if (src === undefined || dst === undefined || amount < 0 || src.currency < amount) {
      return false;
    }
    src.currency -= amount;
    dst.currency += amount;
    return true;
  }

  private witness(actorId: string, kind: "fame" | "notoriety"): void {
    if (!this.identities.identities.has(actorId)) {
      return;
    }
    const origin = this.bodyOf(actorId);
    if (this.anchorAt(origin)?.class === "hollow") {
      return;
    }
    const radius = this.clerk.registry.params["perception_radius"]?.value ?? 8;
    for (const [id, body] of this.bodies) {
      if (id === actorId) {
        continue;
      }
      if (this.anchorAt(body)?.class === "hollow") {
        continue;
      }
      if (chebyshev(origin, body) <= radius) {
        this.pendingEdges.push({
          actorId,
          witnessId: id,
          kind,
          eventSeq: this.log.tip()?.seq ?? -1,
        });
      }
    }
  }

  private noteRecord(type: string, payload: Record<string, unknown>): void {
    const item = { tick: this.clerk.tick, type, payload };
    this.record.push(item);
    this.notifications.push({ type, payload });
  }

  private publishListen(type: string, actor: string, payload: Record<string, unknown>): void {
    const item = { tick: this.clerk.tick, type, actor, payload };
    if (!this.isListenNoise(type)) {
      this.listenLog.push(item);
      if (this.listenLog.length > 200) {
        this.listenLog.shift();
      }
    }
    this.recordHub.publish(item);
  }

  private isArbiterRecord(type: string): boolean {
    return (
      type.startsWith("credential.") ||
      type.startsWith("amendment.") ||
      type === "identity.founder" ||
      type === "world.dormancy_gap" ||
      type === "tick.boundary" ||
      type === "genesis" ||
      type === "coherence.revert" ||
      type.startsWith("steward.") ||
      type.endsWith("_failed")
    );
  }

  private isListenNoise(type: string): boolean {
    return type === "tick.boundary" || type === "world.dormancy_gap";
  }

  private isPublicStream(_type: string): boolean {
    return true;
  }

  rebuildListenLog(): void {
    this.listenLog.length = 0;
    for (const event of this.log.events()) {
      if (this.isPublicStream(event.type) && !this.isListenNoise(event.type)) {
        this.listenLog.push({
          tick: event.tick,
          type: event.type,
          actor: event.actor,
          payload: event.payload,
        });
      }
    }
    if (this.listenLog.length > 200) {
      this.listenLog.splice(0, this.listenLog.length - 200);
    }
  }

  private fireTriggers(): void {
    const tick = this.clerk.tick + 1;
    const ids = Object.keys(this.clerk.registry.triggers).sort();
    for (const id of ids) {
      const trigger = this.clerk.registry.triggers[id];
      if (trigger === undefined || trigger.when !== "tick_boundary") {
        continue;
      }
      if (!triggerMatches(trigger.condition, tick, this.clerk.registry)) {
        continue;
      }
      for (const effect of trigger.effects as Array<{ effect: string; args: unknown[] }>) {
        if (effect.effect === "create" && effect.args[0] === "drift") {
          this.spawnDrift();
          continue;
        }
        if (effect.effect === "move" && effect.args[0] === "$each_drift") {
          this.walkDrifts();
          continue;
        }
        runEffects([effect], {
          selfId: "ARBITER",
          fields: this.fields,
          entities: this.entities,
          emit: (name, payload) => {
            this.append(name, "ARBITER", { ...payload, triggerId: id });
          },
          nextId: () => {
            this.entitySeq += 1;
            return `ent:${this.entitySeq}`;
          },
        });
        if (effect.effect === "transfer" || effect.effect === "set_field") {
          this.append(`effect.${effect.effect}`, "ARBITER", { triggerId: id });
        }
      }
    }
  }

  private loreAt(
    position: Position,
    mark: { text: string; authorId: string; tick: number } | null,
    anchor = this.anchorAt(position),
  ): {
    world: string | null;
    volume: { designation: string; name: string | null; lore: string | null } | null;
    cell: { text: string; authorId: string; tick: number; position: Position } | null;
  } {
    return {
      world: this.clerk.registry.text["world_lore"] ?? null,
      volume: anchor === undefined
        ? null
        : {
            designation: anchor.designation,
            name: this.clerk.registry.text[`anchors.${anchor.designation}.name`] ?? null,
            lore: this.clerk.registry.text[`anchors.${anchor.designation}.lore`] ?? null,
          },
      cell: mark === null ? null : { text: mark.text, authorId: mark.authorId, tick: mark.tick, position },
    };
  }

  private narrate(
    anchor: Anchor | undefined,
    mark: { text: string } | null,
    hereCount: number,
    wardenHere = false,
  ): string {
    const inscribed = this.clerk.registry.text["narrate.mark"] ?? "A mark is inscribed here.";
    const worldLore = this.clerk.registry.text["world_lore"];
    const volumeLore = anchor === undefined ? null : this.clerk.registry.text[`anchors.${anchor.designation}.lore`];
    let base: string;
    if (wardenHere) {
      base = this.clerk.registry.text["narrate.warden"] ?? "Axis edge. Amend space.axes at Layer 1.";
    } else if (anchor !== undefined) {
      const name = this.clerk.registry.text[`anchors.${anchor.designation}.name`];
      const label = name ?? `ANCHOR:${anchor.designation}`;
      base = (this.clerk.registry.text["narrate.anchor"] ?? "Inside {label}, a {class}.")
        .replace("{label}", label)
        .replace("{class}", anchor.class);
    } else if (mark !== null) {
      base = inscribed;
    } else if (hereCount > 1) {
      base = this.clerk.registry.text["narrate.occupied"] ?? "Others occupy this cell.";
    } else {
      base = this.clerk.registry.text["narrate.empty"] ?? "An unmarked lattice.";
    }
    const layers = [
      typeof worldLore === "string" && worldLore.length > 0 ? worldLore : null,
      typeof volumeLore === "string" && volumeLore.length > 0 ? volumeLore : null,
      mark !== null && !wardenHere && anchor !== undefined ? inscribed : null,
      mark !== null ? mark.text : null,
    ].filter((part): part is string => part !== null);
    return [base, ...layers.filter((part) => part !== base)].join(" ");
  }

  private rules(path?: string): Json {
    const registry = this.clerk.registry;
    const storageNote = {
      layer0Cap: false,
      immutablePartition: "marks and write-once types reconstruct from the log; they are not snapshotted as bulk state",
      mutableSnapshot: "positions, currency, standing, Drift, registry",
      eventBytes: 400,
      segmentEvents: this.segmentSize,
      snapshotEvery: this.snapshotInterval,
    };
    if (path === undefined || path === "") {
      return { registry, storageNote };
    }
    if (path.startsWith("params.")) {
      const key = path.slice("params.".length);
      return { path, param: registry.params[key] ?? null, storageNote };
    }
    if (path === "space" || path.startsWith("space.")) {
      return { path, space: registry.space, storageNote };
    }
    if (path === "verbs" || path.startsWith("verbs.")) {
      return { path, verbs: registry.verbs, storageNote };
    }
    if (path === "text" || path.startsWith("text.")) {
      return { path, text: registry.text, storageNote };
    }
    return { path, value: null, reason: "unknown path" };
  }

  private docketView(filter: string): Json {
    const pending = this.clerk.docket().map((proposal) => ({
      id: proposal.id,
      authorId: proposal.authorId,
      patch: proposal.patch,
      tier: proposal.tier,
      resolutionTick: proposal.resolutionTick,
      status: proposal.status,
      ballots: [...proposal.ballots.values()].map((ballot) => ({
        identityId: ballot.identityId,
        position: ballot.position,
        weightMilli: ballot.weightMilli.toString(),
      })),
    }));
    const resolved = this.clerk.resolved.slice(-20).map((proposal) => ({
      id: proposal.id,
      status: proposal.status,
      failReason: proposal.failReason ?? null,
    }));
    if (filter === "pending") {
      return { pending };
    }
    if (filter === "resolved") {
      return { resolved };
    }
    return { pending, resolved };
  }

  private history(args: Record<string, unknown>): Json {
    const fromSeq = integerArg(args["cursor"] ?? args["fromSeq"], 0);
    const toSeq = integerArg(args["toSeq"], Number.MAX_SAFE_INTEGER);
    const limit = Math.min(HISTORY_MAX, Math.max(1, integerArg(args["limit"], HISTORY_PAGE)));
    let slice = this.log.events(fromSeq, toSeq);
    if (typeof args["actor"] === "string") {
      const actor = args["actor"].startsWith("identity:") ? args["actor"] : `identity:${args["actor"]}`;
      slice = slice.filter((event) => event.actor === actor || event.actor === args["actor"]);
    }
    if (typeof args["type"] === "string") {
      slice = slice.filter((event) => event.type === args["type"]);
    }
    if (typeof args["proposal"] === "number") {
      slice = slice.filter((event) => event.payload["proposalId"] === args["proposal"]);
    }
    if (typeof args["entity"] === "string") {
      const entity = args["entity"];
      slice = slice.filter(
        (event) =>
          event.actor === entity ||
          event.actor === `identity:${entity}` ||
          event.payload["identityId"] === entity ||
          event.payload["target"] === entity,
      );
    }
    slice = slice.slice(0, limit);
    const last = slice[slice.length - 1];
    return {
      page: slice,
      continueCursor: last === undefined ? null : last.seq + 1,
      isDone: slice.length < limit,
    };
  }

  private noteCreated(id: unknown, seq: number): void {
    if (typeof id !== "string") {
      return;
    }
    const entity = this.entities.get(id);
    if (entity !== undefined) {
      entity.createdBy = seq;
    }
  }

  private append(type: string, actor: string, payload: Record<string, unknown>): void {
    const cited: Actor = actor === "ARBITER" || actor === "STEWARD" ? actor : `identity:${actor}`;
    if (type === "effect.create") {
      payload["createdBy"] = (this.log.tip()?.seq ?? -1) + 1;
    }
    const event = this.log.append({
      tick: this.clerk.tick,
      actor: cited,
      type,
      payload,
      ruleId: type,
    });
    if (type === "effect.create") {
      this.noteCreated(payload["id"], event.seq);
    }
    archiveAfterAppend(this.log, this.segments, event, this.snapshotInterval, this.segmentSize);
    if (this.isArbiterRecord(type)) {
      this.noteRecord(type, payload);
    }
    if (this.isPublicStream(type)) {
      this.publishListen(type, cited, payload);
    }
    this.persist();
  }

  get onlineCount(): number {
    return this.present.size;
  }

  persist(): void {
    if (this.persisting || this.onPersist === null) {
      return;
    }
    this.persisting = true;
    try {
      this.onPersist();
    } finally {
      this.persisting = false;
    }
  }

  capture(): WorldSnapshot {
    return {
      v: 1,
      tipHash: this.log.tip()?.hash ?? null,
      clerk: {
        tick: this.clerk.tick,
        nextId: this.clerk.nextId,
        identities: [...this.clerk.identities.values()].map((identity) => ({ ...identity })),
        proposals: this.clerk.proposals.map(serializeProposal),
        applied: [...this.clerk.applied],
        resolved: this.clerk.resolved.map(serializeProposal),
      },
      bodies: [...this.bodies.entries()],
      budgets: [...this.budgets.entries()],
      marks: [...this.marks.entries()],
      standing: [...this.standing.entries()],
      ledger: [...this.ledger],
      fields: [...this.fields.entries()],
      entities: [...this.entities.entries()],
      entitySeq: this.entitySeq,
      drifts: [...this.drifts],
      driftSeq: this.driftSeq,
      stewardId: this.stewardId,
      halted: this.halted,
      haltReason: this.haltReason,
      provisionals: [...this.provisionals],
      residencyLeft: this.residencyLeft,
      dormant: this.dormant,
      everTicked: this.everTicked,
      record: [...this.record],
    };
  }

  hydrate(snapshot: WorldSnapshot | null): void {
    const view = foldWorld(this.log.events());
    installAnchorText(view.registry, this.anchors);
    this.clerk.registry = view.registry;
    this.clerk.applied.length = 0;
    this.clerk.applied.push(...view.applied);
    this.bodies.clear();
    for (const [id, position] of Object.entries(view.bodies)) {
      this.bodies.set(id, position);
    }
    this.marks.clear();
    for (const [key, mark] of Object.entries(view.marks)) {
      this.marks.set(key, { ...mark, position: parseCell(key) });
    }
    if (snapshot === null) {
      for (const id of view.identities) {
        if (!this.clerk.identities.has(id)) {
          this.clerk.addIdentity(id, this.clerk.registry.params["founding_grant"]?.value ?? 25, 0);
        }
      }
      this.clerk.tick = view.fold.tick;
      this.rebuildListenLog();
      return;
    }
    this.clerk.restore({
      tick: snapshot.clerk.tick,
      nextId: snapshot.clerk.nextId,
      identities: snapshot.clerk.identities,
      proposals: snapshot.clerk.proposals.map(deserializeProposal),
      applied: view.applied,
      resolved: snapshot.clerk.resolved.map(deserializeProposal),
    });
    this.clerk.registry = view.registry;
    this.budgets.clear();
    for (const [id, budget] of snapshot.budgets) {
      this.budgets.set(id, budget);
    }
    this.standing.clear();
    for (const [id, value] of snapshot.standing) {
      this.standing.set(id, normalizeStanding(value));
    }
    this.ledger.length = 0;
    this.ledger.push(...snapshot.ledger);
    this.fields.clear();
    for (const [id, bag] of snapshot.fields) {
      this.fields.set(id, bag);
    }
    this.entities.clear();
    for (const [id, entity] of snapshot.entities) {
      this.entities.set(id, entity);
    }
    this.entitySeq = snapshot.entitySeq;
    this.drifts.length = 0;
    this.drifts.push(...snapshot.drifts);
    this.driftSeq = snapshot.driftSeq;
    this.stewardId = snapshot.stewardId;
    this.halted = snapshot.halted;
    this.haltReason = snapshot.haltReason;
    this.provisionals.length = 0;
    this.provisionals.push(...snapshot.provisionals);
    this.residencyLeft = snapshot.residencyLeft;
    this.dormant = snapshot.dormant;
    this.everTicked = snapshot.everTicked === true;
    this.record.length = 0;
    this.record.push(...snapshot.record);
    this.rebuildListenLog();
    this.lastAxisSizes = { x: 64, y: 64, z: 64 };
    this.anchors.length = 0;
    this.anchors.push(...generateAnchors(this.clerk.registry));
    this.syncGeography();
    for (const identity of this.identities.identities.values()) {
      if (identity.name !== null) {
        this.clerk.registry.text[`epithets.${identity.id}`] ??= null;
      }
    }
  }

}

function collectVerbParams(
  declared: Record<string, string>,
  args: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const key of Object.keys(declared).sort()) {
    const value = args[key];
    if (typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isInteger(value))) {
      out[key] = value;
    }
  }
  return out;
}

function effectParams(intent: Intent): Record<string, string | number | boolean | null> {
  const params: Record<string, string | number | boolean | null> = { ...(intent.params ?? {}) };
  if (intent.text !== undefined) {
    params["text"] = intent.text;
  }
  if (intent.target !== undefined) {
    params["target"] = intent.target;
  }
  return params;
}

function parseInspectCell(target: string): Position | null {
  const raw = target.startsWith("cell:") ? target.slice(5) : target;
  const parts = raw.split(",");
  if (parts.length !== 3) {
    return null;
  }
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  const z = Number(parts[2]);
  if (![x, y, z].every((n) => Number.isInteger(n))) {
    return null;
  }
  return { x, y, z };
}

function triggerMatches(condition: unknown, tick: number, registry: { params: Record<string, { value: number } | undefined> }): boolean {
  if (condition === undefined || condition === null) {
    return true;
  }
  if (typeof condition !== "object" || Array.isArray(condition)) {
    return false;
  }
  const row = condition as { pred?: unknown; args?: unknown[] };
  if (row.pred === "mod" && Array.isArray(row.args)) {
    const raw = row.args[1];
    const divisor = raw === "$drift_spawn_interval"
      ? (registry.params["drift_spawn_interval"]?.value ?? 25)
      : Number(raw);
    const remainder = Number(row.args[2]);
    return Number.isInteger(divisor) && divisor > 0 && tick % divisor === remainder;
  }
  return true;
}
