import { sqlite } from "./client.js";

// Persistência da IA Comercial (SQLite direto, isolado do schema Drizzle).
// Guarda análises por lead (com input_hash p/ cache), relatórios diários e
// logs de chamada. Todas as escritas são idempotentes/seguras.

export interface LeadAiAnalysisRow {
  id: number;
  lead_id: number | null;
  score: number | null;
  priority: string | null;
  pain_point: string | null;
  detected_signals: string | null;
  recommended_offer: string | null;
  whatsapp_message: string | null;
  email_message: string | null;
  next_step: string | null;
  score_reason: string | null;
  raw_response: string | null;
  model: string | null;
  input_hash: string | null;
  status: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaveAnalysisInput {
  leadId: number | null;
  score: number;
  priority: string;
  painPoint: string;
  detectedSignals: string[];
  recommendedOffer: string;
  whatsappMessage: string;
  emailMessage: string;
  nextStep: string;
  scoreReason: string;
  rawResponse: string;
  model: string;
  inputHash: string;
  status?: string;
  errorMessage?: string | null;
}

export function saveLeadAiAnalysis(a: SaveAnalysisInput): number {
  const stmt = sqlite.prepare(`
    INSERT INTO lead_ai_analysis
      (lead_id, score, priority, pain_point, detected_signals, recommended_offer,
       whatsapp_message, email_message, next_step, score_reason, raw_response,
       model, input_hash, status, error_message)
    VALUES (@leadId, @score, @priority, @painPoint, @detectedSignals, @recommendedOffer,
       @whatsappMessage, @emailMessage, @nextStep, @scoreReason, @rawResponse,
       @model, @inputHash, @status, @errorMessage)
  `);
  const info = stmt.run({
    leadId: a.leadId,
    score: a.score,
    priority: a.priority,
    painPoint: a.painPoint,
    detectedSignals: JSON.stringify(a.detectedSignals ?? []),
    recommendedOffer: a.recommendedOffer,
    whatsappMessage: a.whatsappMessage,
    emailMessage: a.emailMessage,
    nextStep: a.nextStep,
    scoreReason: a.scoreReason,
    rawResponse: a.rawResponse,
    model: a.model,
    inputHash: a.inputHash,
    status: a.status ?? "success",
    errorMessage: a.errorMessage ?? null,
  });
  return Number(info.lastInsertRowid);
}

/** Última análise BEM-SUCEDIDA de um lead (para exibir na tela de leads). */
export function getLatestLeadAiAnalysis(leadId: number): LeadAiAnalysisRow | undefined {
  return sqlite
    .prepare(
      `SELECT * FROM lead_ai_analysis WHERE lead_id = ? AND status = 'success' ORDER BY id DESC LIMIT 1`,
    )
    .get(leadId) as LeadAiAnalysisRow | undefined;
}

/** Última análise válida com o mesmo input_hash (cache anti-reanálise). */
export function getAnalysisByHash(inputHash: string): LeadAiAnalysisRow | undefined {
  return sqlite
    .prepare(
      `SELECT * FROM lead_ai_analysis WHERE input_hash = ? AND status = 'success' ORDER BY id DESC LIMIT 1`,
    )
    .get(inputHash) as LeadAiAnalysisRow | undefined;
}

export function getAnalysisById(id: number): LeadAiAnalysisRow | undefined {
  return sqlite.prepare(`SELECT * FROM lead_ai_analysis WHERE id = ?`).get(id) as
    | LeadAiAnalysisRow
    | undefined;
}

/** Conjunto de lead_ids que já possuem ao menos uma análise de IA bem-sucedida. */
export function analyzedLeadIdSet(): Set<number> {
  const rows = sqlite
    .prepare(`SELECT DISTINCT lead_id FROM lead_ai_analysis WHERE status = 'success' AND lead_id IS NOT NULL`)
    .all() as Array<{ lead_id: number }>;
  return new Set(rows.map((r) => r.lead_id));
}

/** Ofertas mais recomendadas pela IA (agregado, para o Dashboard IA). */
export function topRecommendedOffers(limit = 5): Array<{ offer: string; count: number }> {
  return sqlite
    .prepare(
      `SELECT recommended_offer AS offer, COUNT(*) AS count
       FROM lead_ai_analysis
       WHERE status = 'success' AND recommended_offer IS NOT NULL AND recommended_offer <> ''
       GROUP BY recommended_offer ORDER BY count DESC LIMIT ?`,
    )
    .all(limit) as Array<{ offer: string; count: number }>;
}

// ---- Relatórios diários ----
export interface DailyReportRow {
  id: number;
  report_date: string;
  total_found: number;
  best_niches: string | null;
  top_leads: string | null;
  main_pain_points: string | null;
  commercial_opportunities: string | null;
  recommended_next_steps: string | null;
  executive_summary: string | null;
  raw_response: string | null;
  model: string | null;
  status: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaveDailyReportInput {
  reportDate: string;
  totalFound: number;
  bestNiches: string[];
  topLeads: unknown[];
  mainPainPoints: string[];
  commercialOpportunities: string[];
  recommendedNextSteps: string[];
  executiveSummary: string;
  rawResponse: string;
  model: string;
  status?: string;
  errorMessage?: string | null;
}

export function getDailyReport(reportDate: string): DailyReportRow | undefined {
  return sqlite
    .prepare(`SELECT * FROM ai_daily_reports WHERE report_date = ? ORDER BY id DESC LIMIT 1`)
    .get(reportDate) as DailyReportRow | undefined;
}

export function saveDailyReport(r: SaveDailyReportInput): number {
  const info = sqlite
    .prepare(
      `INSERT INTO ai_daily_reports
        (report_date, total_found, best_niches, top_leads, main_pain_points,
         commercial_opportunities, recommended_next_steps, executive_summary,
         raw_response, model, status, error_message)
       VALUES (@reportDate, @totalFound, @bestNiches, @topLeads, @mainPainPoints,
         @commercialOpportunities, @recommendedNextSteps, @executiveSummary,
         @rawResponse, @model, @status, @errorMessage)`,
    )
    .run({
      reportDate: r.reportDate,
      totalFound: r.totalFound,
      bestNiches: JSON.stringify(r.bestNiches ?? []),
      topLeads: JSON.stringify(r.topLeads ?? []),
      mainPainPoints: JSON.stringify(r.mainPainPoints ?? []),
      commercialOpportunities: JSON.stringify(r.commercialOpportunities ?? []),
      recommendedNextSteps: JSON.stringify(r.recommendedNextSteps ?? []),
      executiveSummary: r.executiveSummary,
      rawResponse: r.rawResponse,
      model: r.model,
      status: r.status ?? "success",
      errorMessage: r.errorMessage ?? null,
    });
  return Number(info.lastInsertRowid);
}

// ---- Logs de chamada de IA (auditoria/depuração). Nunca guarda a API key. ----
export interface AiCallLogInput {
  endpoint: string;
  operation: string;
  leadId?: number | null;
  model: string;
  status: string;
  requestPayload?: unknown;
  responsePayload?: unknown;
  errorMessage?: string | null;
  durationMs?: number;
}

/** Trunca payloads para o log não crescer demais. */
function sanitize(value: unknown, max = 4000): string | null {
  if (value == null) return null;
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length > max ? s.slice(0, max) + "…[truncado]" : s;
}

export function logAiCall(entry: AiCallLogInput): void {
  try {
    sqlite
      .prepare(
        `INSERT INTO ai_call_logs
          (endpoint, operation, lead_id, model, status, request_payload,
           response_payload, error_message, duration_ms)
         VALUES (@endpoint, @operation, @leadId, @model, @status, @requestPayload,
           @responsePayload, @errorMessage, @durationMs)`,
      )
      .run({
        endpoint: entry.endpoint,
        operation: entry.operation,
        leadId: entry.leadId ?? null,
        model: entry.model,
        status: entry.status,
        requestPayload: sanitize(entry.requestPayload),
        responsePayload: sanitize(entry.responsePayload),
        errorMessage: entry.errorMessage ?? null,
        durationMs: entry.durationMs ?? null,
      });
  } catch {
    // Log nunca deve derrubar o fluxo principal.
  }
}
