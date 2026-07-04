import "dotenv/config";
import { z } from "zod";

// Validação e tipagem das variáveis de ambiente com Zod.
// Falha cedo e com mensagem clara se algo essencial estiver errado.

const boolFromEnv = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v == null ? def : ["1", "true", "yes", "sim"].includes(v.toLowerCase())));

const intFromEnv = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v == null || v === "" ? def : Number.parseInt(v, 10)))
    .pipe(z.number().int().positive());

const envSchema = z.object({
  DATABASE_PATH: z.string().default("./data/lead-hunter.db"),
  SEARCH_PROVIDER: z
    .enum(["serpapi", "google_cse", "manual", "serper", "serper_places", "multi"])
    .default("manual"),
  SERPAPI_KEY: z.string().optional(),
  SERPER_API_KEY: z.string().optional(),
  GOOGLE_CSE_KEY: z.string().optional(),
  GOOGLE_CSE_CX: z.string().optional(),
  USER_AGENT: z
    .string()
    .default("LeadHunterIA/0.1 (+https://example.com/bot; contato@example.com)"),
  REQUEST_DELAY_MS: intFromEnv(1500),
  MAX_CONCURRENCY: intFromEnv(3),
  REQUEST_TIMEOUT_MS: intFromEnv(15000),
  MAX_RETRIES: intFromEnv(2),
  RESPECT_ROBOTS_TXT: boolFromEnv(true),
  USE_PLAYWRIGHT_FALLBACK: boolFromEnv(false),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DEFAULT_COUNTRY: z.string().default("Brasil"),

  // --- Google Places (provider futuro, opcional) ---
  GOOGLE_PLACES_KEY: z.string().optional(),

  // --- Conformidade / prospecção consultiva ---
  ROBOTS_CACHE_TTL_HOURS: intFromEnv(24),
  DEFAULT_LEGAL_BASIS: z
    .enum([
      "legitimo_interesse_comercial",
      "dados_publicos_comerciais",
      "consentimento",
      "importado_pelo_usuario",
    ])
    .default("legitimo_interesse_comercial"),
  EXPORT_INCLUDE_OPT_OUT: boolFromEnv(false),
  GENERATE_OUTREACH_MESSAGES: boolFromEnv(true),
  GENERATE_ROI_ESTIMATE: boolFromEnv(true),

  // --- Integrações (opcional): webhook n8n disparado na mudança de etapa ---
  // "" (chave presente mas vazia no .env) conta como desativado.
  N8N_WEBHOOK_URL: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),

  // --- IA (opcional): Pesquisador e SDR usam a API do Claude se houver chave ---
  ANTHROPIC_API_KEY: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Configuração inválida no .env:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type AppConfig = typeof config;
