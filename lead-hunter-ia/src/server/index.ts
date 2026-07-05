import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import express from "express";
import { z } from "zod";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { runPipeline } from "../pipeline.js";
import { buildDorks } from "../search/dorks.js";
import { listActiveProviders } from "../search/index.js";
import {
  addLeadNote,
  addLeadTask,
  createScrapingJob,
  createSearch,
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
  reanalyzeLeadPain,
  saveLeads,
  saveResearchReport,
  setSdrStatus,
  setSettings,
  toggleLeadTask,
  updateScrapingJob,
  updateLeadCrm,
  updateLeadStatus,
  type LeadsPageFilters,
} from "../database/repository.js";
import { generateResearchReport, type ResearchReport } from "../prospecting/researcher.js";
import { assessReply, buildSdrSequence, localDateInDays } from "../prospecting/sdr.js";
import { aiEnabled } from "../integrations/claudeClient.js";
import {
  analyzeLead,
  generateMessage,
  generateSearchQueries,
  summarizeDay,
  openaiEnabled,
  type AnalyzeLeadInput,
} from "../ai/commercialAi.js";
import {
  getLatestLeadAiAnalysis,
  getDailyReport,
  saveDailyReport,
  topRecommendedOffers,
} from "../database/aiRepository.js";
import { priorityFromScore } from "../ai/schemas.js";
import { exportCsv, exportJson, exportXlsx } from "../exporters/index.js";
import type { CommercialStatus, SearchInput } from "../types/index.js";
import { runLocalScraper } from "../services/scraping/scraperEngine.js";
import { localLeadToLead } from "../services/scraping/localHuntMapper.js";
import { resolveLocalHuntUrls } from "../services/scraping/searchResolver.js";
import type { LocalHuntMode, LocalLeadCandidate } from "../services/scraping/types.js";

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

