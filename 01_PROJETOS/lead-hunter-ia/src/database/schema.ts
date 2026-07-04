import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Esquema do banco (fonte de verdade para as queries do Drizzle).
// As tabelas são criadas por src/database/migrate.ts.

/** Cada execução de busca feita pelo usuário. */
export const searches = sqliteTable("searches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  city: text("city").notNull(),
  region: text("region").notNull(),
  niche: text("niche").notNull(),
  maxLeads: integer("max_leads").notNull(),
  searchType: text("search_type").notNull(),
  provider: text("provider").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/** Leads consolidados. */
export const leads = sqliteTable("leads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  searchId: integer("search_id").references(() => searches.id),
  companyName: text("company_name").notNull(),
  site: text("site"),
  domain: text("domain"), // chave de dedup
  city: text("city"),
  region: text("region"),
  niche: text("niche"),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  email: text("email"),
  instagram: text("instagram"),
  linkedin: text("linkedin"),
  address: text("address"),
  sourceUrl: text("source_url"),
  evidence: text("evidence"),
  opportunities: text("opportunities"), // JSON string
  score: integer("score").notNull().default(0),
  temperature: text("temperature").notNull().default("Frio"),
  collectedAt: text("collected_at").default(sql`CURRENT_TIMESTAMP`).notNull(),

  // --- Prospecção consultiva / CRM / conformidade ---
  normalizedCompanyName: text("normalized_company_name"),
  rootDomain: text("root_domain"),
  country: text("country"),
  normalizedPhone: text("normalized_phone"),
  normalizedWhatsapp: text("normalized_whatsapp"),
  normalizedEmail: text("normalized_email"),
  normalizedInstagram: text("normalized_instagram"),
  sourceProvider: text("source_provider"),
  sourceQuery: text("source_query"),
  dataOrigin: text("data_origin"),
  legalBasis: text("legal_basis"),
  dataConfidence: integer("data_confidence"),
  commercialStatus: text("commercial_status").default("novo"),
  fitScore: integer("fit_score"),
  urgencyScore: integer("urgency_score"),
  accessScore: integer("access_score"),
  finalScore: integer("final_score"),
  commercialPriority: text("commercial_priority"),
  scoreEvidences: text("score_evidences"), // JSON
  websiteDiagnostic: text("website_diagnostic"), // JSON
  commercialHook: text("commercial_hook"),
  outreachMessage: text("outreach_message"),
  roiEstimate: text("roi_estimate"), // JSON
  firstSeenAt: text("first_seen_at"),
  lastSeenAt: text("last_seen_at"),
  lastCheckedAt: text("last_checked_at"),
  optOutAt: text("opt_out_at"),

  // --- Funil/CRM do painel premium ---
  stage: text("stage").default("Novo"), // etapa do funil
  dealValue: integer("deal_value"), // valor estimado da oportunidade
  owner: text("owner"), // responsável comercial
  nextAction: text("next_action"), // próxima ação sugerida
  lastContactAt: text("last_contact_at"), // último contato registrado
});

/** Tarefas/follow-ups por lead (CRM). */
export const leadTasks = sqliteTable("lead_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id").references(() => leads.id),
  text: text("text").notNull(),
  due: text("due"),
  priority: text("priority").default("Média"), // Alta | Média | Baixa
  done: integer("done").notNull().default(0),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/** Configurações da aplicação (key/value JSON simples). */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/** Histórico rico de execuções de busca (campanhas). */
export const searchRuns = sqliteTable("search_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  city: text("city"),
  region: text("region"),
  country: text("country"),
  niche: text("niche"),
  searchType: text("search_type"),
  provider: text("provider"),
  maxLeads: integer("max_leads"),
  status: text("status").default("pending"),
  totalFound: integer("total_found").default(0),
  totalSaved: integer("total_saved").default(0),
  totalDuplicates: integer("total_duplicates").default(0),
  totalErrors: integer("total_errors").default(0),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/** Evidências de pontuação por lead (score auditável). */
export const scoreEvidences = sqliteTable("score_evidences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id").references(() => leads.id),
  scoreType: text("score_type"),
  signal: text("signal"),
  points: integer("points"),
  evidence: text("evidence"),
  sourceUrl: text("source_url"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/** Mini-CRM: histórico de atividades por lead. */
export const leadActivities = sqliteTable("lead_activities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id").references(() => leads.id),
  type: text("type").notNull(),
  description: text("description"),
  metadata: text("metadata"), // JSON
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/** Registros de opt-out (LGPD). */
export const optOuts = sqliteTable("opt_outs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id").references(() => leads.id),
  contactValue: text("contact_value"),
  reason: text("reason"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/** Cache de robots.txt por domínio. */
export const robotsCache = sqliteTable("robots_cache", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  domain: text("domain").notNull(),
  allowed: integer("allowed"), // 0/1
  crawlDelayMs: integer("crawl_delay_ms"),
  robotsTxtUrl: text("robots_txt_url"),
  checkedAt: text("checked_at"),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/** Consultas (queries) executadas em cada busca. */
export const searchQueries = sqliteTable("search_queries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  searchRunId: integer("search_run_id"),
  query: text("query"),
  provider: text("provider"),
  resultCount: integer("result_count"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/** Contatos individuais de um lead (telefone/whatsapp/email/social), com confiança. */
export const contacts = sqliteTable("contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id").references(() => leads.id),
  type: text("type"), // phone | whatsapp | email | instagram | linkedin | website
  value: text("value"),
  normalizedValue: text("normalized_value"),
  confidence: integer("confidence"),
  sourceUrl: text("source_url"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/** Logs de scraping (rastreabilidade/conformidade). */
export const scrapeLogs = sqliteTable("scrape_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  url: text("url"),
  domain: text("domain"),
  statusCode: integer("status_code"),
  success: integer("success"), // 0/1
  errorMessage: text("error_message"),
  robotsAllowed: integer("robots_allowed"), // 0/1
  durationMs: integer("duration_ms"),
  requestedAt: text("requested_at"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/** Fontes (URLs) visitadas, para rastreabilidade. */
export const sources = sqliteTable("sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  searchId: integer("search_id").references(() => searches.id),
  url: text("url").notNull(),
  query: text("query"),
  status: text("status"), // ok | blocked | error | skipped
  notes: text("notes"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/** Histórico de execução (resumo de cada run). */
export const executionHistory = sqliteTable("execution_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  searchId: integer("search_id").references(() => searches.id),
  totalQueries: integer("total_queries").notNull().default(0),
  totalUrls: integer("total_urls").notNull().default(0),
  totalLeads: integer("total_leads").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
});

export type SearchRow = typeof searches.$inferSelect;
export type LeadRow = typeof leads.$inferSelect;
