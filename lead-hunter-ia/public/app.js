// ============================================================
// Lead Hunter IA — frontend do painel (vanilla JS)
// Conversa com a API Express em /api/*
// ============================================================

const $ = (sel) => document.querySelector(sel);
const state = { leads: [], filter: "", temp: "todos", priority: "todos", minScore: 0 };

const PRIORITY_LABEL = {
  atacar_hoje: "⚡ Atacar hoje",
  validar_manual: "Validar manual",
  nutrir: "Nutrir",
  descartar: "Descartar",
};
const STATUS_LABEL = {
  novo: "Novo",
  validado: "Validado",
  contatado: "Contatado",
  respondeu: "Respondeu",
  reuniao_marcada: "Reunião marcada",
  sem_interesse: "Sem interesse",
  cliente: "Cliente",
  descartado: "Descartado",
};

// ---------- util ----------
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}
function toast(msg, kind = "") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  setTimeout(() => (t.className = "toast"), 3200);
}
function scoreColor(score) {
  if (score >= 70) return "linear-gradient(90deg,#fb7185,#f43f5e)";
  if (score >= 40) return "linear-gradient(90deg,#fbbf24,#f59e0b)";
  return "linear-gradient(90deg,#60a5fa,#3b82f6)";
}

// ---------- config / provider ----------
async function loadConfig() {
  try {
    const r = await fetch("/api/config").then((x) => x.json());
    const badge = $("#providerBadge");
    if (r.provider === "manual") {
      badge.textContent = "⚠ Modo manual — sem coleta automática";
      badge.className = "badge badge-warn";
    } else if (r.ready) {
      badge.textContent = `✓ ${r.provider} conectado`;
      badge.className = "badge badge-ok";
    } else {
      badge.textContent = `⚠ ${r.provider} sem chave no .env`;
      badge.className = "badge badge-warn";
    }
  } catch {
    $("#providerBadge").textContent = "offline";
  }
}

// ---------- leads ----------
async function loadLeads() {
  const r = await fetch("/api/leads").then((x) => x.json());
  state.leads = r.leads || [];
  render();
}

function render() {
  const filtered = state.leads.filter((l) => {
    if (state.temp !== "todos" && l.temperature !== state.temp) return false;
    if (state.priority !== "todos" && (l.commercialPriority || "") !== state.priority) return false;
    if (state.minScore > 0 && (l.finalScore ?? l.score) < state.minScore) return false;
    if (state.filter) {
      const hay = `${l.companyName} ${l.city} ${l.niche} ${l.email || ""}`.toLowerCase();
      if (!hay.includes(state.filter.toLowerCase())) return false;
    }
    return true;
  });

  // stats (sempre sobre o total, não o filtro)
  $("#statTotal").textContent = state.leads.length;
  $("#statHot").textContent = state.leads.filter((l) => l.temperature === "Quente").length;
  $("#statWarm").textContent = state.leads.filter((l) => l.temperature === "Morno").length;
  $("#statCold").textContent = state.leads.filter((l) => l.temperature === "Frio").length;
  $("#statAttack").textContent = state.leads.filter((l) => l.commercialPriority === "atacar_hoje").length;
  $("#statWhats").textContent = state.leads.filter((l) => l.whatsapp).length;

  const body = $("#leadsBody");
  const empty = $("#emptyState");
  if (filtered.length === 0) {
    body.innerHTML = "";
    empty.classList.remove("hidden");
    empty.textContent = state.leads.length
      ? "Nenhum lead bate com o filtro."
      : "Nenhum lead ainda. Faça uma busca acima para começar a caçar. 🎯";
    return;
  }
  empty.classList.add("hidden");
  body.innerHTML = filtered.map(rowHtml).join("");
}

