import { sqlite } from "./client.js";
import { logger } from "../utils/logger.js";

// Migração simples e idempotente (CREATE TABLE IF NOT EXISTS).
// Mantida em sincronia manual com schema.ts. Para um MVP local isto é
// mais previsível e 100% não-interativo do que `drizzle-kit push`.

const statements = [
  `CREATE TABLE IF NOT EXISTS searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city TEXT NOT NULL,
    region TEXT NOT NULL,
    niche TEXT NOT NULL,
    max_leads INTEGER NOT NULL,
    search_type TEXT NOT NULL,
    provider TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    search_id INTEGER REFERENCES searches(id),
    company_name TEXT NOT NULL,
    site TEXT,
    domain TEXT,
    city TEXT,
    region TEXT,
    niche TEXT,
    phone TEXT,
    whatsapp TEXT,
    email TEXT,
    instagram TEXT,
    linkedin TEXT,
    address TEXT,
    public_contact_name TEXT,
    public_contact_role TEXT,
    source_url TEXT,
    evidence TEXT,
    opportunities TEXT,
    score INTEGER NOT NULL DEFAULT 0,
    temperature TEXT NOT NULL DEFAULT 'Frio',
    collected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    search_id INTEGER REFERENCES searches(id),
    url TEXT NOT NULL,
    query TEXT,
    status TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS execution_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    search_id INTEGER REFERENCES searches(id),
    total_queries INTEGER NOT NULL DEFAULT 0,
    total_urls INTEGER NOT NULL DEFAULT 0,
    total_leads INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    started_at TEXT,
    finished_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS search_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city TEXT, region TEXT, country TEXT, niche TEXT,
    search_type TEXT, provider TEXT, max_leads INTEGER,
    status TEXT DEFAULT 'pending',
    total_found INTEGER DEFAULT 0, total_saved INTEGER DEFAULT 0,
    total_duplicates INTEGER DEFAULT 0, total_errors INTEGER DEFAULT 0,
    started_at TEXT, finished_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS scraping_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mode TEXT NOT NULL,
    niche TEXT, city TEXT, region TEXT, keyword TEXT,
    status TEXT DEFAULT 'pending',
    total_urls INTEGER DEFAULT 0,
    analyzed_urls INTEGER DEFAULT 0,
    saved_leads INTEGER DEFAULT 0,
    failed_urls INTEGER DEFAULT 0,
    started_at TEXT, finished_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS score_evidences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER REFERENCES leads(id),
    score_type TEXT, signal TEXT, points INTEGER, evidence TEXT, source_url TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS lead_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER REFERENCES leads(id),
    type TEXT NOT NULL, description TEXT, metadata TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS opt_outs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER REFERENCES leads(id),
    contact_value TEXT, reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS robots_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL, allowed INTEGER, crawl_delay_ms INTEGER,
    robots_txt_url TEXT, checked_at TEXT, expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS search_queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    search_run_id INTEGER, query TEXT, provider TEXT, result_count INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER REFERENCES leads(id),
    type TEXT, value TEXT, normalized_value TEXT, confidence INTEGER, source_url TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS scrape_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT, domain TEXT, status_code INTEGER, success INTEGER,
    error_message TEXT, robots_allowed INTEGER, duration_ms INTEGER,
    requested_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS lead_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER REFERENCES leads(id),
    text TEXT NOT NULL, due TEXT, priority TEXT DEFAULT 'Média',
    done INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  // --- IA Comercial (OpenAI): análises, relatórios diários e logs de chamada ---
  `CREATE TABLE IF NOT EXISTS lead_ai_analysis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER REFERENCES leads(id),
    score INTEGER,
    priority TEXT,
    pain_point TEXT,
    detected_signals TEXT,
    recommended_offer TEXT,
    whatsapp_message TEXT,
    email_message TEXT,
    next_step TEXT,
    score_reason TEXT,
    raw_response TEXT,
    model TEXT,
    input_hash TEXT,
    status TEXT DEFAULT 'success',
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS ai_daily_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_date TEXT NOT NULL,
    total_found INTEGER DEFAULT 0,
    best_niches TEXT,
    top_leads TEXT,
    main_pain_points TEXT,
    commercial_opportunities TEXT,
    recommended_next_steps TEXT,
    executive_summary TEXT,
    raw_response TEXT,
    model TEXT,
    status TEXT DEFAULT 'success',
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS ai_call_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT,
    operation TEXT,
    lead_id INTEGER,
    model TEXT,
    status TEXT,
    request_payload TEXT,
    response_payload TEXT,
    error_message TEXT,
    duration_ms INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  // Índices úteis para dedup e consultas.
  `CREATE INDEX IF NOT EXISTS idx_leads_domain ON leads(domain)`,
  `CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone)`,
  `CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email)`,
  `CREATE INDEX IF NOT EXISTS idx_evidences_lead ON score_evidences(lead_id)`,
  `CREATE INDEX IF NOT EXISTS idx_activities_lead ON lead_activities(lead_id)`,
  `CREATE INDEX IF NOT EXISTS idx_robots_domain ON robots_cache(domain)`,
];

