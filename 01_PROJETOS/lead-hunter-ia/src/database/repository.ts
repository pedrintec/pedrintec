import { desc, eq, inArray } from "drizzle-orm";
import { db, schema, sqlite } from "./client.js";
import type { CommercialStatus, Lead, ScoreEvidence, SearchInput } from "../types/index.js";
import { rootDomain } from "../utils/text.js";
import {
  normalizeCompanyName,
  normalizeDomain,
  normalizeEmail,
  normalizeInstagram,
  normalizePhone,
} from "../normalization/index.js";
import { leadsAreDuplicate } from "../normalization/dedup.js";
import { logger } from "../utils/logger.js";
import { fireStageChangeWebhook } from "../integrations/n8nWebhook.js";

// Camada de acesso a dados + lógica de deduplicação.

export function createSearch(input: SearchInput, provider: string): number {
  const res = db
    .insert(schema.searches)
    .values({
      city: input.city,
      region: input.region,
      niche: input.niche,
      maxLeads: input.maxLeads,
      searchType: input.searchType,
      provider,
    })
    .run();
  return Number(res.lastInsertRowid);
}

export function recordSource(
  searchId: number,
  url: string,
  query: string,
  status: string,
  notes = "",
): void {
  db.insert(schema.sources).values({ searchId, url, query, status, notes }).run();
}

export function recordExecution(
  searchId: number,
  data: {
    totalQueries: number;
    totalUrls: number;
    totalLeads: number;
    durationMs: number;
    startedAt: string;
    finishedAt: string;
  },
): void {
  db.insert(schema.executionHistory).values({ searchId, ...data }).run();
}

// Deduplicação pura vive em ../normalization/dedup (testável sem banco).
export { dedupeLeads } from "../normalization/dedup.js";

/** Persiste evidências de score numa tabela própria (auditável). */
function persistEvidences(leadId: number, evidences?: ScoreEvidence[]): void {
  if (!evidences?.length) return;
  for (const ev of evidences) {
    db.insert(schema.scoreEvidences)
      .values({
        leadId,
        scoreType: ev.scoreType,
        signal: ev.signal,
        points: ev.points,
        evidence: ev.evidence ?? null,
        sourceUrl: ev.sourceUrl ?? null,
      })
      .run();
  }
}

/** Persiste leads, evitando duplicados contra o que já está no banco. */
export function saveLeads(searchId: number, leads: Lead[]): Lead[] {
  const existingRows = db.select().from(schema.leads).all();
  const now = new Date().toISOString();

  const saved: Lead[] = [];
  for (const lead of leads) {
    // Procura linha duplicada (com id) para mesclar em vez de duplicar.
    const dupRow = existingRows.find((r) => leadsAreDuplicate(lead, rowToLead(r)));
    if (dupRow) {
      db.update(schema.leads)
        .set({ lastSeenAt: now, lastCheckedAt: now })
        .where(eq(schema.leads.id, dupRow.id))
        .run();
      logger.debug(`Já existe no banco (atualizado lastSeenAt): ${lead.companyName}`);
      continue;
    }

    const res = db
      .insert(schema.leads)
      .values({
        searchId,
        companyName: lead.companyName,
        site: lead.site,
        domain: normalizeDomain(lead.site || "") ?? (lead.site ? rootDomain(lead.site) : null),
        city: lead.city,
        region: lead.region,
        niche: lead.niche,
        phone: lead.phone,
        whatsapp: lead.whatsapp,
        email: lead.email,
        instagram: lead.instagram,
        linkedin: lead.linkedin,
        address: lead.address,
        sourceUrl: lead.sourceUrl,
        evidence: lead.evidence,
        opportunities: JSON.stringify(lead.opportunities),
        score: lead.score,
        temperature: lead.temperature,
        // --- novos campos (prospecção consultiva) ---
        normalizedCompanyName: normalizeCompanyName(lead.companyName) || null,
        rootDomain: normalizeDomain(lead.site || ""),
        country: lead.country ?? null,
        normalizedPhone: lead.phone ? normalizePhone(lead.phone) : null,
        normalizedWhatsapp: lead.whatsapp ? normalizePhone(lead.whatsapp) : null,
        normalizedEmail: lead.email ? normalizeEmail(lead.email) : null,
        normalizedInstagram: lead.instagram ? normalizeInstagram(lead.instagram) : null,
        sourceProvider: lead.sourceProvider ?? null,
        sourceQuery: lead.sourceQuery ?? null,
        dataOrigin: lead.dataOrigin ?? null,
        legalBasis: lead.legalBasis ?? null,
        dataConfidence: lead.dataConfidence ?? null,
        commercialStatus: lead.commercialStatus ?? "novo",
        fitScore: lead.fitScore ?? null,
        urgencyScore: lead.urgencyScore ?? null,
        accessScore: lead.accessScore ?? null,
        finalScore: lead.finalScore ?? lead.score,
        commercialPriority: lead.commercialPriority ?? null,
        scoreEvidences: lead.scoreEvidences ? JSON.stringify(lead.scoreEvidences) : null,
        websiteDiagnostic: lead.websiteDiagnostic ? JSON.stringify(lead.websiteDiagnostic) : null,
        commercialHook: lead.commercialHook ?? null,
        outreachMessage: lead.outreachMessage ?? null,
        roiEstimate: lead.roiEstimate ? JSON.stringify(lead.roiEstimate) : null,
        firstSeenAt: lead.firstSeenAt ?? now,
        lastSeenAt: lead.lastSeenAt ?? now,
        lastCheckedAt: lead.lastCheckedAt ?? now,
      })
      .run();

    const newId = Number(res.lastInsertRowid);
    persistEvidences(newId, lead.scoreEvidences);
    // Mantém a lista em memória atualizada para deduplicar dentro do mesmo lote.
    const insertedRow = db.select().from(schema.leads).where(eq(schema.leads.id, newId)).get();
    if (insertedRow) existingRows.push(insertedRow);
    saved.push(lead);
  }
  return saved;
}

