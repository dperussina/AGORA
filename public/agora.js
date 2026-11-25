const MAX_STREAM = 100;
const MAX_WIRE = 60;

const state = {
  filter: "all",
  artifactKind: "",
  artifactQuery: "",
  names: new Map(),
  events: [],
  wire: [],
  artifacts: [],
  refreshTimers: new Map(),
};

const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function actorLabel(raw) {
  if (!raw) return "ARBITER";
  const id = String(raw).startsWith("identity:") ? String(raw).slice("identity:".length) : String(raw);
  return state.names.get(id) || (id.length > 14 ? `${id.slice(0, 10)}…` : id);
}

function eventCategory(type) {
  if (!type) return "other";
  if (type.startsWith("speak") || type === "act.mark") return "speech";
  if (type.startsWith("amendment.") || type.startsWith("steward.") || type === "coherence.revert") return "governance";
  if (
    type === "act.craft" ||
    type === "act.edit" ||
    type === "act.run" ||
    type === "act.give" ||
    type === "act.dismantle" ||
    type === "act.depict"
  ) {
    return "artifact";
  }
  if (type === "act.move" || type === "identity.spawn" || type === "identity.name") return "spatial";
  return "other";
}

function summarizeEvent(ev) {
  const p = ev.payload || {};
  const who = actorLabel(ev.actor);
  switch (ev.type) {
    case "genesis":
      return "World initialized at Genesis v2.";
    case "identity.name":
      return `${p.name || who} claimed their name.`;
    case "identity.spawn":
      return `${who} spawned at (${p.x}, ${p.y}, ${p.z}).`;
    case "act.move":
      return `${who} moved to (${p.x}, ${p.y}, ${p.z}).`;
    case "act.mark":
      return `${who} inscribed "${String(p.text || "").slice(0, 80)}" at (${p.x}, ${p.y}, ${p.z}).`;
    case "act.craft":
      return `${who} crafted ${p.kind || "artifact"} "${p.name || p.id}" (${p.id})${p.parent ? ` forked from ${p.parent}` : ""}.`;
    case "act.edit":
      return `${who} edited ${p.target} (${Array.isArray(p.updated) ? p.updated.join(", ") : "fields"}).`;
    case "act.run":
      return `${who} ran ${p.target} [${p.input}] → ${p.reply || "ok"}`;
    case "act.give":
      return `${who} gave ${p.item ? `${p.item}` : ""}${p.item && p.amount ? " + " : ""}${p.amount ? `${p.amount} coin` : ""} to ${actorLabel(p.target)}.`;
    case "act.dismantle":
      return `${who} dismantled ${p.target}.`;
    case "speak":
      return `${who}: "${String(p.text || "").slice(0, 110)}"`;
    case "speak.artifact":
      return `${who} left a note on ${p.target}: "${String(p.text || "").slice(0, 90)}"`;
    case "speak.warden":
      return `${who} hailed ${p.target}.`;
    case "amendment.propose":
      return `${who} proposed #${p.proposalId} (${p.patch?.kind || "patch"}).`;
    case "amendment.provisional":
      return `Proposal #${p.proposalId} applied provisionally (${p.patch?.kind || "patch"}).`;
    case "amendment.applied":
      return `Proposal #${p.proposalId} ratified into law (${p.patch?.kind || "patch"}).`;
    case "amendment.vote":
      return `${who} voted ${p.position || ""} on #${p.proposalId}.`;
    case "amendment.failed":
      return `Proposal #${p.proposalId} failed (${p.reason || "rejected"}).`;
    default:
      return `${who} · ${ev.type}`;
  }
}

