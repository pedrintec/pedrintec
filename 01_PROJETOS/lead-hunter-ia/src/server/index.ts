import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import express from "express";
import { z } from "zod";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { runPipeline } from "../pipeline.js";
import { buildDorks } from "../search/dorks.js";
import {
  addLeadNote,
  addLeadTask,
  createLeadManual,
  deleteLead,
  deleteLeadTask,
  getAllLeads,
  getAllLeadRecords,
  getAllLeadTasks,
  getLeadById,
  getLeadActivities,
  getLeadsBySearch,
  getLeadsPage,
  getScoreEvidences,
  getSettings,
  listSearches,
  markLeadContact,
  registerOptOut,
  saveResearchReport,
  setSdrStatus,
  setSettings,
  toggleLeadTask,
  updateLeadCrm,
  updateLeadStatus,
  type LeadsPageFilters,
} from "../database/repository.js";
import { generateResearchReport, type ResearchReport } from "../prospecting/researcher.js";
import { assessReply, buildSdrSequence, localDateInDays } from "../prospecting/sdr.js";
import { aiEnabled } from "../integrations/claudeClient.js";
import { exportCsv, exportJson, exportXlsx } from "../exporters/index.js";
import type { CommercialStatus, SearchInput } from "../types/index.js";

const COMMERCIAL_STATUSES: CommercialStatus[] = [
  "novo",
  "validado",
  "contatado",
  "respondeu",
  "reuniao_marcada",
  "sem_interesse",
  "cliente",
  "descartado",
];

// Backend do painel web local. Reaproveita 100% do pipeline já testado.
// Serve o frontend estático em /public e expõe uma API JSON + SSE.

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, "../../public");

const app = express();
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

const searchSchema = z.object({
  city: z.string().min(1, "Cidade é obrigatória"),
  region: z.string().default(config.DEFAULT_COUNTRY),
  niche: z.string().min(1, "Nicho é obrigatório"),
  maxLeads: z.coerce.number().int().positive().max(200).default(20),
  searchType: z.enum(["completa", "rapida", "somente-sites"]).default("completa"),
});

/** Configuração atual (provedor + se está pronto para coleta automática). */
app.get("/api/config", (_req, res) => {
  const provider = config.SEARCH_PROVIDER;
  const ready =
    provider === "serpapi"
      ? Boolean(config.SERPAPI_KEY)
      : provider === "google_cse"
        ? Boolean(config.GOOGLE_CSE_KEY && config.GOOGLE_CSE_CX)
        : false;
  res.json({ provider, ready, defaultCountry: config.DEFAULT_COUNTRY, ai: aiEnabled() });
});

/** Pré-visualização das consultas (dorks) sem gastar API. */
app.post("/api/preview", (req, res) => {
  const parsed = searchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  res.json({ queries: buildDorks(parsed.data as SearchInput) });
});

/**
 * Lista leads.
 * - Sem query string: retorna a BASE INTEIRA (compat: Dashboard/Funil/Stats usam isso).
 * - Com query (?page=&perPage=&search=&niche=&city=&temp=&stage=&sort=&dateRange=):
 *   retorna paginação server-side { leads, total, page, perPage, pages, filters }.
 */
app.get("/api/leads", (req, res) => {
  const hasQuery = Object.keys(req.query).length > 0;
  if (!hasQuery) {
    res.json({ leads: getAllLeadRecords() });
    return;
  }
  const page = Number(req.query.page ?? 1);
  const perPage = Number(req.query.perPage ?? 10);
  const dateRange = String(req.query.dateRange ?? "todos") as LeadsPageFilters["dateRange"];
  const sort = String(req.query.sort ?? "created") as LeadsPageFilters["sort"];
  const filters: LeadsPageFilters = {
    search: req.query.search ? String(req.query.search) : undefined,
    niche: req.query.niche ? String(req.query.niche) : undefined,
    city: req.query.city ? String(req.query.city) : undefined,
    temp: req.query.temp ? String(req.query.temp) : undefined,
    stage: req.query.stage ? String(req.query.stage) : undefined,
    dateRange,
    sort,
  };
  res.json(getLeadsPage(page, perPage, filters));
});