function parseJson<T>(s: string | null | undefined): T | undefined {
  if (!s) return undefined;
  try {
    return JSON.parse(s) as T;
  } catch {
    return undefined;
  }
}

function rowToLead(r: typeof schema.leads.$inferSelect): Lead {
  return {
    companyName: r.companyName,
    site: r.site ?? "",
    city: r.city ?? "",
    region: r.region ?? "",
    niche: r.niche ?? "",
    phone: r.phone ?? undefined,
    whatsapp: r.whatsapp ?? undefined,
    email: r.email ?? undefined,
    instagram: r.instagram ?? undefined,
    linkedin: r.linkedin ?? undefined,
    address: r.address ?? undefined,
    sourceUrl: r.sourceUrl ?? "",
    evidence: r.evidence ?? "",
    opportunities: r.opportunities ? JSON.parse(r.opportunities) : [],
    score: r.score,
    temperature: r.temperature as Lead["temperature"],
    collectedAt: r.collectedAt,
    // --- novos campos ---
    normalizedCompanyName: r.normalizedCompanyName ?? undefined,
    rootDomain: r.rootDomain ?? undefined,
    country: r.country ?? undefined,
    normalizedPhone: r.normalizedPhone ?? undefined,
    normalizedWhatsapp: r.normalizedWhatsapp ?? undefined,
    normalizedEmail: r.normalizedEmail ?? undefined,
    normalizedInstagram: r.normalizedInstagram ?? undefined,
    sourceProvider: r.sourceProvider ?? undefined,
    sourceQuery: r.sourceQuery ?? undefined,
    dataOrigin: r.dataOrigin ?? undefined,
    legalBasis: (r.legalBasis as Lead["legalBasis"]) ?? undefined,
    dataConfidence: r.dataConfidence ?? undefined,
    commercialStatus: (r.commercialStatus as CommercialStatus) ?? undefined,
    fitScore: r.fitScore ?? undefined,
    urgencyScore: r.urgencyScore ?? undefined,
    accessScore: r.accessScore ?? undefined,
    finalScore: r.finalScore ?? undefined,
    commercialPriority: (r.commercialPriority as Lead["commercialPriority"]) ?? undefined,
    scoreEvidences: parseJson<ScoreEvidence[]>(r.scoreEvidences),
    websiteDiagnostic: parseJson<Lead["websiteDiagnostic"]>(r.websiteDiagnostic),
    commercialHook: r.commercialHook ?? undefined,
    outreachMessage: r.outreachMessage ?? undefined,
    roiEstimate: parseJson<Lead["roiEstimate"]>(r.roiEstimate),
    firstSeenAt: r.firstSeenAt ?? undefined,
    lastSeenAt: r.lastSeenAt ?? undefined,
    lastCheckedAt: r.lastCheckedAt ?? undefined,
    optOutAt: r.optOutAt ?? undefined,
  };
}

export function getLeadsBySearch(searchId: number): Lead[] {
  return db
    .select()
    .from(schema.leads)
    .where(eq(schema.leads.searchId, searchId))
    .all()
    .map(rowToLead);
}