function rowHtml(l) {
  const wpp = l.whatsapp
    ? `<div class="contact-line wpp">💬 <a href="https://wa.me/${esc(l.whatsapp)}" target="_blank" rel="noopener">${esc(l.whatsapp)}</a></div>`
    : "";
  const tel = l.phone
    ? `<div class="contact-line">📞 <a href="tel:${esc(l.phone)}">${esc(l.phone)}</a></div>`
    : "";
  const mail = l.email
    ? `<div class="contact-line">✉️ <a href="mailto:${esc(l.email)}">${esc(l.email)}</a></div>`
    : "";
  const contact = wpp + tel + mail || '<span class="company-meta">—</span>';

  const social =
    [
      l.instagram ? `<a href="${esc(l.instagram)}" target="_blank" rel="noopener">📸 IG</a>` : "",
      l.linkedin ? `<a href="${esc(l.linkedin)}" target="_blank" rel="noopener">in</a>` : "",
      l.site ? `<a href="${esc(l.site)}" target="_blank" rel="noopener">🌐 site</a>` : "",
    ]
      .filter(Boolean)
      .join("") || '<span class="company-meta">—</span>';

  const score = l.finalScore ?? l.score;
  const prio = l.commercialPriority || "";
  const status = l.commercialStatus || "novo";
  const optOut = l.optOutAt
    ? '<span class="enrich-badge enrich-err">opt-out</span>'
    : "";

  return `<tr>
    <td>
      <div class="company-name">${esc(l.companyName)}</div>
      <div class="company-meta">${esc(l.city)}${l.region ? " · " + esc(l.region) : ""} · ${esc(l.niche)}</div>
    </td>
    <td>${contact}</td>
    <td><div class="social-links">${social}</div></td>
    <td class="score-cell">
      <div class="score-num">${score}</div>
      <div class="score-bar"><div class="score-fill" style="width:${score}%;background:${scoreColor(score)}"></div></div>
      <span class="temp-badge temp-${esc(l.temperature)}">${esc(l.temperature)}</span>
    </td>
    <td><span class="prio-badge prio-${esc(prio)}">${esc(PRIORITY_LABEL[prio] || "—")}</span></td>
    <td><span class="status-badge">${esc(STATUS_LABEL[status] || status)}</span> ${optOut}</td>
    <td><button class="btn-view" data-id="${l.id}">Ver</button></td>
  </tr>`;
}

// ---------- preview de consultas ----------
async function previewQueries() {
  const data = formData();
  if (!data.city || !data.niche) {
    toast("Preencha cidade e nicho.", "err");
    return;
  }
  const box = $("#queriesBox");
  try {
    const r = await fetch("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((x) => x.json());
    box.innerHTML =
      `<strong>${r.queries.length} consultas geradas:</strong>` +
      r.queries.map((q) => `<code>${esc(q)}</code>`).join("");
    box.classList.remove("hidden");
  } catch {
    toast("Falha ao gerar consultas.", "err");
  }
}

// ---------- busca com SSE ----------
function formData() {
  const f = $("#searchForm");
  return {
    city: f.city.value.trim(),
    region: f.region.value.trim(),
    niche: f.niche.value.trim(),
    maxLeads: f.maxLeads.value,
    searchType: f.searchType.value,
  };
}

function runSearch(e) {
  e.preventDefault();
  const data = formData();
  if (!data.city || !data.niche) {
    toast("Preencha cidade e nicho.", "err");
    return;
  }

  const btn = $("#searchBtn");
  btn.disabled = true;
  btn.querySelector(".btn-label").textContent = "Caçando…";

  const prog = $("#progress");
  const feed = $("#liveFeed");
  prog.classList.remove("hidden");
  feed.innerHTML = "";
  setProgress(0, "Iniciando…");

  let found = 0;
  const params = new URLSearchParams(data).toString();
  const es = new EventSource(`/api/search/stream?${params}`);

  es.addEventListener("status", (ev) => {
    const d = JSON.parse(ev.data);
    setProgress(d.progress ?? null, d.message);
  });
  es.addEventListener("urls", (ev) => {
    const d = JSON.parse(ev.data);
    setProgress(d.progress, d.message);
    addFeed(`🔗 ${d.message}`, true);
  });
  es.addEventListener("lead", (ev) => {
    const d = JSON.parse(ev.data);
    found++;
    const l = d.data;
    addFeed(`✅ ${l.companyName} — score ${l.score} (${l.temperature})`);
  });
  es.addEventListener("done", (ev) => {
    const d = JSON.parse(ev.data);
    setProgress(100, `Concluído • ${d.data.stats.leads} novos salvos`);
    es.close();
    finish(btn);
    toast(`Busca concluída: ${found} leads encontrados, ${d.data.stats.leads} novos.`, "ok");
    loadLeads();
    setTimeout(() => prog.classList.add("hidden"), 4000);
  });
  es.addEventListener("error", (ev) => {
    let msg = "Erro na busca (veja o terminal do servidor).";
    try { msg = JSON.parse(ev.data).message || msg; } catch {}
    es.close();
    finish(btn);
    toast(msg, "err");
  });
  // fallback: conexão caiu sem evento 'done'
  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED) {
      finish(btn);
    }
  };
}

