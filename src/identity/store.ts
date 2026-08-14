import { randomBytes } from "node:crypto";
import {
  hashBearer,
  hashSecret,
  isLegalName,
  openRequestState,
  randomToken,
  sealRequestState,
  verifySecret,
  type RequestStatePayload,
} from "./secrets.ts";

export interface StoredIdentity {
  id: string;
  name: string | null;
  founder: boolean;
  rootHash: string;
  recoveryHashes: Array<{ hash: string; used: boolean }>;
  sessions: Array<{ id: string; label: string; hash: string; revoked: boolean; expiresAt?: number }>;
  firstAuth: boolean;
}

export type FirstContactIntent = "register" | "mint_session" | "recover" | "revoke_session";

export class IdentityStore {
  readonly identities = new Map<string, StoredIdentity>();
  private founderId: string | null = null;
  private readonly names = new Map<string, string>();

  constructor(readonly serverKey: Buffer) {}

  exportRecords(): StoredIdentity[] {
    return [...this.identities.values()].map((identity) => structuredClone(identity));
  }

  importRecords(records: readonly StoredIdentity[]): void {
    this.identities.clear();
    this.names.clear();
    this.founderId = null;
    for (const record of records) {
      const identity = structuredClone(record);
      this.identities.set(identity.id, identity);
      if (identity.founder) {
        this.founderId = identity.id;
      }
      if (identity.name !== null) {
        this.names.set(identity.name.toLowerCase(), identity.id);
      }
    }
  }

  issueFirstContactState(now: number): string {
    return sealRequestState(this.serverKey, {
      v: 1,
      exp: now + 600_000,
      nonce: randomBytes(16).toString("hex"),
      purpose: "first_contact",
    });
  }

  issueNameState(now: number, identityId: string): string {
    return sealRequestState(this.serverKey, {
      v: 1,
      exp: now + 600_000,
      nonce: randomBytes(16).toString("hex"),
      purpose: "name",
      identityId,
    });
  }

  readState(token: string, now: number, purpose: RequestStatePayload["purpose"]): RequestStatePayload | null {
    const payload = openRequestState(this.serverKey, token, now);
    if (payload === null || payload.purpose !== purpose) {
      return null;
    }
    return payload;
  }

  register(): { identity: StoredIdentity; root: string; recoveryCodes: string[] } {
    const id = randomToken("id", 16);
    const root = randomToken("root", 32);
    const recoveryCodes = Array.from({ length: 10 }, () => randomToken("rec", 16));
    const identity: StoredIdentity = {
      id,
      name: null,
      founder: this.founderId === null,
      rootHash: hashSecret(root),
      recoveryHashes: recoveryCodes.map((code) => ({ hash: hashSecret(code), used: false })),
      sessions: [],
      firstAuth: false,
    };
    if (this.founderId === null) {
      this.founderId = id;
    }
    this.identities.set(id, identity);
    return { identity, root, recoveryCodes };
  }

  mintSession(identity: StoredIdentity, label: string, now = 0): { token: string; sessionId: string } {
    const legal = isLegalName(label);
    if (legal !== null) {
      throw new Error(legal);
    }
    const token = randomToken("ses", 32);
    const sessionId = randomToken("sid", 8);
    const ttl = Number(process.env["AGORA_SESSION_TTL_MS"] ?? 0);
    const expiresAt = Number.isInteger(ttl) && ttl > 0 ? now + ttl : undefined;
    identity.sessions.push({ id: sessionId, label, hash: hashBearer(token), revoked: false, expiresAt });
    identity.firstAuth = true;
    return { token, sessionId };
  }

  authenticate(bearer: string, now = 0): StoredIdentity | null {
    if (!bearer.startsWith("ses_")) {
      return null;
    }
    const hashed = hashBearer(bearer);
    for (const identity of this.identities.values()) {
      for (const session of identity.sessions) {
        if (session.revoked || session.hash !== hashed) {
          continue;
        }
        if (session.expiresAt !== undefined && session.expiresAt < now) {
          return null;
        }
        return identity;
      }
    }
    return null;
  }

  findByRoot(root: string): StoredIdentity | null {
    if (!root.startsWith("root_")) {
      return null;
    }
    for (const identity of this.identities.values()) {
      if (verifySecret(root, identity.rootHash)) {
        return identity;
      }
    }
    return null;
  }

  redeemRecovery(code: string, invalidateSessions: boolean): { identity: StoredIdentity; root: string } | null {
    if (!code.startsWith("rec_")) {
      return null;
    }
    for (const identity of this.identities.values()) {
      for (const slot of identity.recoveryHashes) {
        if (slot.used) {
          continue;
        }
        if (verifySecret(code, slot.hash)) {
          slot.used = true;
          const root = randomToken("root", 32);
          identity.rootHash = hashSecret(root);
          if (invalidateSessions) {
            for (const session of identity.sessions) {
              session.revoked = true;
            }
          }
          return { identity, root };
        }
      }
    }
    return null;
  }

  setName(identity: StoredIdentity, name: string): string | null {
    if (identity.name !== null) {
      return "name is already set";
    }
    const reason = isLegalName(name);
    if (reason !== null) {
      return reason;
    }
    const key = name.toLowerCase();
    if (this.names.has(key)) {
      return "name is taken";
    }
    identity.name = name;
    this.names.set(key, identity.id);
    return null;
  }

  revokeByLabel(identity: StoredIdentity, label: string): boolean {
    let found = false;
    for (const session of identity.sessions) {
      if (session.label === label && !session.revoked) {
        session.revoked = true;
        found = true;
      }
    }
    return found;
  }

  sessionCount(identity: StoredIdentity): number {
    return identity.sessions.filter((session) => !session.revoked).length;
  }
}