/** Todos os leads salvos, do maior para o menor score. */
export function getAllLeads(): Lead[] {
  return db.select().from(schema.leads).orderBy(desc(schema.leads.score)).all().map(rowToLead);
}

/** Nota (do histórico) no formato esperado pelo painel. */
export interface CrmNote {
  id: number;
  text: string;
  author: string;
  date: string;
}
/** Tarefa/follow-up no formato esperado pelo painel. */
export interface CrmTask {
  id: number;
  text: string;
  due: string | null;
  priority: string;
  done: boolean;
}

/** Lead com id + camada de CRM (etapa/valor/responsável/notas/tarefas). */
export type LeadRecord = Lead & {
  id: number;
  stage: string;
  dealValue: number | null;
  owner: string | null;
  nextAction: string | null;
  lastContactAt: string | null;
  notes: CrmNote[];
  tasks: CrmTask[];
};

function buildRecord(
  r: typeof schema.leads.$inferSelect,
  notes: CrmNote[],
  tasks: CrmTask[],
): LeadRecord {
  return {
    ...rowToLead(r),
    id: r.id,
    stage: r.stage ?? "Novo",
    dealValue: r.dealValue ?? null,
    owner: r.owner ?? null,
    nextAction: r.nextAction ?? null,
    lastContactAt: r.lastContactAt ?? null,
    notes,
    tasks,
  };
}

function rowToNote(a: typeof schema.leadActivities.$inferSelect): CrmNote {
  let author = "Comercial";
  const meta = parseJson<{ author?: string }>(a.metadata);
  if (meta?.author) author = meta.author;
  return { id: a.id, text: a.description ?? "", author, date: a.createdAt };
}
function rowToTask(t: typeof schema.leadTasks.$inferSelect): CrmTask {
  return { id: t.id, text: t.text, due: t.due ?? null, priority: t.priority ?? "Média", done: t.done === 1 };
}

/** Todos os leads com id + CRM, ordenados pelo score final. */
export function getAllLeadRecords(): LeadRecord[] {
  const rows = db.select().from(schema.leads).orderBy(desc(schema.leads.score)).all();
  // Batch-load notas (atividades type 'note') e tarefas, agrupando por lead.
  const notesByLead = new Map<number, CrmNote[]>();
  for (const a of db
    .select()
    .from(schema.leadActivities)
    .where(inArray(schema.leadActivities.type, ["note", "stage_change"]))
    .all()) {
    if (a.leadId == null) continue;
    (notesByLead.get(a.leadId) ?? notesByLead.set(a.leadId, []).get(a.leadId)!).push(rowToNote(a));
  }
  const tasksByLead = new Map<number, CrmTask[]>();
  for (const t of db.select().from(schema.leadTasks).all()) {
    if (t.leadId == null) continue;
    (tasksByLead.get(t.leadId) ?? tasksByLead.set(t.leadId, []).get(t.leadId)!).push(rowToTask(t));
  }
  return rows.map((r) => buildRecord(r, notesByLead.get(r.id) ?? [], tasksByLead.get(r.id) ?? []));
}

// ---------------------------------------------------------------------
// Paginação server-side (tela de Leads)
// ---------------------------------------------------------------------

/** Filtros aceitos pela tela de Leads. */
export interface LeadsPageFilters {
  search?: string; // texto livre (empresa, cidade, nicho, site, telefone)
  niche?: string;
  city?: string;
  temp?: string; // Quente | Morno | Frio
  stage?: string;
  /** Atalho de data: hoje | ontem | last7 | thisMonth | todos */
  dateRange?: "hoje" | "ontem" | "last7" | "thisMonth" | "todos";
  /** Ordenação: created (default, mais recentes) | score | value | last */
  sort?: "created" | "score" | "value" | "last";
}

export interface LeadsPageResult {
  leads: LeadRecord[];
  total: number;
  page: number;
  perPage: number;
  pages: number;
  filters: { niches: string[]; cities: string[] };
}

/** Calcula o ISO mínimo (inclusive) para o atalho de data. */
function dateLowerBound(range?: LeadsPageFilters["dateRange"]): string | null {
  if (!range || range === "todos") return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === "hoje") return d.toISOString();
  if (range === "ontem") {
    d.setDate(d.getDate() - 1);
    return d.toISOString();
  }
  if (range === "last7") {
    d.setDate(d.getDate() - 7);
    return d.toISOString();
  }
  if (range === "thisMonth") {
    d.setDate(1);
    return d.toISOString();
  }
  return null;
}