function finish(btn) {
  btn.disabled = false;
  btn.querySelector(".btn-label").textContent = "Caçar leads";
}
function setProgress(pct, msg) {
  if (msg != null) $("#progressMsg").textContent = msg;
  if (pct != null) {
    $("#progressBar").style.width = pct + "%";
    $("#progressPct").textContent = Math.round(pct) + "%";
  }
}
function addFeed(text, dim = false) {
  const li = document.createElement("li");
  if (dim) li.className = "dim";
  li.textContent = text;
  $("#liveFeed").prepend(li);
}

// ---------- modal de detalhe do lead (CRM) ----------
let currentLeadId = null;

async function openLeadModal(id) {
  currentLeadId = id;
  const content = $("#modalContent");
  const modal = $("#leadModal");
  if (!content || !modal) return; // HTML antigo em cache: nada a fazer
  content.innerHTML = '<div class="company-meta">Carregando…</div>';
  modal.classList.remove("hidden");
  try {
    const res = await fetch(`/api/leads/${id}`);
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* resposta não-JSON */
    }
    if (!res.ok || !data || !data.lead) {
      const msg =
        (data && data.error) ||
        (res.status === 404
          ? "Lead não encontrado. Reinicie o servidor (npm run web) — a rota pode estar desatualizada."
          : `Falha ao carregar (HTTP ${res.status}).`);
      content.innerHTML = `<div class="company-meta" style="padding:8px 0">⚠ ${esc(msg)}</div>`;
      return;
    }
    renderModal(data);
  } catch (err) {
    content.innerHTML = `<div class="company-meta">⚠ Erro de rede ao carregar o lead.</div>`;
  }
}

function closeModal() {
  $("#leadModal").classList.add("hidden");
  currentLeadId = null;
}

function renderModal(d) {
  const l = d && d.lead;
  if (!l) {
    $("#modalContent").innerHTML = '<div class="company-meta">⚠ Lead sem dados para exibir.</div>';
    return;
  }
  const diag = l.websiteDiagnostic;
  const roi = l.roiEstimate;
  const statusOptions = Object.entries(STATUS_LABEL)
    .map(([v, lbl]) => `<option value="${v}" ${l.commercialStatus === v ? "selected" : ""}>${lbl}</option>`)
    .join("");
  const evid = (d.evidences || [])
    .map((e) => `<li>[${esc(e.scoreType)}] ${esc(e.signal)} <b>(${e.points >= 0 ? "+" : ""}${e.points})</b></li>`)
    .join("");
  const acts = (d.activities || [])
    .map((a) => `<li><span class="company-meta">${esc((a.createdAt || "").slice(0, 16))}</span> ${esc(a.type)} — ${esc(a.description || "")}</li>`)
    .join("") || '<li class="company-meta">Sem atividades ainda.</li>';

  $("#modalContent").innerHTML = `
    <h2 class="modal-title">${esc(l.companyName)}</h2>
    <div class="company-meta">${esc(l.city)}${l.region ? " · " + esc(l.region) : ""} · ${esc(l.niche)}</div>

    <div class="modal-scores">
      <span title="Fit Comercial">Fit ${l.fitScore ?? "-"}</span>
      <span title="Urgência Digital">Urgência ${l.urgencyScore ?? "-"}</span>
      <span title="Acesso Comercial">Acesso ${l.accessScore ?? "-"}</span>
      <span class="score-num">Final ${l.finalScore ?? l.score}</span>
      <span class="temp-badge temp-${esc(l.temperature)}">${esc(l.temperature)}</span>
      <span class="prio-badge prio-${esc(l.commercialPriority || "")}">${esc(PRIORITY_LABEL[l.commercialPriority] || "—")}</span>
    </div>

    <div class="modal-grid">
      <div>
        <h3>Contatos</h3>
        <div>${l.whatsapp ? `💬 <a href="https://wa.me/${esc(l.whatsapp)}" target="_blank">${esc(l.whatsapp)}</a><br>` : ""}
        ${l.phone ? `📞 ${esc(l.phone)}<br>` : ""}
        ${l.email ? `✉️ ${esc(l.email)}<br>` : ""}
        ${l.site ? `🌐 <a href="${esc(l.site)}" target="_blank">${esc(l.site)}</a>` : ""}</div>
        <div class="company-meta" style="margin-top:8px">Confiança do dado: ${l.dataConfidence ?? "-"} · Base legal: ${esc(l.legalBasis || "-")}</div>
      </div>
      <div>
        <h3>Diagnóstico</h3>
        <div>${esc(diag?.summary || "—")}</div>
        <ul class="modal-list">${(diag?.findings || []).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
      </div>
    </div>

    <h3>Gancho comercial</h3>
    <div class="modal-box">${esc(l.commercialHook || "—")}</div>

    <h3>Mensagem de abordagem</h3>
    <div class="modal-box" style="white-space:pre-wrap">${esc(l.outreachMessage || "—")}</div>
    ${l.outreachMessage ? `<button class="btn-ghost btn-copy" data-copy="${esc(l.outreachMessage)}">Copiar mensagem</button>` : ""}

    <h3>Estimativa de ROI</h3>
    <div class="modal-box">${esc(roi?.narrative || "—")}<div class="company-meta">${esc(roi?.disclaimer || "")}</div></div>

    <h3>Evidências do score</h3>
    <ul class="modal-list">${evid || '<li class="company-meta">—</li>'}</ul>

    <h3>Histórico (CRM)</h3>
    <ul class="modal-list">${acts}</ul>

    <div class="modal-actions">
      <label>Status:
        <select id="modalStatus" class="filter-input">${statusOptions}</select>
      </label>
      <button class="btn btn-primary" id="modalSaveStatus">Salvar status</button>
      <button class="btn-enrich ghost" id="modalOptOut">Registrar opt-out</button>
    </div>
  `;

  $("#modalStatus")?.addEventListener("change", () => {});
  $("#modalSaveStatus")?.addEventListener("click", () => changeStatus(l.id, $("#modalStatus").value));
  $("#modalOptOut")?.addEventListener("click", () => optOutLead(l.id));
  $("#modalContent")
    .querySelector(".btn-copy")
    ?.addEventListener("click", (e) => {
      navigator.clipboard?.writeText(e.target.dataset.copy).then(() => toast("Mensagem copiada.", "ok"));
    });
}