function csvCell(value: unknown): string {
  const text = Array.isArray(value) ? value.join(" | ") : value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function buildPainCsv(leads: ReturnType<typeof getAllLeadRecords>): string {
  const columns = [
    "nome da empresa",
    "nicho",
    "cidade",
    "site",
    "Instagram",
    "WhatsApp",
    "fonte",
    "score geral",
    "nível da dor",
    "principal dor",
    "dores detectadas",
    "serviço recomendado",
    "oportunidade comercial",
    "mensagem personalizada",
    "próximos passos sugeridos",
    "data da análise",
  ];
  const rows = leads.map((lead) => {
    const d = lead.painDiagnostic;
    return [
      lead.companyName,
      lead.niche,
      lead.city,
      lead.site,
      lead.instagram,
      lead.whatsapp,
      lead.sourceProvider || lead.sourceUrl,
      d?.pain_score,
      d?.pain_level,
      d?.main_pain,
      d?.detected_pains,
      d?.recommended_service,
      d?.gravity_opportunity,
      d?.prospecting_message,
      d?.next_steps,
      d?.analyzed_at,
    ]
      .map(csvCell)
      .join(";");
  });
  return `\uFEFF${columns.map(csvCell).join(";")}\n${rows.join("\n")}`;
}

function buildLocalHuntCsv(leads: ReturnType<typeof getAllLeadRecords>): string {
  const columns = [
    "nome da empresa",
    "nicho",
    "cidade",
    "site",
    "Instagram",
    "WhatsApp",
    "e-mail",
    "responsavel publico",
    "cargo publico",
    "score",
    "temperatura",
    "sinais de dor",
    "mensagem",
    "fonte",
    "data",
  ];
  const rows = leads
    .filter((lead) => lead.sourceProvider === "local_hunt")
    .map((lead) =>
      [
        lead.companyName,
        lead.niche,
        lead.city,
        lead.site,
        lead.instagram,
        lead.whatsapp,
        lead.email,
        lead.publicContactName,
        lead.publicContactRole,
        lead.score,
        lead.temperature,
        lead.painSignals?.map((signal) => signal.type),
        lead.outreachMessage,
        lead.sourceUrl,
        lead.collectedAt,
      ]
        .map(csvCell)
        .join(";"),
    );
  return `\uFEFF${columns.map(csvCell).join(";")}\n${rows.join("\n")}`;
}

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

const localHuntQuerySchema = z.object({
  mode: z.enum(["calm", "advanced", "fast"]).default("advanced"),
  city: z.string().default(""),
  region: z.string().default(""),
  niche: z.string().default(""),
  keyword: z.string().default(""),
  urls: z.string().default(""),
  focus: z.enum(["contacts", "owners", "conversion", "ads"]).default("contacts"),
  maxUrls: z.coerce.number().int().positive().max(80).default(20),
});

const localHuntSaveSchema = z.object({
  leads: z.array(z.unknown()).min(1),
  city: z.string().optional(),
  region: z.string().optional(),
  niche: z.string().optional(),
  keyword: z.string().optional(),
  jobId: z.number().int().nullable().optional(),
});


/** Configuração atual (provedor + se está pronto para coleta automática). */
app.get("/api/config", (_req, res) => {
  const provider = config.SEARCH_PROVIDER;
  const activeProviders = listActiveProviders();
  const ready =
    provider === "multi" || provider === "duckduckgo"
      ? activeProviders.length > 0 || provider === "duckduckgo" // DDG não precisa de chave
      : provider === "serpapi"
        ? Boolean(config.SERPAPI_KEY)
        : provider === "serper" || provider === "serper_places"
          ? Boolean(config.SERPER_API_KEY)
          : provider === "exa"
            ? Boolean(config.EXA_API_KEY)
            : provider === "google_cse"
              ? Boolean(config.GOOGLE_CSE_KEY && config.GOOGLE_CSE_CX)
              : false;
  res.json({
    provider,
    ready,
    activeProviders,
    defaultCountry: config.DEFAULT_COUNTRY,
    ai: aiEnabled(),
    aiCommercial: openaiEnabled(),
    aiModel: openaiEnabled() ? config.OPENAI_MODEL : null,
  });
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

/** Reanalisa o diagnóstico comercial de dor do lead. */
app.post("/api/leads/:id/pain/reanalyze", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }
  const lead = reanalyzeLeadPain(id);
  if (!lead) {
    res.status(404).json({ error: `Lead #${id} não encontrado.` });
    return;
  }
  res.json({ lead, diagnostic: lead.painDiagnostic });
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

/**
 * Caca Inteligente Local com progresso ao vivo.
 * Analisa URLs manuais ou descobre sites publicos via DuckDuckGo HTML.
 */
app.get("/api/local-hunt/stream", async (req, res) => {
  const parsed = localHuntQuerySchema.safeParse({
    mode: req.query.mode,
    city: req.query.city,
    region: req.query.region,
    niche: req.query.niche,
    keyword: req.query.keyword,
    urls: req.query.urls,
    focus: req.query.focus,
    maxUrls: req.query.maxUrls,
  });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    if (res.writableEnded) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  if (!parsed.success) {
    send("error", { message: "Dados invalidos", details: parsed.error.flatten().fieldErrors });
    res.end();
    return;
  }

  const controller = new AbortController();
  req.on("close", () => controller.abort());

  let jobId: number | undefined;
  try {
    const data = parsed.data;
    send("status", { type: "status", message: "Preparando URLs para a caca local", progress: 0 });
    const { urls, query, warnings, providerResults } = await resolveLocalHuntUrls({
      urlsText: data.urls,
      niche: data.niche,
      city: data.city,
      region: data.region,
      keyword: data.keyword,
      focus: data.focus,
      maxUrls: data.maxUrls,
    });
    jobId = createScrapingJob({
      mode: data.mode,
      city: data.city,
      region: data.region,
      niche: data.niche,
      keyword: data.keyword || query,
      totalUrls: urls.length,
    });

    for (const warning of warnings) {
      send("hunt-warning", {
        type: "status",
        message: warning,
        progress: 3,
        data: { jobId, providerResults },
      });
    }

    send("status", {
      type: "status",
      message: urls.length ? `${urls.length} sites na fila de analise` : "Nenhum site encontrado para analisar",
      progress: 5,
      data: { jobId, total: urls.length, query, providerResults },
    });

    if (urls.length === 0) {
      updateScrapingJob(jobId, { status: "finished", finishedAt: new Date().toISOString() });
      send("done", { type: "done", message: "Nenhuma URL valida encontrada", progress: 100, data: { leads: [], analyzed: 0, failed: 0, jobId } });
      res.end();
      return;
    }

    let leadCount = 0;
    let failedCount = 0;
    const result = await runLocalScraper({
      urls,
      mode: data.mode as LocalHuntMode,
      niche: data.niche,
      city: data.city,
      region: data.region,
      keyword: data.keyword || query,
      signal: controller.signal,
      onEvent: (event) => {
        if (event.type === "lead") leadCount += 1;
        if (event.type === "error") failedCount += 1;
        send(event.type === "error" ? "hunt-error" : event.type, {
          ...event,
          data: event.type === "done" ? { ...(event.data as object), jobId } : event.data,
          jobId,
        });
      },
    });

    updateScrapingJob(jobId, {
      status: "finished",
      analyzedUrls: result.analyzed,
      failedUrls: result.failed,
      savedLeads: 0,
      finishedAt: new Date().toISOString(),
    });
    logger.info(`Caca local #${jobId}: ${leadCount} leads, ${failedCount} falhas.`);
  } catch (err) {
    logger.error(err);
    if (jobId) {
      updateScrapingJob(jobId, {
        status: "failed",
        finishedAt: new Date().toISOString(),
      });
    }
    send("error", { message: (err as Error).message, jobId });
  } finally {
    if (!res.writableEnded) res.end();
  }
});

/** Salva no CRM os leads encontrados pela Caca Inteligente Local. */
app.post("/api/local-hunt/save", (req, res) => {
  const parsed = localHuntSaveSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ error: "Envie ao menos um lead para salvar.", details: parsed.error.flatten().fieldErrors });
    return;
  }

  const localLeads = parsed.data.leads as LocalLeadCandidate[];
  const first = localLeads[0];
  const input: SearchInput = {
    city: parsed.data.city ?? first?.city ?? "",
    region: parsed.data.region ?? first?.region ?? "",
    niche: parsed.data.niche ?? first?.niche ?? "",
    maxLeads: localLeads.length,
    searchType: "completa",
  };
  const searchId = createSearch(input, "local_hunt");
  const leads = localLeads.map((lead) => localLeadToLead(lead, "local_hunt"));
  const saved = saveLeads(searchId, leads);
  if (parsed.data.jobId) {
    updateScrapingJob(parsed.data.jobId, {
      savedLeads: saved.length,
      status: "saved",
      finishedAt: new Date().toISOString(),
    });
  }
  res.json({ searchId, saved: saved.length, received: leads.length, leads: saved });
});