/** Calcula o ISO máximo (exclusive) para "ontem" (só esse range tem teto). */
function dateUpperBound(range?: LeadsPageFilters["dateRange"]): string | null {
  if (range !== "ontem") return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Coluna de ordenação aceita (whitelist para evitar injeção). */
const SORT_COLUMNS: Record<NonNullable<LeadsPageFilters["sort"]>, string> = {
  created: "collected_at",
  score: "score",
  value: "deal_value",
  last: "last_contact_at",
};

/**
 * Lista paginada de leads com filtros aplicados NO BANCO (LIMIT/OFFSET).
 * - Ordenação padrão: collected_at DESC (mais recentes primeiro).
 * - perPage clampado em [1, 100]; page em [1, ∞).
 * - Devolve também o total de páginas e listas distintas (nichos/cidades) p/ os selects.
 */
export function getLeadsPage(
  page: number = 1,
  perPage: number = 10,
  filters: LeadsPageFilters = {},
): LeadsPageResult {
  const limit = Math.max(1, Math.min(100, Math.floor(perPage)));
  const safePage = Math.max(1, Math.floor(page));

  // --- WHERE dinâmico ---
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.search && filters.search.trim()) {
    const q = `%${filters.search.trim().toLowerCase()}%`;
    where.push(
      "(lower(company_name) LIKE ? OR lower(coalesce(city,'')) LIKE ? OR lower(coalesce(niche,'')) LIKE ? OR lower(coalesce(site,'')) LIKE ? OR lower(coalesce(phone,'')) LIKE ? OR lower(coalesce(whatsapp,'')) LIKE ?)",
    );
    params.push(q, q, q, q, q, q);
  }
  if (filters.niche) {
    where.push("niche = ?");
    params.push(filters.niche);
  }
  if (filters.city) {
    where.push("city = ?");
    params.push(filters.city);
  }
  if (filters.temp) {
    where.push("temperature = ?");
    params.push(filters.temp);
  }
  if (filters.stage) {
    where.push("stage = ?");
    params.push(filters.stage);
  }
  const lo = dateLowerBound(filters.dateRange);
  const hi = dateUpperBound(filters.dateRange);
  if (lo) {
    where.push("collected_at >= ?");
    params.push(lo);
  }
  if (hi) {
    where.push("collected_at < ?");
    params.push(hi);
  }

  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  const sortCol = SORT_COLUMNS[filters.sort ?? "created"] ?? "collected_at";
  // Tie-break por id desc para resultado estável quando os valores são iguais.
  const orderSql = `ORDER BY ${sortCol} DESC, id DESC`;

  // --- COUNT total (para calcular pages) ---
  const countStmt = sqlite.prepare(`SELECT COUNT(*) as c FROM leads ${whereSql}`);
  const total = (countStmt.get(...params) as { c: number }).c;
  const pages = Math.max(1, Math.ceil(total / limit));
  const effectivePage = Math.min(safePage, pages);
  const offset = (effectivePage - 1) * limit;

  // --- Página atual ---
  const rowsStmt = sqlite.prepare(
    `SELECT * FROM leads ${whereSql} ${orderSql} LIMIT ? OFFSET ?`,
  );
  const rows = rowsStmt.all(...params, limit, offset) as Array<
    typeof schema.leads.$inferSelect
  >;

  // Batch-load notas + tarefas só dos leads desta página (super leve).
  const ids = rows.map((r) => r.id);
  const notesByLead = new Map<number, CrmNote[]>();
  const tasksByLead = new Map<number, CrmTask[]>();
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    const notes = sqlite
      .prepare(
        `SELECT * FROM lead_activities WHERE type IN ('note','stage_change') AND lead_id IN (${placeholders})`,
      )
      .all(...ids) as Array<typeof schema.leadActivities.$inferSelect>;
    for (const a of notes) {
      if (a.leadId == null) continue;
      (notesByLead.get(a.leadId) ?? notesByLead.set(a.leadId, []).get(a.leadId)!).push(rowToNote(a));
    }
    const tasks = sqlite
      .prepare(`SELECT * FROM lead_tasks WHERE lead_id IN (${placeholders})`)
      .all(...ids) as Array<typeof schema.leadTasks.$inferSelect>;
    for (const t of tasks) {
      if (t.leadId == null) continue;
      (tasksByLead.get(t.leadId) ?? tasksByLead.set(t.leadId, []).get(t.leadId)!).push(
        rowToTask(t),
      );
    }
  }

  const leads = rows.map((r) =>
    buildRecord(r, notesByLead.get(r.id) ?? [], tasksByLead.get(r.id) ?? []),
  );

  return {
    leads,
    total,
    page: effectivePage,
    perPage: limit,
    pages,
    filters: getLeadFilterOptions(),
  };
}