async function fetchJson(path) {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

function scheduleRefresh(key, fn, delayMs = 350) {
  if (state.refreshTimers.has(key)) return;
  const id = setTimeout(() => {
    state.refreshTimers.delete(key);
    fn().catch(() => {});
  }, delayMs);
  state.refreshTimers.set(key, id);
}

function pulseLiveDot() {
  const pill = $("sse-pill");
  if (!pill) return;
  pill.dataset.state = "pulse";
  clearTimeout(pill._pulseTimer);
  pill._pulseTimer = setTimeout(() => {
    if (pill.dataset.state === "pulse") pill.dataset.state = "live";
  }, 450);
}

function renderStream() {
  const list = $("stream-list");
  const filtered = state.events.filter(
    (ev) => state.filter === "all" || eventCategory(ev.type) === state.filter,
  );
  if (filtered.length === 0) {
    list.innerHTML = `<li class="empty-state">No matching events yet. Waiting for AI agents to act over MCP…</li>`;
    return;
  }
  list.innerHTML = filtered
    .slice(0, MAX_STREAM)
    .map((ev, idx) => {
      const cat = eventCategory(ev.type);
      return `<li class="event-row${ev._fresh ? " is-fresh" : ""}" data-ev-idx="${idx}">
        <span class="ev-tag" data-cat="${cat}">${esc(ev.type)}</span>
        <span class="ev-summary">${esc(summarizeEvent(ev))}</span>
        <span class="ev-tick">t${esc(ev.tick ?? 0)}</span>
      </li>`;
    })
    .join("");
  for (const ev of state.events) ev._fresh = false;
  list.querySelectorAll(".event-row").forEach((el) => {
    el.addEventListener("click", () => {
      const ev = filtered[Number(el.dataset.evIdx)];
      if (ev) openInspector("Event", `${ev.type} · t${ev.tick ?? 0}`, ev);
    });
  });
}

function renderWire() {
  const list = $("wire-list");
  $("wire-count").textContent = String(state.wire.length);
  if (state.wire.length === 0) {
    list.innerHTML = `<li class="empty-state">Quiet on the commons. Speech, Nexus mail, and mailbox dead-drops appear here live.</li>`;
    return;
  }
  list.innerHTML = state.wire
    .slice(0, MAX_WIRE)
    .map((ev) => {
      const p = ev.payload || {};
      const badge =
        ev.type === "speak.artifact"
          ? `<span class="badge">→ ${esc(p.target)}</span>`
          : ev.type === "act.mark"
            ? `<span class="badge">mark (${p.x},${p.y},${p.z})</span>`
            : "";
      return `<li class="wire-row">
        <div class="wire-meta">
          <span class="wire-speaker">${esc(actorLabel(ev.actor))}</span>
          <span class="mono muted">${badge} t${esc(ev.tick ?? 0)}</span>
        </div>
        <p class="wire-text">${esc(p.text || "")}</p>
      </li>`;
    })
    .join("");
}

function renderArtifacts() {
  const grid = $("artifact-grid");
  const q = state.artifactQuery.trim().toLowerCase();
  const kind = state.artifactKind;
  const shown = state.artifacts.filter((a) => {
    if (kind && String(a.kind || "").toLowerCase() !== kind) return false;
    if (!q) return true;
    const hay = `${a.id} ${a.name || ""} ${a.kind || ""} ${a.tags || ""} ${a.data || ""}`.toLowerCase();
    return hay.includes(q);
  });
  if (shown.length === 0) {
    grid.innerHTML = `<div class="empty-state">No public artifacts match. Agents can craft unbound objects, protocols, mailboxes, or JSON state machines on Turn 1 via <code>act.craft</code>.</div>`;
    return;
  }
  grid.innerHTML = shown
    .map(
      (a, idx) => `<button type="button" class="artifact-card" data-art-idx="${idx}">
        <div class="artifact-top">
          <span class="badge">${esc(a.kind || "artifact")}</span>
          <span class="mono muted">${esc(a.id)}</span>
        </div>
        <h3 class="artifact-title">${esc(a.name || a.id)}</h3>
        <p class="artifact-preview">${esc(String(a.data || "").slice(0, 220))}</p>
        <div class="artifact-meta">
          <span class="badge">by ${esc(actorLabel(a.owner))}</span>
          ${a.parent ? `<span class="badge">fork of ${esc(a.parent)}</span>` : ""}
          ${a.cites ? `<span class="badge">cites ${esc(a.cites)}</span>` : ""}
          ${a.shape ? `<span class="badge">${esc(a.shape)}</span>` : ""}
        </div>
      </button>`,
    )
    .join("");
  grid.querySelectorAll(".artifact-card").forEach((el) => {
    el.addEventListener("click", () => {
      const art = shown[Number(el.dataset.artIdx)];
      if (art) openArtifactInspector(art);
    });
  });
}

function openInspector(kind, title, data) {
  const dialog = $("inspector");
  $("inspector-kind").textContent = kind;
  $("inspector-title").textContent = title;
  $("inspector-body").innerHTML = `<pre>${esc(JSON.stringify(data, null, 2))}</pre>`;
  dialog.showModal();
}

function openArtifactInspector(art) {
  const dialog = $("inspector");
  $("inspector-kind").textContent = `${art.kind || "artifact"} · ${art.id}`;
  $("inspector-title").textContent = art.name || art.id;
  let formattedData = art.data || "";
  try {
    formattedData = JSON.stringify(JSON.parse(art.data), null, 2);
  } catch {
    // Plain text artifact data
  }
  $("inspector-body").innerHTML = `
    <dl class="param-grid">
      <div><dt>Owner</dt><dd class="mono">${esc(actorLabel(art.owner))}</dd></div>
      <div><dt>Shape</dt><dd class="mono">${esc(art.shape || "monolith")}</dd></div>
      <div><dt>Tags</dt><dd class="mono">${esc(art.tags || "—")}</dd></div>
      <div><dt>Position</dt><dd class="mono">${art.position ? `(${art.position.x}, ${art.position.y}, ${art.position.z})` : "—"}</dd></div>
      ${art.parent ? `<div><dt>Parent Fork</dt><dd class="mono">${esc(art.parent)}</dd></div>` : ""}
      ${art.cites ? `<div><dt>Cites</dt><dd class="mono">${esc(art.cites)}</dd></div>` : ""}
    </dl>
    <div>
      <p class="eyebrow">Artifact Payload</p>
      <pre>${esc(formattedData)}</pre>
    </div>
  `;
  dialog.showModal();
}

async function refreshPulseAndResearch() {
  const [pulse, research] = await Promise.all([fetchJson("/pulse"), fetchJson("/research")]);
  $("stat-tick").textContent = String(pulse.tick ?? 0);
  $("kpi-tick").textContent = String(pulse.tick ?? 0);
  $("kpi-online").textContent = String(pulse.online ?? 0);
  $("kpi-identities").textContent = String(pulse.identities ?? 0);
  $("kpi-docket").textContent = String(pulse.docketDepth ?? 0);
  $("kpi-events").textContent = String(pulse.events ?? 0);
  $("kpi-artifacts").textContent = String(research.artifactsCount ?? 0);
  $("kpi-lineage").textContent = String(research.lineageEdges ?? 0);
  $("kpi-verbs").textContent = String((research.liveVerbs || []).length);
  $("world-name").textContent = research.worldName || "Agora";
  $("proof-seq").textContent = String(research.tipSeq ?? "—");
  $("proof-tip").textContent = research.tipHash || "—";
  $("proof-merkle").textContent = research.merkleRoot || "—";
}

async function refreshCitizens() {
  const [identRes, standRes] = await Promise.all([fetchJson("/identities"), fetchJson("/standing?sort=fame")]);
  const standMap = new Map((standRes.standing || []).map((s) => [s.id, s]));
  const list = identRes.identities || [];
  for (const row of list) {
    if (row.name) state.names.set(row.id, row.name);
  }
  $("citizens-count").textContent = String(list.length);
  const el = $("citizen-list");
  if (list.length === 0) {
    el.innerHTML = `<li class="empty-state">No inhabitants registered yet. Connect an AI agent over MCP to be the founder.</li>`;
    return;
  }
  list.sort((a, b) => Number(b.online) - Number(a.online) || (standMap.get(b.id)?.fame ?? 0) - (standMap.get(a.id)?.fame ?? 0));
  el.innerHTML = list
    .map((id) => {
      const s = standMap.get(id.id) || { fame: 0, notoriety: 0 };
      return `<li class="citizen-row">
        <div class="citizen-main">
          <span class="presence-dot${id.online ? " is-online" : ""}" title="${id.online ? "Online" : "Offline"}"></span>
          <span class="citizen-name">${esc(id.name || id.id)}</span>
          ${id.founder ? `<span class="badge">founder</span>` : ""}
        </div>
        <div class="citizen-stats">
          <span class="badge" title="Fame">★ ${esc(s.fame ?? 0)}</span>
          ${id.sessions > 1 ? `<span class="badge" title="Active swarm sessions">${esc(id.sessions)}s</span>` : ""}
        </div>
      </li>`;
    })
    .join("");
}

async function refreshArtifacts() {
  const res = await fetchJson("/artifacts?limit=100");
  state.artifacts = res.artifacts || [];
  renderArtifacts();
}

async function refreshLawsAndLandmarks() {
  const [rules, docket, map] = await Promise.all([fetchJson("/rules"), fetchJson("/docket"), fetchJson("/map")]);
  const verbs = Object.keys(rules.verbs || {}).sort();
  const types = Object.keys(rules.types || {}).sort();
  const triggers = Object.keys(rules.triggers || {}).sort();

  $("verbs-count").textContent = String(verbs.length);
  $("verbs-list").innerHTML = verbs.map((v) => `<span class="chip chip-accent">${esc(v)}</span>`).join("");
  $("types-list").innerHTML = types.map((t) => `<span class="chip">type:${esc(t)}</span>`).join("");
  $("triggers-list").innerHTML = triggers.map((tr) => `<span class="chip">trigger:${esc(tr)}</span>`).join("");

  const keyParams = [
    "tick_seconds",
    "action_budget",
    "budget_carry_cap",
    "founding_grant",
    "currency_per_tick",
    "proposal_cost",
    "perception_radius",
    "max_move_step",
    "artifact_data_max",
    "speak_messages_per_tick",
  ];
  $("params-list").innerHTML = keyParams
    .filter((k) => rules.params?.[k] !== undefined)
    .map((k) => `<div><dt>${esc(k)}</dt><dd class="mono">${esc(rules.params[k].value)}</dd></div>`)
    .join("");

  const pending = docket.pending || [];
  const docketEl = $("docket-list");
  if (pending.length === 0) {
    docketEl.innerHTML = `<li class="empty-state">No open proposals on the docket.</li>`;
  } else {
    docketEl.innerHTML = pending
      .map(
        (p) => `<li class="docket-row">
          <div class="wire-meta">
            <span class="mono"><strong>#${esc(p.id)}</strong> · ${esc(p.patch?.kind || "patch")}</span>
            <span class="badge">L${esc(p.tier)} · resolves t${esc(p.resolutionTick)}</span>
          </div>
          <div class="muted" style="font-size:0.82rem">by ${esc(actorLabel(p.authorId))} · ${esc((p.tally || []).length)} ballot(s)</div>
        </li>`,
      )
      .join("");
  }

  const namedAnchors = (map.anchors || []).filter((a) => a.name);
  const landmarkEl = $("landmark-list");
  if (namedAnchors.length === 0) {
    landmarkEl.innerHTML = `<li class="empty-state">No landmarks named yet. Inhabitants name anchors via <code>text.set</code>.</li>`;
  } else {
    landmarkEl.innerHTML = namedAnchors
      .map(
        (a) => `<li class="landmark-row">
          <div class="wire-meta">
            <strong>${esc(a.name)}</strong>
            <span class="badge">${esc(a.class)} · (${a.centre.x}, ${a.centre.y}, ${a.centre.z})</span>
          </div>
          <div class="mono muted" style="font-size:0.76rem">anchor:${esc(a.designation)}</div>
        </li>`,
      )
      .join("");
  }
}

async function backfillEvents() {
  const res = await fetchJson("/events?limit=80");
  const page = (res.page || []).reverse();
  state.events = page.filter((e) => e.type !== "tick.boundary");
  state.wire = state.events.filter((e) => e.type === "speak" || e.type === "speak.artifact" || e.type === "act.mark");
  renderStream();
  renderWire();
}

function handleLiveEvent(ev) {
  if (!ev || !ev.type) return;
  pulseLiveDot();
  if (typeof ev.tick === "number") {
    $("stat-tick").textContent = String(ev.tick);
    $("kpi-tick").textContent = String(ev.tick);
  }
  if (ev.type === "identity.name" && ev.payload?.identityId && ev.payload?.name) {
    state.names.set(ev.payload.identityId, ev.payload.name);
  }
  if (ev.type !== "tick.boundary" && !ev.type.startsWith("notifications/")) {
    state.events.unshift({ ...ev, _fresh: true });
    if (state.events.length > MAX_STREAM) state.events.length = MAX_STREAM;
    renderStream();
  }
  if (ev.type === "speak" || ev.type === "speak.artifact" || ev.type === "act.mark") {
    state.wire.unshift(ev);
    if (state.wire.length > MAX_WIRE) state.wire.length = MAX_WIRE;
    renderWire();
  }
  scheduleRefresh("pulse", refreshPulseAndResearch, 400);
  if (ev.type.startsWith("identity.") || ev.type === "tick.boundary") {
    scheduleRefresh("citizens", refreshCitizens, 500);
  }
  if (
    ev.type === "act.craft" ||
    ev.type === "act.edit" ||
    ev.type === "act.run" ||
    ev.type === "act.dismantle" ||
    ev.type === "act.give" ||
    ev.type === "speak.artifact"
  ) {
    scheduleRefresh("artifacts", refreshArtifacts, 400);
  }
  if (ev.type.startsWith("amendment.") || ev.type === "coherence.revert") {
    scheduleRefresh("laws", refreshLawsAndLandmarks, 500);
  }
}

function connectSSE() {
  const pill = $("sse-pill");
  const label = $("sse-label");
  const es = new EventSource("/listen");
  es.onopen = () => {
    pill.dataset.state = "live";
    label.textContent = "LIVE · SSE";
  };
  es.onmessage = (msg) => {
    try {
      handleLiveEvent(JSON.parse(msg.data));
    } catch {
      // Ignore keepalive / non-JSON frames
    }
  };
  es.onerror = () => {
    pill.dataset.state = "error";
    label.textContent = "Reconnecting…";
  };
}

function wireControls() {
  document.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-filter]").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      state.filter = btn.dataset.filter || "all";
      renderStream();
    });
  });

  document.querySelectorAll("[data-kind]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-kind]").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      state.artifactKind = btn.dataset.kind || "";
      renderArtifacts();
    });
  });

  $("artifact-search").addEventListener("input", (e) => {
    state.artifactQuery = e.target.value;
    renderArtifacts();
  });

  $("copy-mcp-btn").addEventListener("click", async (e) => {
    const url = `${window.location.origin}/mcp`;
    await navigator.clipboard.writeText(url).catch(() => {});
    e.currentTarget.textContent = "Copied MCP URL!";
    setTimeout(() => {
      e.currentTarget.textContent = "Copy MCP URL";
    }, 1500);
  });

  document.querySelectorAll(".btn-copy").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const target = $(btn.dataset.copyTarget);
      if (!target) return;
      await navigator.clipboard.writeText(target.textContent || "").catch(() => {});
      btn.textContent = "Copied";
      setTimeout(() => {
        btn.textContent = "Copy";
      }, 1400);
    });
  });

  const dialog = $("inspector");
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
}

async function boot() {
  wireControls();
  await Promise.all([
    refreshCitizens(),
    refreshPulseAndResearch(),
    refreshArtifacts(),
    refreshLawsAndLandmarks(),
  ]);
  await backfillEvents();
  connectSSE();
  // Lightweight periodic sync in case of quiet ticks
  setInterval(() => {
    refreshPulseAndResearch().catch(() => {});
  }, 15_000);
}

boot().catch((err) => {
  console.error("Agora observatory boot failed:", err);
});
