import { geminiEnabled, geminiJson } from "../integrations/geminiService.js";
import { config } from "../config/index.js";
import {
  ANALYZE_LEAD_SYSTEM,
  analyzeLeadUser,
  messageSystem,
  SEARCH_QUERIES_SYSTEM,
  searchQueriesUser,
  DAY_SUMMARY_SYSTEM,
} from "./prompts.js";
import {
  normalizeLeadAnalysis,
  messageSchema,
  searchQueriesSchema,
  daySummarySchema,
  type DaySummary,
} from "./schemas.js";
import { leadInputHash } from "./hash.js";
import {
  saveLeadAiAnalysis,
  getAnalysisByHash,
  getLatestLeadAiAnalysis,
  logAiCall,
  type LeadAiAnalysisRow,
} from "../database/aiRepository.js";

// Orquestração do "cérebro comercial". Toda IA passa por aqui: validação,
// cache por input_hash, persistência, logs e fallback. Nunca lança.

export { geminiEnabled };

const NAO_ID = "não identificado";
const orNaoId = (v: unknown): string => {
  const s = String(v ?? "").trim();
  return s || NAO_ID;
};

export interface AnalyzeLeadInput {
  lead_id?: number | null;
  company_name: string;
  website?: string;
  instagram?: string;
  city?: string;
  niche?: string;
  phone?: string;
  email?: string;
  source?: string;
}

/** Formato de resposta da análise (contrato do endpoint). */
export interface LeadAnalysisResponse {
  score: number;
  priority: string;
  pain_point: string;
  detected_signals: string[];
  recommended_offer: string;
  whatsapp_message: string;
  email_message: string;
  next_step: string;
  score_reason: string;
}

function rowToAnalysis(row: LeadAiAnalysisRow): LeadAnalysisResponse {
  let signals: string[] = [];
  try {
    signals = JSON.parse(row.detected_signals || "[]");
  } catch {
    signals = [];
  }
  return {
    score: row.score ?? 0,
    priority: row.priority ?? "baixa",
    pain_point: row.pain_point ?? "",
    detected_signals: Array.isArray(signals) ? signals : [],
    recommended_offer: row.recommended_offer ?? "",
    whatsapp_message: row.whatsapp_message ?? "",
    email_message: row.email_message ?? "",
    next_step: row.next_step ?? "",
    score_reason: row.score_reason ?? "",
  };
}

export interface AnalyzeResult {
  enabled: boolean;
  ok: boolean;
  cached: boolean;
  analysis?: LeadAnalysisResponse;
  analysis_id?: number;
  input_hash?: string;
  error?: string;
}