/** Listas distintas para popular os selects de nicho/cidade. */
export function getLeadFilterOptions(): { niches: string[]; cities: string[] } {
  const niches = (
    sqlite
      .prepare("SELECT DISTINCT niche FROM leads WHERE niche IS NOT NULL AND niche != '' ORDER BY niche")
      .all() as Array<{ niche: string }>
  ).map((r) => r.niche);
  const cities = (
    sqlite
      .prepare("SELECT DISTINCT city FROM leads WHERE city IS NOT NULL AND city != '' ORDER BY city")
      .all() as Array<{ city: string }>
  ).map((r) => r.city);
  return { niches, cities };
}

/** Busca um lead pelo id (com notas e tarefas). */
export function getLeadById(id: number): LeadRecord | undefined {
  const r = db.select().from(schema.leads).where(eq(schema.leads.id, id)).get();
  if (!r) return undefined;
  const notes = db
    .select()
    .from(schema.leadActivities)
    .where(eq(schema.leadActivities.leadId, id))
    .all()
    .filter((a) => a.type === "note" || a.type === "stage_change")
    .map(rowToNote);
  const tasks = db.select().from(schema.leadTasks).where(eq(schema.leadTasks.leadId, id)).all().map(rowToTask);
  return buildRecord(r, notes, tasks);
}

// ---------------------------------------------------------------------
// CRM: etapa do funil, valor, responsável, notas e tarefas (persistência)
// ---------------------------------------------------------------------

export interface CrmUpdate {
  stage?: string;
  dealValue?: number | null;
  owner?: string | null;
  commercialStatus?: CommercialStatus;
  nextAction?: string | null;
}

/** Atualiza campos de funil/CRM e registra atividade. */
/** Etapas que registram "último contato" ao serem atingidas (§2.2). */
const CONTACT_STAGES = new Set(["Em contato", "Reunião", "Proposta"]);

/** Tarefas automáticas criadas ao mover o lead para certas etapas (§2.2). */
const STAGE_AUTO_TASK: Record<
  string,
  { text: (name: string) => string; dueDays: number; priority: string }
> = {
  Qualificado: { text: (n) => `Fazer primeiro contato: ${n}`, dueDays: 1, priority: "Alta" },
  "Em contato": { text: (n) => `Follow-up em 24h: ${n}`, dueDays: 1, priority: "Alta" },
  Reunião: { text: (n) => `Confirmar reunião: ${n}`, dueDays: 1, priority: "Alta" },
  Proposta: { text: (n) => `Acompanhar proposta: ${n}`, dueDays: 3, priority: "Média" },
};

/** Data (YYYY-MM-DD) daqui a N dias, no formato usado por lead_tasks.due. */
function dueInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  // Data LOCAL (não UTC): com toISOString(), à noite (UTC-3) o prazo pularia um dia.
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function updateLeadCrm(leadId: number, data: CrmUpdate): LeadRecord | undefined {
  // Estado atual: detecta transição de etapa e alimenta tarefa/histórico/webhook.
  const current = db.select().from(schema.leads).where(eq(schema.leads.id, leadId)).get();
  if (!current) return undefined; // sem lead: nada de task/atividade/webhook fantasma
  const oldStage = current.stage ?? "Novo";
  const stageChanged = data.stage !== undefined && data.stage !== oldStage;

  const now = new Date().toISOString();
  const set: Record<string, unknown> = { lastCheckedAt: now };
  if (data.stage !== undefined) set.stage = data.stage;
  if (data.dealValue !== undefined) set.dealValue = data.dealValue;
  if (data.owner !== undefined) set.owner = data.owner;
  if (data.commercialStatus !== undefined) set.commercialStatus = data.commercialStatus;
  if (data.nextAction !== undefined) set.nextAction = data.nextAction;
  // Ao entrar numa etapa de relacionamento, marca o último contato (§2.2).
  if (stageChanged && data.stage && CONTACT_STAGES.has(data.stage)) set.lastContactAt = now;

  db.update(schema.leads).set(set).where(eq(schema.leads.id, leadId)).run();

  if (stageChanged && data.stage) {
    // Histórico imutável: "Movido de X para Y" (§2.2).
    addLeadActivity(leadId, "stage_change", `Movido de ${oldStage} para ${data.stage}`, { author: "Sistema" });

    // Tarefa automática por etapa de destino (§2.2).
    const rule = STAGE_AUTO_TASK[data.stage];
    if (rule) {
      const name = current?.companyName ?? "lead";
      addLeadTask(leadId, rule.text(name), dueInDays(rule.dueDays), rule.priority);
    }

    // WEBHOOK — dispara n8n na mudança de etapa (§6c), se N8N_WEBHOOK_URL existir.
    fireStageChangeWebhook({
      lead_id: leadId,
      name: current?.companyName ?? "",
      old_stage: oldStage,
      new_stage: data.stage,
      score: current?.finalScore ?? current?.score ?? 0,
      temp: current?.temperature ?? "Frio",
      at: now,
    });
  }

  return getLeadById(leadId);
}