/** Base inteira (para Dashboard/Funil/Stats — explicito, sem ambiguidade). */
app.get("/api/leads/all", (_req, res) => {
  res.json({ leads: getAllLeadRecords() });
});

/** Detalhe de um lead: dados + atividades (CRM) + evidências de score. */
app.get("/api/leads/:id", (req, res) => {
  const id = Number(req.params.id);
  const lead = Number.isInteger(id) ? getLeadById(id) : undefined;
  if (!lead) {
    res.status(404).json({ error: `Lead #${req.params.id} não encontrado.` });
    return;
  }
  res.json({ lead, activities: getLeadActivities(id), evidences: getScoreEvidences(id) });
});

/** Altera o status comercial (mini-CRM). */
app.post("/api/leads/:id/status", (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status ?? "") as CommercialStatus;
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }
  if (!COMMERCIAL_STATUSES.includes(status)) {
    res.status(400).json({ error: `Status inválido. Use: ${COMMERCIAL_STATUSES.join(", ")}` });
    return;
  }
  const lead = updateLeadStatus(id, status);
  if (!lead) {
    res.status(404).json({ error: `Lead #${id} não encontrado.` });
    return;
  }
  res.json({ lead });
});

/** Registra opt-out de um lead (LGPD). */
app.post("/api/leads/:id/opt-out", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }
  const lead = registerOptOut(id, req.body?.contactValue, req.body?.reason);
  if (!lead) {
    res.status(404).json({ error: `Lead #${id} não encontrado.` });
    return;
  }
  res.json({ lead });
});

/** Atualiza a etapa do funil / valor / responsável (persistência do CRM). */
app.post("/api/leads/:id/stage", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }
  const lead = updateLeadCrm(id, {
    stage: typeof req.body?.stage === "string" ? req.body.stage : undefined,
    dealValue: Number.isFinite(req.body?.dealValue) ? Number(req.body.dealValue) : undefined,
    owner: typeof req.body?.owner === "string" ? req.body.owner : undefined,
  });
  if (!lead) {
    res.status(404).json({ error: `Lead #${id} não encontrado.` });
    return;
  }
  res.json({ lead });
});

/** Adiciona uma nota ao histórico do lead. */
app.post("/api/leads/:id/notes", (req, res) => {
  const id = Number(req.params.id);
  const text = String(req.body?.text ?? "").trim();
  if (!Number.isInteger(id) || !text) {
    res.status(400).json({ error: "Informe um id válido e o texto da nota." });
    return;
  }
  if (!getLeadById(id)) {
    res.status(404).json({ error: `Lead #${id} não encontrado.` });
    return;
  }
  const note = addLeadNote(id, text, req.body?.author);
  res.json({ note });
});

/** Cria uma tarefa/follow-up para o lead. */
app.post("/api/leads/:id/tasks", (req, res) => {
  const id = Number(req.params.id);
  const text = String(req.body?.text ?? "").trim();
  if (!Number.isInteger(id) || !text) {
    res.status(400).json({ error: "Informe um id válido e a descrição da tarefa." });
    return;
  }
  if (!getLeadById(id)) {
    res.status(404).json({ error: `Lead #${id} não encontrado.` });
    return;
  }
  const task = addLeadTask(id, text, req.body?.due);
  res.json({ task });
});

/** Marca/desmarca uma tarefa como concluída. */
app.post("/api/tasks/:taskId/toggle", (req, res) => {
  const taskId = Number(req.params.taskId);
  if (!Number.isInteger(taskId)) {
    res.status(400).json({ error: "ID de tarefa inválido." });
    return;
  }
  const task = toggleLeadTask(taskId, typeof req.body?.done === "boolean" ? req.body.done : undefined);
  if (!task) {
    res.status(404).json({ error: `Tarefa #${taskId} não encontrada.` });
    return;
  }
  res.json({ task });
});

/** Lista todas as tarefas (aba Tarefas). */
app.get("/api/tasks", (_req, res) => {
  res.json({ tasks: getAllLeadTasks() });
});

