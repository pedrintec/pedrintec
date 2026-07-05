import { z } from "zod";

// Validação (Zod) dos JSONs devolvidos pela IA. Análise inválida NUNCA é salva
// como sucesso — o chamador cai no fallback. Também normaliza score/prioridade.

export type AiPriority = "baixa" | "media" | "alta" | "quente";

/** Deriva a prioridade a partir do score (fonte única de verdade). */
export function priorityFromScore(score: number): AiPriority {
  if (score >= 85) return "quente";
  if (score >= 70) return "alta";
  if (score >= 40) return "media";
  return "baixa";
}

/** Faixa de temperatura textual do score (para UI). */
export function tempFromScore(score: number): "frio" | "medio" | "bom" | "quente" {
  if (score >= 85) return "quente";
  if (score >= 70) return "bom";
  if (score >= 40) return "medio";
  return "frio";
}

const clampScore = (v: unknown): number => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
};

/** Aceita array de strings OU string única (a IA às vezes manda uma só). */
const stringArray = z.preprocess(
  (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]),
  z.array(z.coerce.string()).max(20),
);

// ---- Análise individual de lead ----
export const leadAnalysisSchema = z.object({
  score: z.preprocess(clampScore, z.number().int().min(0).max(100)),
  priority: z.string().optional(),
  pain_point: z.coerce.string().default(""),
  detected_signals: stringArray.default([]),
  recommended_offer: z.coerce.string().default(""),
  whatsapp_message: z.coerce.string().default(""),
  email_message: z.coerce.string().default(""),
  next_step: z.coerce.string().default(""),
  score_reason: z.coerce.string().default(""),
});
export type LeadAnalysis = z.infer<typeof leadAnalysisSchema>;

/** Valida + força prioridade coerente com o score (ignora a que a IA mandou). */
export function normalizeLeadAnalysis(raw: unknown): LeadAnalysis | null {
  const parsed = leadAnalysisSchema.safeParse(raw);
  if (!parsed.success) return null;
  const data = parsed.data;
  data.priority = priorityFromScore(data.score);
  return data;
}

// ---- Geração de mensagem ----
export const messageSchema = z.object({
  message: z.coerce.string().min(1),
  subject: z.coerce.string().optional(),
});
export type AiMessage = z.infer<typeof messageSchema>;

// ---- Buscas públicas (Caçador IA) ----
export const searchQueriesSchema = z.object({
  queries: z.array(z.coerce.string().min(1)).min(1).max(30),
});
export type AiSearchQueries = z.infer<typeof searchQueriesSchema>;

// ---- Relatório diário / interpretação de dashboard ----
export const daySummarySchema = z.object({
  best_niches: stringArray.default([]),
  main_pain_points: stringArray.default([]),
  commercial_opportunities: stringArray.default([]),
  recommended_next_steps: stringArray.default([]),
  executive_summary: z.coerce.string().default(""),
});
export type DaySummary = z.infer<typeof daySummarySchema>;