/** Marca o "último contato" do lead (botão "Marcar contato" da UI). */
export function markLeadContact(leadId: number): LeadRecord | undefined {
  const now = new Date().toISOString();
  db.update(schema.leads).set({ lastContactAt: now, lastCheckedAt: now }).where(eq(schema.leads.id, leadId)).run();
  addLeadActivity(leadId, "note", "Contato registrado");
  return getLeadById(leadId);
}

/** Adiciona uma nota ao histórico do lead. */
export function addLeadNote(leadId: number, text: string, author = "Comercial"): CrmNote | undefined {
  const res = db
    .insert(schema.leadActivities)
    .values({ leadId, type: "note", description: text, metadata: JSON.stringify({ author }) })
    .run();
  const row = db
    .select()
    .from(schema.leadActivities)
    .where(eq(schema.leadActivities.id, Number(res.lastInsertRowid)))
    .get();
  return row ? rowToNote(row) : undefined;
}

/** Cria uma tarefa/follow-up para o lead. */
export function addLeadTask(
  leadId: number,
  text: string,
  due?: string | null,
  priority: string = "Média",
): CrmTask | undefined {
  const res = db
    .insert(schema.leadTasks)
    .values({ leadId, text, due: due ?? null, priority, done: 0 })
    .run();
  const row = db
    .select()
    .from(schema.leadTasks)
    .where(eq(schema.leadTasks.id, Number(res.lastInsertRowid)))
    .get();
  return row ? rowToTask(row) : undefined;
}

/** Exclui uma tarefa. */
export function deleteLeadTask(taskId: number): boolean {
  const res = db.delete(schema.leadTasks).where(eq(schema.leadTasks.id, taskId)).run();
  return res.changes > 0;
}

/** Alterna o status (done) de uma tarefa. */
export function toggleLeadTask(taskId: number, done?: boolean): CrmTask | undefined {
  const row = db.select().from(schema.leadTasks).where(eq(schema.leadTasks.id, taskId)).get();
  if (!row) return undefined;
  const next = done === undefined ? row.done !== 1 : done;
  db.update(schema.leadTasks).set({ done: next ? 1 : 0 }).where(eq(schema.leadTasks.id, taskId)).run();
  return { ...rowToTask(row), done: next };
}

/** Todas as tarefas (para a aba Tarefas), com o nome da empresa do lead. */
export function getAllLeadTasks(): Array<CrmTask & { leadId: number; empresa: string }> {
  const tasks = db.select().from(schema.leadTasks).all();
  // 1 query para os nomes das empresas (evita N+1: 1 SELECT por tarefa).
  const names = new Map(
    db
      .select({ id: schema.leads.id, name: schema.leads.companyName })
      .from(schema.leads)
      .all()
      .map((l) => [l.id, l.name]),
  );
  return tasks.map((t) => ({
    ...rowToTask(t),
    leadId: t.leadId ?? 0,
    empresa: (t.leadId != null ? names.get(t.leadId) : "") ?? "",
  }));
}

// ---------------------------------------------------------------------
// Mini-CRM: status comercial + histórico de atividades
// ---------------------------------------------------------------------

/** Atualiza o status comercial do lead e registra a atividade. */
export function updateLeadStatus(leadId: number, status: CommercialStatus): LeadRecord | undefined {
  db.update(schema.leads)
    .set({ commercialStatus: status, lastCheckedAt: new Date().toISOString() })
    .where(eq(schema.leads.id, leadId))
    .run();
  addLeadActivity(leadId, "status_change", `Status alterado para: ${status}`);
  return getLeadById(leadId);
}

/** Registra uma atividade no histórico do lead (mini-CRM). */
export function addLeadActivity(
  leadId: number,
  type: string,
  description = "",
  metadata?: Record<string, unknown>,
): void {
  db.insert(schema.leadActivities)
    .values({ leadId, type, description, metadata: metadata ? JSON.stringify(metadata) : null })
    .run();
}