/** Histórico de buscas. */
app.get("/api/searches", (_req, res) => {
  res.json({ searches: listSearches() });
});

/**
 * Executa a busca com progresso ao vivo (Server-Sent Events).
 * O frontend abre um EventSource e recebe eventos: status/lead/done/error.
 */
app.get("/api/search/stream", async (req, res) => {
  const parsed = searchSchema.safeParse({
    city: req.query.city,
    region: req.query.region,
    niche: req.query.niche,
    maxLeads: req.query.maxLeads,
    searchType: req.query.searchType,
  });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  if (!parsed.success) {
    send("error", { message: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
    res.end();
    return;
  }

  try {
    await runPipeline(parsed.data as SearchInput, (e) => {
      send(e.type, e);
    });
  } catch (err) {
    logger.error(err);
    send("error", { message: (err as Error).message });
  } finally {
    res.end();
  }
});

/** Exporta leads para download. ?scope=all (padrão) ou ?searchId=N */
app.get("/api/export/:format", async (req, res) => {
  const format = req.params.format;
  const searchId = req.query.searchId ? Number(req.query.searchId) : null;
  const leads = searchId ? getLeadsBySearch(searchId) : getAllLeads();

  if (leads.length === 0) {
    res.status(404).json({ error: "Nenhum lead para exportar" });
    return;
  }

  try {
    let file: string;
    if (format === "csv") file = exportCsv(leads);
    else if (format === "json") file = exportJson(leads);
    else if (format === "xlsx") file = await exportXlsx(leads);
    else {
      res.status(400).json({ error: "Formato inválido (use csv, json ou xlsx)" });
      return;
    }
    res.download(file);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** Cria um lead manualmente (sem passar pelo pipeline de prospecção). */
app.post("/api/leads", (req, res) => {
  const b = req.body || {};
  const companyName = String(b.companyName ?? b.name ?? "").trim();
  if (!companyName) {
    res.status(400).json({ error: "Informe o nome da empresa (companyName)." });
    return;
  }
  // Aceita aliases comuns do frontend Gravity (name, uf, value).
  const lead = createLeadManual({
    companyName,
    niche: b.niche,
    city: b.city,
    region: b.region ?? b.uf,
    phone: b.phone,
    whatsapp: b.whatsapp,
    email: b.email,
    instagram: b.instagram,
    linkedin: b.linkedin,
    site: b.site,
    stage: b.stage,
    dealValue: Number.isFinite(b.dealValue) ? Number(b.dealValue) : Number.isFinite(b.value) ? Number(b.value) : undefined,
    owner: b.owner,
    nextAction: b.nextAction,
    score: Number.isFinite(b.score) ? Number(b.score) : undefined,
  });
  res.json({ lead });
});

/** Exclui um lead. */
app.delete("/api/leads/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }
  if (!deleteLead(id)) {
    res.status(404).json({ error: `Lead #${id} não encontrado.` });
    return;
  }
  res.json({ ok: true });
});

// ---------------------------------------------------------------------
// Pipeline Pesquisador / SDR IA
// ---------------------------------------------------------------------

/** Nome da agência configurado (fallback: Gravity). */
function agencyName(): string {
  const s = getSettings() as Record<string, unknown>;
  return typeof s.agencyName === "string" && s.agencyName.trim() ? s.agencyName.trim() : "Gravity";
}

/** PESQUISADOR: gera (ou regenera com {force:true}) o relatório empresarial do lead. */
app.post("/api/leads/:id/research", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }
  const lead = getLeadById(id);
  if (!lead) {
    res.status(404).json({ error: `Lead #${id} não encontrado.` });
    return;
  }
  if (lead.researchReport && !req.body?.force) {
    res.json({ report: lead.researchReport, cached: true, lead });
    return;
  }
  const report = await generateResearchReport(lead);
  saveResearchReport(id, report);
  res.json({ report, cached: false, lead: getLeadById(id) });
});

/** SDR IA: inicia a cadência (abordagem + tarefas D0/D+2/D+5) e move p/ Qualificado. */
app.post("/api/leads/:id/sdr/start", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }
  const lead = getLeadById(id);
  if (!lead) {
    res.status(404).json({ error: `Lead #${id} não encontrado.` });
    return;
  }
  if (lead.optOutAt) {
    res.status(403).json({ error: "Lead registrou opt-out — prospecção bloqueada (LGPD)." });
    return;
  }
  // Garante o relatório do Pesquisador antes da abordagem (é a alma do SDR).
  let report = lead.researchReport as ResearchReport | null;
  if (!report) {
    report = await generateResearchReport(lead);
    saveResearchReport(id, report);
  }
  const seq = await buildSdrSequence(lead, report, agencyName());
  for (const t of seq.tasks) addLeadTask(id, t.text, t.due, t.priority);
  updateLeadCrm(
    id,
    { stage: "Qualificado", nextAction: "SDR D0 — enviar abordagem inicial via WhatsApp" },
    { skipAutoTask: true }, // a cadência D0/D+2/D+5 substitui a auto-tarefa da etapa
  );
  setSdrStatus(id, "ativo");
  addLeadNote(id, "SDR IA iniciado: cadência D0/D+2/D+5 criada", "Sistema");
  res.json({ message: seq.message, tasks: seq.tasks, lead: getLeadById(id) });
});