async function changeStatus(id, status) {
  try {
    const r = await fetch(`/api/leads/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await r.json();
    if (!r.ok) return toast(data.error || "Falha ao salvar.", "err");
    patchLead(data.lead);
    toast("Status atualizado.", "ok");
  } catch {
    toast("Erro de rede.", "err");
  }
}

async function optOutLead(id) {
  try {
    const r = await fetch(`/api/leads/${id}/opt-out`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "solicitado via painel" }),
    });
    const data = await r.json();
    if (!r.ok) return toast(data.error || "Falha.", "err");
    patchLead(data.lead);
    toast("Opt-out registrado.", "ok");
    closeModal();
  } catch {
    toast("Erro de rede.", "err");
  }
}

function patchLead(updated) {
  if (!updated) return;
  const idx = state.leads.findIndex((x) => x.id === updated.id);
  if (idx >= 0) state.leads[idx] = { ...state.leads[idx], ...updated };
  render();
}

// ---------- export ----------
function exportLeads(format) {
  if (state.leads.length === 0) {
    toast("Nada para exportar ainda.", "err");
    return;
  }
  window.location.href = `/api/export/${format}`;
  toast(`Gerando arquivo ${format.toUpperCase()}…`, "ok");
}

// ---------- eventos ----------
// `on` é tolerante: se o elemento não existir (ex.: HTML antigo em cache),
// apenas ignora — assim uma fiação nunca derruba as demais (inclusive o "Ver").
function on(sel, event, handler) {
  const el = $(sel);
  if (el) el.addEventListener(event, handler);
}

on("#searchForm", "submit", runSearch);
on("#previewBtn", "click", previewQueries);
on("#filterInput", "input", (e) => {
  state.filter = e.target.value;
  render();
});
document.querySelectorAll(".chip").forEach((chip) =>
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach((c) => c.classList.remove("chip-active"));
    chip.classList.add("chip-active");
    state.temp = chip.dataset.temp;
    render();
  }),
);
document.querySelectorAll(".btn-export").forEach((b) =>
  b.addEventListener("click", () => exportLeads(b.dataset.format)),
);
on("#priorityFilter", "change", (e) => {
  state.priority = e.target.value;
  render();
});
on("#minScore", "input", (e) => {
  state.minScore = Number(e.target.value) || 0;
  render();
});
// Delegação: o botão "Ver" é recriado a cada render, então ouvimos no tbody.
on("#leadsBody", "click", (e) => {
  const btn = e.target.closest(".btn-view");
  if (!btn) return;
  const id = Number(btn.dataset.id);
  if (Number.isInteger(id)) openLeadModal(id);
});
on("#modalClose", "click", closeModal);
on("#leadModal", "click", (e) => {
  if (e.target.id === "leadModal") closeModal();
});
// Fecha o modal com ESC.
on("body", "keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

// ---------- init ----------
loadConfig();
loadLeads();