export async function analyzeLead(input: AnalyzeLeadInput, force = false): Promise<AnalyzeResult> {
  const inputHash = leadInputHash({
    company_name: input.company_name,
    website: input.website,
    instagram: input.instagram,
    city: input.city,
    niche: input.niche,
    phone: input.phone,
    email: input.email,
    source: input.source,
  });

  // Cache anti-reanálise: mesmo hash + não forçado → devolve a análise salva.
  if (!force) {
    const cached = getAnalysisByHash(inputHash);
    if (cached) {
      return { enabled: true, ok: true, cached: true, analysis: rowToAnalysis(cached), analysis_id: cached.id, input_hash: inputHash };
    }
  }

  if (!geminiEnabled()) {
    return { enabled: false, ok: false, cached: false, error: "Recursos de IA desativados. Configure GEMINI_API_KEY para habilitar.", input_hash: inputHash };
  }

  const leadJson = JSON.stringify(
    {
      company_name: orNaoId(input.company_name),
      website: orNaoId(input.website),
      instagram: orNaoId(input.instagram),
      city: orNaoId(input.city),
      niche: orNaoId(input.niche),
      phone: orNaoId(input.phone),
      email: orNaoId(input.email),
      source: orNaoId(input.source),
    },
    null,
    2,
  );

  const result = await geminiJson(ANALYZE_LEAD_SYSTEM, analyzeLeadUser(leadJson), { temperature: 0.3 });
  logAiCall({
    endpoint: "/api/ai/analyze-lead",
    operation: "analyze_lead",
    leadId: input.lead_id ?? null,
    model: result.model,
    status: result.ok ? "success" : "error",
    requestPayload: { company_name: input.company_name, niche: input.niche, city: input.city },
    responsePayload: result.raw,
    errorMessage: result.error ?? null,
    durationMs: result.durationMs,
  });

  const normalized = result.ok ? normalizeLeadAnalysis(result.data) : null;
  if (!result.ok || !normalized) {
    // Falha/JSON inválido: registra como erro (não polui o cache de sucesso).
    saveLeadAiAnalysis({
      leadId: input.lead_id ?? null,
      score: 0, priority: "baixa", painPoint: "", detectedSignals: [], recommendedOffer: "",
      whatsappMessage: "", emailMessage: "", nextStep: "", scoreReason: "",
      rawResponse: result.raw, model: result.model, inputHash,
      status: "error", errorMessage: result.error || "JSON inválido retornado pela IA",
    });
    return { enabled: true, ok: false, cached: false, error: result.error || "A IA não retornou uma análise válida. Tente novamente.", input_hash: inputHash };
  }

  const analysisId = saveLeadAiAnalysis({
    leadId: input.lead_id ?? null,
    score: normalized.score,
    priority: normalized.priority!,
    painPoint: normalized.pain_point,
    detectedSignals: normalized.detected_signals,
    recommendedOffer: normalized.recommended_offer,
    whatsappMessage: normalized.whatsapp_message,
    emailMessage: normalized.email_message,
    nextStep: normalized.next_step,
    scoreReason: normalized.score_reason,
    rawResponse: result.raw,
    model: result.model,
    inputHash,
    status: "success",
  });

  return {
    enabled: true,
    ok: true,
    cached: false,
    analysis: {
      score: normalized.score,
      priority: normalized.priority!,
      pain_point: normalized.pain_point,
      detected_signals: normalized.detected_signals,
      recommended_offer: normalized.recommended_offer,
      whatsapp_message: normalized.whatsapp_message,
      email_message: normalized.email_message,
      next_step: normalized.next_step,
      score_reason: normalized.score_reason,
    },
    analysis_id: analysisId,
    input_hash: inputHash,
  };
}

// ---- Geração de mensagem (rascunho para aprovação humana) ----
export interface GenerateMessageInput {
  leadId: number;
  lead: AnalyzeLeadInput;
  channel: "whatsapp" | "email";
  tone: string;
  offer?: string;
}
export interface MessageResult {
  enabled: boolean;
  ok: boolean;
  channel: "whatsapp" | "email";
  message: string;
  subject?: string;
  based_on_analysis_id: number | null;
  requires_human_approval: true;
  error?: string;
}

export async function generateMessage(input: GenerateMessageInput): Promise<MessageResult> {
  const base: MessageResult = {
    enabled: geminiEnabled(),
    ok: false,
    channel: input.channel,
    message: "",
    based_on_analysis_id: null,
    requires_human_approval: true,
  };
  if (!geminiEnabled()) {
    return { ...base, error: "Recursos de IA desativados. Configure GEMINI_API_KEY para habilitar." };
  }
  const analysis = getLatestLeadAiAnalysis(input.leadId);
  const context = {
    lead: {
      company_name: orNaoId(input.lead.company_name),
      niche: orNaoId(input.lead.niche),
      city: orNaoId(input.lead.city),
      website: orNaoId(input.lead.website),
      instagram: orNaoId(input.lead.instagram),
    },
    pain_point: analysis?.pain_point || NAO_ID,
    recommended_offer: input.offer || analysis?.recommended_offer || NAO_ID,
    score: analysis?.score ?? null,
  };
  const result = await geminiJson(
    messageSystem(input.channel, input.tone),
    `Gere o rascunho com base neste contexto (não invente dados marcados como "${NAO_ID}"):\n${JSON.stringify(context, null, 2)}`,
    { temperature: 0.6 },
  );
  logAiCall({
    endpoint: "/api/ai/generate-message",
    operation: `message_${input.channel}`,
    leadId: input.leadId,
    model: result.model,
    status: result.ok ? "success" : "error",
    requestPayload: { channel: input.channel, tone: input.tone },
    responsePayload: result.raw,
    errorMessage: result.error ?? null,
    durationMs: result.durationMs,
  });
  const parsed = result.ok ? messageSchema.safeParse(result.data) : null;
  if (!result.ok || !parsed || !parsed.success) {
    return { ...base, error: result.error || "A IA não retornou uma mensagem válida. Tente novamente." };
  }
  return {
    ...base,
    ok: true,
    message: parsed.data.message,
    subject: input.channel === "email" ? parsed.data.subject || "" : undefined,
    based_on_analysis_id: analysis?.id ?? null,
  };
}