/** SDR IA: registra a resposta do lead, classifica e aplica a próxima ação. */
app.post("/api/leads/:id/sdr/reply", async (req, res) => {
  const id = Number(req.params.id);
  const text = String(req.body?.text ?? "").trim();
  if (!Number.isInteger(id) || !text) {
    res.status(400).json({ error: "Informe um id válido e o texto da resposta." });
    return;
  }
  const lead = getLeadById(id);
  if (!lead) {
    res.status(404).json({ error: `Lead #${id} não encontrado.` });
    return;
  }
  const result = await assessReply(lead, lead.researchReport as ResearchReport | null, text);

  addLeadNote(id, `Resposta do lead: "${text}"`, "Lead");
  if (result.nova_etapa && result.nova_etapa !== lead.stage) {
    // Mudança de etapa usa o fluxo normal (auto-tarefa + webhook do §2.2/§6c).
    updateLeadCrm(id, { stage: result.nova_etapa });
  }
  if (result.followup_em_dias) {
    addLeadTask(id, `SDR — retomar contato: ${lead.companyName}`, localDateInDays(result.followup_em_dias), "Média");
  }
  const status =
    result.classificacao === "interessado"
      ? "qualificado"
      : result.classificacao === "sem_interesse"
        ? "encerrado"
        : "aguardando_resposta";
  setSdrStatus(id, status);
  addLeadNote(id, `SDR classificou a resposta como: ${result.classificacao}`, "Sistema");
  res.json({ result, lead: getLeadById(id) });
});

/** Marca "último contato" do lead (botão "Marcar contato"). */
app.post("/api/leads/:id/contact", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }
  const lead = markLeadContact(id);
  if (!lead) {
    res.status(404).json({ error: `Lead #${id} não encontrado.` });
    return;
  }
  res.json({ lead });
});

/** Exclui uma tarefa. */
app.delete("/api/tasks/:taskId", (req, res) => {
  const taskId = Number(req.params.taskId);
  if (!Number.isInteger(taskId)) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }
  if (!deleteLeadTask(taskId)) {
    res.status(404).json({ error: `Tarefa #${taskId} não encontrada.` });
    return;
  }
  res.json({ ok: true });
});

/** Lê configurações da aplicação (defaults aplicados se ainda não houver). */
app.get("/api/settings", (_req, res) => {
  res.json({ settings: getSettings() });
});

/** Atualiza configurações (patch parcial). */
app.put("/api/settings", (req, res) => {
  const out = setSettings(req.body || {});
  res.json({ settings: out });
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  logger.success(`🌐 Painel rodando em http://localhost:${PORT}`);
  logger.info(`   Provedor: ${config.SEARCH_PROVIDER}`);
});