/** Lista o histórico de atividades de um lead (mais recentes primeiro). */
export function getLeadActivities(leadId: number) {
  return db
    .select()
    .from(schema.leadActivities)
    .where(eq(schema.leadActivities.leadId, leadId))
    .orderBy(desc(schema.leadActivities.id))
    .all();
}

/** Lista as evidências de score de um lead. */
export function getScoreEvidences(leadId: number) {
  return db
    .select()
    .from(schema.scoreEvidences)
    .where(eq(schema.scoreEvidences.leadId, leadId))
    .all();
}

// ---------------------------------------------------------------------
// Conformidade: opt-out (LGPD)
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// Conformidade: scrape logs + cache de robots.txt
// ---------------------------------------------------------------------

/** Registra um log de scraping (rastreabilidade). */
export function recordScrapeLog(entry: {
  url: string;
  domain: string;
  statusCode?: number;
  success: boolean;
  errorMessage?: string;
  robotsAllowed?: boolean;
  durationMs?: number;
  requestedAt?: string;
}): void {
  db.insert(schema.scrapeLogs)
    .values({
      url: entry.url,
      domain: entry.domain,
      statusCode: entry.statusCode ?? null,
      success: entry.success ? 1 : 0,
      errorMessage: entry.errorMessage ?? null,
      robotsAllowed: entry.robotsAllowed == null ? null : entry.robotsAllowed ? 1 : 0,
      durationMs: entry.durationMs ?? null,
      requestedAt: entry.requestedAt ?? new Date().toISOString(),
    })
    .run();
}

/** Lê o cache de robots.txt de um domínio (se ainda válido). */
export function getRobotsCache(
  domain: string,
): { allowed: boolean; crawlDelayMs: number | null } | undefined {
  const row = db.select().from(schema.robotsCache).where(eq(schema.robotsCache.domain, domain)).get();
  if (!row || !row.expiresAt) return undefined;
  if (new Date(row.expiresAt).getTime() < Date.now()) return undefined; // expirado
  return { allowed: row.allowed === 1, crawlDelayMs: row.crawlDelayMs ?? null };
}

/** Grava/atualiza o cache de robots.txt de um domínio. */
export function setRobotsCache(
  domain: string,
  allowed: boolean,
  crawlDelayMs: number | null,
  robotsTxtUrl: string,
  ttlHours: number,
): void {
  const now = Date.now();
  db.delete(schema.robotsCache).where(eq(schema.robotsCache.domain, domain)).run();
  db.insert(schema.robotsCache)
    .values({
      domain,
      allowed: allowed ? 1 : 0,
      crawlDelayMs,
      robotsTxtUrl,
      checkedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlHours * 3600_000).toISOString(),
    })
    .run();
}

/** Registra opt-out de um lead: marca optOutAt e impede uso comercial padrão. */
export function registerOptOut(
  leadId: number,
  contactValue?: string,
  reason?: string,
): LeadRecord | undefined {
  const now = new Date().toISOString();
  db.insert(schema.optOuts)
    .values({ leadId, contactValue: contactValue ?? null, reason: reason ?? null })
    .run();
  db.update(schema.leads)
    .set({ optOutAt: now, commercialStatus: "descartado" })
    .where(eq(schema.leads.id, leadId))
    .run();
  addLeadActivity(leadId, "not_interested", `Opt-out registrado${reason ? `: ${reason}` : ""}`);
  return getLeadById(leadId);
}

// ---------------------------------------------------------------------
// Criação/Exclusão manual de leads
// ---------------------------------------------------------------------

export interface ManualLeadInput {
  companyName: string;
  niche?: string;
  city?: string;
  region?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  instagram?: string;
  linkedin?: string;
  site?: string;
  stage?: string;
  dealValue?: number;
  owner?: string;
  nextAction?: string;
  /** Score opcional informado manualmente (0-100). */
  score?: number;
}