// ---- Buscas públicas (Caçador IA) ----
export async function generateSearchQueries(niche: string, city: string, clientType?: string) {
  if (!geminiEnabled()) {
    return { enabled: false, ok: false, queries: [] as string[], error: "Recursos de IA desativados. Configure GEMINI_API_KEY para habilitar." };
  }
  const result = await geminiJson(SEARCH_QUERIES_SYSTEM, searchQueriesUser(niche, city, clientType), { temperature: 0.5 });
  logAiCall({
    endpoint: "/api/ai/generate-search-queries",
    operation: "search_queries",
    model: result.model,
    status: result.ok ? "success" : "error",
    requestPayload: { niche, city, clientType },
    responsePayload: result.raw,
    errorMessage: result.error ?? null,
    durationMs: result.durationMs,
  });
  const parsed = result.ok ? searchQueriesSchema.safeParse(result.data) : null;
  if (!result.ok || !parsed || !parsed.success) {
    return { enabled: true, ok: false, queries: [] as string[], error: result.error || "A IA não retornou buscas válidas. Tente novamente." };
  }
  return { enabled: true, ok: true, queries: parsed.data.queries };
}

// ---- Interpretação (resumo executivo) sobre estatísticas agregadas ----
export interface DaySummaryResult {
  enabled: boolean;
  ok: boolean;
  summary: DaySummary | null;
  raw: string;
  model: string;
  error?: string;
}

export async function summarizeDay(stats: unknown, operation: string, endpoint: string): Promise<DaySummaryResult> {
  if (!geminiEnabled()) {
    return { enabled: false, ok: false, summary: null, raw: "", model: "", error: "Recursos de IA desativados. Configure GEMINI_API_KEY para habilitar." };
  }
  const result = await geminiJson(
    DAY_SUMMARY_SYSTEM,
    `Estatísticas agregadas do período:\n${JSON.stringify(stats, null, 2)}`,
    { temperature: 0.4 },
  );
  logAiCall({
    endpoint,
    operation,
    model: result.model,
    status: result.ok ? "success" : "error",
    requestPayload: stats,
    responsePayload: result.raw,
    errorMessage: result.error ?? null,
    durationMs: result.durationMs,
  });
  const parsed = result.ok ? daySummarySchema.safeParse(result.data) : null;
  if (!result.ok || !parsed || !parsed.success) {
    return { enabled: true, ok: false, summary: null, raw: result.raw, model: result.model, error: result.error || "Interpretação de IA indisponível." };
  }
  return { enabled: true, ok: true, summary: parsed.data, raw: result.raw, model: result.model };
}

// ---- Teste de conexão da IA (usado nas Configurações) ----
export async function pingAi(): Promise<{
  enabled: boolean;
  ok: boolean;
  provider: "Gemini";
  model: string;
  latencyMs: number;
  error?: string;
}> {
  const model = config.GEMINI_MODEL;
  if (!geminiEnabled()) {
    return { enabled: false, ok: false, provider: "Gemini", model, latencyMs: 0, error: "Sem GEMINI_API_KEY configurada no backend." };
  }
  const started = Date.now();
  const r = await geminiJson<{ ok?: boolean }>(
    "Você é um verificador de conexão. Responda apenas com JSON.",
    'Retorne exatamente {"ok":true}.',
    { temperature: 0, maxTokens: 20 },
  );
  return { enabled: true, ok: r.ok, provider: "Gemini", model, latencyMs: Date.now() - started, error: r.ok ? undefined : r.error };
}
