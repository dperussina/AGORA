import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { foldAll, genesisState, SqliteLog, takeSnapshot, verifyChain } from "../engine/index.ts";

const logPath = process.argv.includes("--log")
  ? process.argv[process.argv.indexOf("--log") + 1]
  : join(mkdtempSync(join(tmpdir(), "agora-")), "agora-m1.sqlite");

if (logPath === undefined) {
  throw new Error("missing --log path");
}

const log = new SqliteLog(logPath);
if (log.tip() === undefined) {
  log.append({
    tick: 0,
    actor: "ARBITER",
    type: "genesis",
    payload: {},
    ruleId: "L0-genesis",
  });
  log.append({
    tick: 0,
    actor: "ARBITER",
    type: "append_test",
    payload: { set: { demo: 1 } },
    ruleId: "L0-genesis",
  });
}

const events = log.events();
const a = foldAll(events, genesisState());
const b = foldAll(events, genesisState());
const chain = verifyChain(events);
const snapshot = takeSnapshot(a);
log.saveSnapshot(snapshot);

const ok =
  chain.ok &&
  a.tipHash === b.tipHash &&
  a.tipSeq === b.tipSeq &&
  JSON.stringify(a.mutable) === JSON.stringify(b.mutable);

console.log(
  JSON.stringify({
    log: logPath,
    tipSeq: a.tipSeq,
    tipHash: a.tipHash,
    ok,
  }),
);

log.close();
process.exitCode = ok ? 0 : 1;