// Colunas adicionadas à tabela `leads` após a criação inicial.
// SQLite não tem "ADD COLUMN IF NOT EXISTS"; checamos via PRAGMA.
const leadColumnsToAdd: Array<{ name: string; ddl: string }> = [
  { name: "public_contact_name", ddl: "public_contact_name TEXT" },
  { name: "public_contact_role", ddl: "public_contact_role TEXT" },
  { name: "normalized_company_name", ddl: "normalized_company_name TEXT" },
  { name: "root_domain", ddl: "root_domain TEXT" },
  { name: "country", ddl: "country TEXT" },
  { name: "normalized_phone", ddl: "normalized_phone TEXT" },
  { name: "normalized_whatsapp", ddl: "normalized_whatsapp TEXT" },
  { name: "normalized_email", ddl: "normalized_email TEXT" },
  { name: "normalized_instagram", ddl: "normalized_instagram TEXT" },
  { name: "source_provider", ddl: "source_provider TEXT" },
  { name: "source_query", ddl: "source_query TEXT" },
  { name: "data_origin", ddl: "data_origin TEXT" },
  { name: "legal_basis", ddl: "legal_basis TEXT" },
  { name: "data_confidence", ddl: "data_confidence INTEGER" },
  { name: "commercial_status", ddl: "commercial_status TEXT DEFAULT 'novo'" },
  { name: "fit_score", ddl: "fit_score INTEGER" },
  { name: "urgency_score", ddl: "urgency_score INTEGER" },
  { name: "access_score", ddl: "access_score INTEGER" },
  { name: "final_score", ddl: "final_score INTEGER" },
  { name: "commercial_priority", ddl: "commercial_priority TEXT" },
  { name: "score_evidences", ddl: "score_evidences TEXT" },
  { name: "website_diagnostic", ddl: "website_diagnostic TEXT" },
  { name: "commercial_hook", ddl: "commercial_hook TEXT" },
  { name: "outreach_message", ddl: "outreach_message TEXT" },
  { name: "roi_estimate", ddl: "roi_estimate TEXT" },
  { name: "pain_diagnostic", ddl: "pain_diagnostic TEXT" },
  { name: "pain_signals", ddl: "pain_signals TEXT" },
  { name: "first_seen_at", ddl: "first_seen_at TEXT" },
  { name: "last_seen_at", ddl: "last_seen_at TEXT" },
  { name: "last_checked_at", ddl: "last_checked_at TEXT" },
  { name: "opt_out_at", ddl: "opt_out_at TEXT" },
  { name: "stage", ddl: "stage TEXT DEFAULT 'Novo'" },
  { name: "deal_value", ddl: "deal_value INTEGER" },
  { name: "owner", ddl: "owner TEXT" },
  { name: "next_action", ddl: "next_action TEXT" },
  { name: "last_contact_at", ddl: "last_contact_at TEXT" },
  // --- Pipeline Pesquisador/SDR IA ---
  { name: "research_report", ddl: "research_report TEXT" },
  { name: "researched_at", ddl: "researched_at TEXT" },
  { name: "sdr_status", ddl: "sdr_status TEXT" },
  { name: "sdr_started_at", ddl: "sdr_started_at TEXT" },
  // --- IA Comercial: timestamp de atualização do lead ---
  { name: "updated_at", ddl: "updated_at TEXT" },
];

// Coluna adicionada à tabela `lead_tasks` (idempotente).
function addMissingTaskColumns() {
  const existing = new Set(
    (sqlite.prepare("PRAGMA table_info(lead_tasks)").all() as Array<{ name: string }>).map((c) => c.name),
  );
  if (!existing.has("priority")) {
    sqlite.exec("ALTER TABLE lead_tasks ADD COLUMN priority TEXT DEFAULT 'Média'");
    logger.info(`  + coluna lead_tasks.priority`);
  }
}

function addMissingLeadColumns() {
  const existing = new Set(
    (sqlite.prepare("PRAGMA table_info(leads)").all() as Array<{ name: string }>).map((c) => c.name),
  );
  for (const col of leadColumnsToAdd) {
    if (!existing.has(col.name)) {
      sqlite.exec(`ALTER TABLE leads ADD COLUMN ${col.ddl}`);
      logger.info(`  + coluna leads.${col.name}`);
    }
  }
}

function migrate() {
  const tx = sqlite.transaction(() => {
    for (const stmt of statements) sqlite.exec(stmt);
    addMissingLeadColumns();
    addMissingTaskColumns();
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_leads_priority ON leads(commercial_priority)`);
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(commercial_status)`);
    // Índices da IA Comercial (busca da última análise por lead/hash; relatório por data).
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_ai_analysis_lead ON lead_ai_analysis(lead_id)`);
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_ai_analysis_hash ON lead_ai_analysis(input_hash)`);
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_ai_daily_report_date ON ai_daily_reports(report_date)`);
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_ai_call_logs_lead ON ai_call_logs(lead_id)`);
  });
  tx();
  logger.success("✅ Migração concluída. Tabelas prontas.");
}

migrate();