/** Insere um lead criado manualmente (sem passar pelo pipeline). */
export function createLeadManual(input: ManualLeadInput): LeadRecord | undefined {
  const now = new Date().toISOString();
  const score = Math.max(0, Math.min(100, Number(input.score ?? 50)));
  const temperature: Lead["temperature"] = score >= 70 ? "Quente" : score >= 40 ? "Morno" : "Frio";
  const res = db
    .insert(schema.leads)
    .values({
      companyName: input.companyName,
      site: input.site ?? null,
      domain: normalizeDomain(input.site || "") ?? null,
      city: input.city ?? null,
      region: input.region ?? null,
      niche: input.niche ?? null,
      phone: input.phone ?? null,
      whatsapp: input.whatsapp ?? null,
      email: input.email ?? null,
      instagram: input.instagram ?? null,
      linkedin: input.linkedin ?? null,
      sourceUrl: input.site ?? null,
      evidence: "Lead criado manualmente",
      opportunities: "[]",
      score,
      finalScore: score,
      temperature,
      stage: input.stage ?? "Novo",
      dealValue: input.dealValue ?? null,
      owner: input.owner ?? null,
      nextAction: input.nextAction ?? null,
      sourceProvider: "manual",
      dataOrigin: "manual",
      legalBasis: "importado_pelo_usuario",
      commercialStatus: "novo",
      normalizedCompanyName: normalizeCompanyName(input.companyName) || null,
      rootDomain: normalizeDomain(input.site || ""),
      normalizedPhone: input.phone ? normalizePhone(input.phone) : null,
      normalizedWhatsapp: input.whatsapp ? normalizePhone(input.whatsapp) : null,
      normalizedEmail: input.email ? normalizeEmail(input.email) : null,
      normalizedInstagram: input.instagram ? normalizeInstagram(input.instagram) : null,
      firstSeenAt: now,
      lastSeenAt: now,
      lastCheckedAt: now,
    })
    .run();
  const id = Number(res.lastInsertRowid);
  addLeadActivity(id, "note", "Lead criado manualmente");
  return getLeadById(id);
}

/** Exclui um lead e seus dados auxiliares (notas, tarefas, evidências). */
export function deleteLead(leadId: number): boolean {
  db.delete(schema.leadTasks).where(eq(schema.leadTasks.leadId, leadId)).run();
  db.delete(schema.leadActivities).where(eq(schema.leadActivities.leadId, leadId)).run();
  db.delete(schema.scoreEvidences).where(eq(schema.scoreEvidences.leadId, leadId)).run();
  db.delete(schema.optOuts).where(eq(schema.optOuts.leadId, leadId)).run();
  const res = db.delete(schema.leads).where(eq(schema.leads.id, leadId)).run();
  return res.changes > 0;
}

// ---------------------------------------------------------------------
// Settings (key/value JSON simples)
// ---------------------------------------------------------------------

const DEFAULT_SETTINGS = {
  agencyName: "Gravity",
  message:
    "Olá, tudo bem? Aqui é da {agencia}. Vi a {empresa} em {cidade} e percebi uma oportunidade real de melhorar a captação e o acompanhamento de contatos comerciais no segmento de {nicho}.\n\nMuitos negócios recebem interessados mas perdem vendas por falta de processo, follow-up e organização. Quero te convidar para um diagnóstico gratuito — em poucos minutos identificamos gargalos de atendimento, oportunidades de automação e próximos passos para vender mais com clareza.\n\nPosso te enviar duas opções de horário?",
  niches: "Clínica Odontológica, Estética, Energia Solar, Advocacia, Imobiliária",
  theme: "dark",
};

export type Settings = typeof DEFAULT_SETTINGS;

/** Lê todas as settings (com defaults). */
export function getSettings(): Settings {
  const rows = db.select().from(schema.settings).all();
  const map: Record<string, string> = {};
  for (const r of rows) if (r.value != null) map[r.key] = r.value;
  return {
    agencyName: map.agencyName ?? DEFAULT_SETTINGS.agencyName,
    message: map.message ?? DEFAULT_SETTINGS.message,
    niches: map.niches ?? DEFAULT_SETTINGS.niches,
    theme: map.theme ?? DEFAULT_SETTINGS.theme,
  };
}

/** Grava settings parciais (faz upsert key/value). */
export function setSettings(patch: Partial<Settings>): Settings {
  const now = new Date().toISOString();
  for (const [k, v] of Object.entries(patch)) {
    if (v == null) continue;
    db.delete(schema.settings).where(eq(schema.settings.key, k)).run();
    db.insert(schema.settings).values({ key: k, value: String(v), updatedAt: now }).run();
  }
  return getSettings();
}

/** Histórico de buscas (mais recentes primeiro), com contagem de leads. */
export function listSearches(): Array<
  typeof schema.searches.$inferSelect & { leadCount: number }
> {
  const searches = db.select().from(schema.searches).orderBy(desc(schema.searches.id)).all();
  return searches.map((s) => {
    const count = db
      .select()
      .from(schema.leads)
      .where(eq(schema.leads.searchId, s.id))
      .all().length;
    return { ...s, leadCount: count };
  });
}