/** Exporta os leads da Caca Inteligente Local em CSV. */
app.get("/api/local-hunt/export.csv", (_req, res) => {
  const leads = getAllLeadRecords().filter((lead) => lead.sourceProvider === "local_hunt");
  if (leads.length === 0) {
    res.status(404).json({ error: "Nenhum lead da caca local para exportar" });
    return;
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="caca-inteligente-local.csv"');
  res.send(buildLocalHuntCsv(leads));
});

/** Exporta o Analisador Inteligente de Dor em CSV. */
app.get("/api/pain/export.csv", (_req, res) => {
  const leads = getAllLeadRecords();
  if (leads.length === 0) {
    res.status(404).json({ error: "Nenhum lead para exportar" });
    return;
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="diagnostico-dor-leads.csv"');
  res.send(buildPainCsv(leads));
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

// ====================================================================
// IA COMERCIAL — o "cérebro comercial" (OpenAI, server-side apenas).
// Toda IA passa pelo backend. Sem OPENAI_API_KEY → fallback amigável.
// Nunca há envio automático: mensagens são rascunhos p/ aprovação humana.
// ====================================================================

type LeadRec = ReturnType<typeof getAllLeadRecords>[number];

function leadToAiInput(lead: LeadRec): AnalyzeLeadInput {
  return {
    lead_id: lead.id,
    company_name: lead.companyName,
    website: lead.site || undefined,
    instagram: lead.instagram || undefined,
    city: lead.city || undefined,
    niche: lead.niche || undefined,
    phone: lead.phone || lead.whatsapp || undefined,
    email: lead.email || undefined,
    source: lead.sourceProvider || lead.sourceUrl || undefined,
  };
}

/** Retorna a data (YYYY-MM-DD) local de um ISO, ou "" se inválida. */
function isoDay(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function withinRange(iso: string | null | undefined, range: string): boolean {
  if (range === "all") return true;
  const day = isoDay(iso);
  if (!day) return false;
  const now = Date.now();
  const t = new Date(day).getTime();
  const days = range === "today" ? 1 : range === "7d" ? 7 : range === "30d" ? 30 : 3650;
  return now - t <= days * 24 * 3600 * 1000;
}
function countBy(list: LeadRec[], key: (l: LeadRec) => string, limit: number) {
  const map = new Map<string, number>();
  for (const l of list) {
    const k = (key(l) || "não identificado").trim();
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}
function slimLead(l: LeadRec) {
  return {
    id: l.id,
    company_name: l.companyName,
    niche: l.niche,
    city: l.city,
    uf: l.region,
    score: l.score,
    temperature: l.temperature,
  };
}

const analyzeLeadSchema = z.object({
  lead_id: z.coerce.number().int().optional(),
  company_name: z.string().optional(),
  website: z.string().optional(),
  instagram: z.string().optional(),
  city: z.string().optional(),
  niche: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  source: z.string().optional(),
  force: z.coerce.boolean().optional().default(false),
});

/** Análise individual de lead (com cache por input_hash). */
app.post("/api/ai/analyze-lead", async (req, res) => {
  const parsed = analyzeLeadSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  const b = parsed.data;
  let input: AnalyzeLeadInput;
  if (b.lead_id != null) {
    const lead = getLeadById(b.lead_id);
    if (!lead) {
      res.status(404).json({ error: `Lead #${b.lead_id} não encontrado.` });
      return;
    }
    input = leadToAiInput(lead);
  } else {
    if (!b.company_name || !b.company_name.trim()) {
      res.status(400).json({ error: "company_name é obrigatório quando não há lead_id." });
      return;
    }
    input = {
      company_name: b.company_name,
      website: b.website,
      instagram: b.instagram,
      city: b.city,
      niche: b.niche,
      phone: b.phone,
      email: b.email,
      source: b.source,
    };
  }
  const r = await analyzeLead(input, b.force);
  if (!r.enabled) {
    res.json({ enabled: false, error: r.error });
    return;
  }
  res.json({
    enabled: true,
    ok: r.ok,
    cached: r.cached,
    analysis_id: r.analysis_id,
    ...(r.analysis ?? {}),
    error: r.error,
  });
});

const genMsgSchema = z.object({
  lead_id: z.coerce.number().int(),
  channel: z.enum(["whatsapp", "email"]).default("whatsapp"),
  tone: z.enum(["consultivo", "direto", "amigavel", "premium"]).default("consultivo"),
  offer: z.string().optional(),
  force: z.coerce.boolean().optional().default(false),
});

/** Gera RASCUNHO de mensagem (WhatsApp/e-mail) — nunca envia. */
app.post("/api/ai/generate-message", async (req, res) => {
  const parsed = genMsgSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  const lead = getLeadById(parsed.data.lead_id);
  if (!lead) {
    res.status(404).json({ error: `Lead #${parsed.data.lead_id} não encontrado.` });
    return;
  }
  const r = await generateMessage({
    leadId: lead.id,
    lead: leadToAiInput(lead),
    channel: parsed.data.channel,
    tone: parsed.data.tone,
    offer: parsed.data.offer,
  });
  if (!r.enabled) {
    res.json({ enabled: false, error: r.error, requires_human_approval: true });
    return;
  }
  res.json({
    enabled: true,
    ok: r.ok,
    channel: r.channel,
    message: r.message,
    subject: r.subject,
    lead_id: lead.id,
    based_on_analysis_id: r.based_on_analysis_id,
    requires_human_approval: true,
    error: r.error,
  });
});

const dashSchema = z.object({
  date_range: z.enum(["today", "7d", "30d", "all"]).default("all"),
  city: z.string().optional(),
  niche: z.string().optional(),
});

/** Dashboard inteligente: estatísticas pelo banco + interpretação da IA. */
app.post("/api/ai/generate-dashboard", async (req, res) => {
  const parsed = dashSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  const { date_range, city, niche } = parsed.data;
  const all = getAllLeadRecords();
  const filtered = all.filter(
    (l) =>
      withinRange(l.collectedAt, date_range) &&
      (!city || (l.city || "").toLowerCase().includes(city.toLowerCase())) &&
      (!niche || (l.niche || "").toLowerCase().includes(niche.toLowerCase())),
  );
  const total = filtered.length;
  const hot = filtered.filter((l) => l.temperature === "Quente" || l.score >= 85).length;
  const avg = total ? Math.round(filtered.reduce((s, l) => s + (l.score || 0), 0) / total) : 0;
  const top = filtered.slice().sort((a, b) => b.score - a.score).slice(0, 10).map(slimLead);

  const stats = {
    total_leads: total,
    hot_leads: hot,
    average_score: avg,
    leads_by_niche: countBy(filtered, (l) => l.niche, 8),
    leads_by_city: countBy(filtered, (l) => l.city, 8),
    most_recommended_offers: topRecommendedOffers(6),
    best_opportunities: top,
    top_10_leads_today: top,
  };

  // A IA só interpreta o agregado (não recebe a base inteira).
  let executive_summary = "";
  let daily_recommendations: string[] = [];
  if (openaiEnabled() && total > 0) {
    const s = await summarizeDay(
      {
        total_leads: total,
        hot_leads: hot,
        average_score: avg,
        leads_by_niche: stats.leads_by_niche,
        leads_by_city: stats.leads_by_city,
        most_recommended_offers: stats.most_recommended_offers,
      },
      "dashboard",
      "/api/ai/generate-dashboard",
    );
    if (s.ok && s.summary) {
      executive_summary = s.summary.executive_summary;
      daily_recommendations = s.summary.recommended_next_steps;
    }
  }

  res.json({ enabled: openaiEnabled(), ...stats, executive_summary, daily_recommendations });
});

const reportSchema = z.object({
  date: z.string().optional(),
  force: z.coerce.boolean().optional().default(false),
});

function mapReportRow(row: NonNullable<ReturnType<typeof getDailyReport>>) {
  const j = (s: string | null) => {
    try {
      return JSON.parse(s || "[]");
    } catch {
      return [];
    }
  };
  return {
    report_date: row.report_date,
    total_found: row.total_found,
    best_niches: j(row.best_niches),
    top_10_leads: j(row.top_leads),
    main_pain_points: j(row.main_pain_points),
    commercial_opportunities: j(row.commercial_opportunities),
    recommended_next_steps: j(row.recommended_next_steps),
    executive_summary: row.executive_summary || "",
  };
}

/** Relatório diário/noturno (salvo em ai_daily_reports; cache por data). */
app.post("/api/ai/daily-report", async (req, res) => {
  const parsed = reportSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  const reportDate = parsed.data.date || todayStr();
  const existing = getDailyReport(reportDate);
  if (existing && !parsed.data.force) {
    res.json({ enabled: true, cached: true, ...mapReportRow(existing) });
    return;
  }
  const all = getAllLeadRecords();
  const dayLeads = all.filter((l) => isoDay(l.collectedAt) === reportDate);
  const totalFound = dayLeads.length;
  const top10 = dayLeads.slice().sort((a, b) => b.score - a.score).slice(0, 10).map(slimLead);

  if (!openaiEnabled()) {
    res.json({
      enabled: false,
      error: "Recursos de IA desativados. Configure OPENAI_API_KEY para habilitar.",
      report_date: reportDate,
      total_found: totalFound,
      top_10_leads: top10,
      best_niches: countBy(dayLeads, (l) => l.niche, 6),
    });
    return;
  }

  const s = await summarizeDay(
    {
      report_date: reportDate,
      total_found: totalFound,
      leads_by_niche: countBy(dayLeads, (l) => l.niche, 6),
      leads_by_city: countBy(dayLeads, (l) => l.city, 6),
      top_leads: top10,
      recommended_offers: topRecommendedOffers(6),
    },
    "daily_report",
    "/api/ai/daily-report",
  );
  const summary = s.summary;
  saveDailyReport({
    reportDate,
    totalFound,
    bestNiches: summary?.best_niches ?? countBy(dayLeads, (l) => l.niche, 6).map((x) => x.name),
    topLeads: top10,
    mainPainPoints: summary?.main_pain_points ?? [],
    commercialOpportunities: summary?.commercial_opportunities ?? [],
    recommendedNextSteps: summary?.recommended_next_steps ?? [],
    executiveSummary: summary?.executive_summary ?? "",
    rawResponse: s.raw,
    model: s.model,
    status: s.ok ? "success" : "error",
    errorMessage: s.error ?? null,
  });
  res.json({
    enabled: true,
    ok: s.ok,
    cached: false,
    report_date: reportDate,
    total_found: totalFound,
    top_10_leads: top10,
    best_niches: summary?.best_niches ?? [],
    main_pain_points: summary?.main_pain_points ?? [],
    commercial_opportunities: summary?.commercial_opportunities ?? [],
    recommended_next_steps: summary?.recommended_next_steps ?? [],
    executive_summary: summary?.executive_summary ?? "",
    error: s.error,
  });
});

const queriesSchema = z.object({
  niche: z.string().default(""),
  city: z.string().default(""),
  client_type: z.string().optional(),
});

/** Caçador IA: gera buscas públicas (Google dorks). */
app.post("/api/ai/generate-search-queries", async (req, res) => {
  const parsed = queriesSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  const r = await generateSearchQueries(parsed.data.niche, parsed.data.city, parsed.data.client_type);
  res.json(r);
});

const batchSchema = z.object({
  lead_ids: z.array(z.coerce.number().int()).min(1),
  force: z.coerce.boolean().optional().default(false),
});

/** Análise em lote (limite AI_BATCH_MAX; uma falha não derruba o lote). */
app.post("/api/ai/analyze-leads-batch", async (req, res) => {
  const parsed = batchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  if (!openaiEnabled()) {
    res.json({ enabled: false, error: "Recursos de IA desativados. Configure OPENAI_API_KEY para habilitar." });
    return;
  }
  const ids = parsed.data.lead_ids.slice(0, config.AI_BATCH_MAX);
  const results: Array<{ lead_id: number; status: string; analysis?: unknown; error?: string }> = [];
  let processed = 0;
  let skipped = 0;
  let failed = 0;
  for (const id of ids) {
    const lead = getLeadById(id);
    if (!lead) {
      failed++;
      results.push({ lead_id: id, status: "error", error: "lead não encontrado" });
      continue;
    }
    try {
      const r = await analyzeLead(leadToAiInput(lead), parsed.data.force);
      if (r.cached) {
        skipped++;
        results.push({ lead_id: id, status: "skipped", analysis: r.analysis });
      } else if (r.ok) {
        processed++;
        results.push({ lead_id: id, status: "success", analysis: r.analysis });
      } else {
        failed++;
        results.push({ lead_id: id, status: "error", error: r.error });
      }
    } catch (e) {
      failed++;
      results.push({ lead_id: id, status: "error", error: (e as Error).message });
    }
  }
  res.json({ enabled: true, processed, skipped, failed, limit: config.AI_BATCH_MAX, results });
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  logger.success(`🌐 Painel rodando em http://localhost:${PORT}`);
  logger.info(`   Provedor: ${config.SEARCH_PROVIDER}`);
  logger.info(`   IA Comercial: ${openaiEnabled() ? `ativa (${config.OPENAI_MODEL})` : "desativada (sem OPENAI_API_KEY)"}`);
});
