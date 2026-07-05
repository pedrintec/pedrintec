import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { parseJsonLoose } from "./claudeClient.js";

// ====================================================================
// Serviço central da OpenAI (o "cérebro comercial" fala com a IA por aqui).
// - Server-side APENAS. A chave nunca sai deste processo.
// - Env-gated: sem OPENAI_API_KEY, `openaiEnabled()` é false e nada é chamado.
// - Nunca lança: toda falha vira um resultado { ok:false, error } controlado.
// - Sem SDK: usa o fetch global do Node 20+ (mesmo padrão do claudeClient).
// Toda chamada de IA do sistema passa obrigatoriamente por openaiJson().
// ====================================================================

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export function openaiEnabled(): boolean {
  return Boolean(config.OPENAI_API_KEY);
}

/** Resposta amigável padronizada quando a IA está desativada (sem chave). */
export function aiDisabledResponse() {
  return {
    enabled: false as const,
    error: "Recursos de IA desativados. Configure OPENAI_API_KEY para habilitar.",
  };
}

export interface OpenAiResult<T> {
  ok: boolean;
  /** JSON já parseado e validado pelo chamador (null se falhou/parse inválido). */
  data: T | null;
  /** Texto bruto retornado pela IA (para auditoria em raw_response). */
  raw: string;
  error?: string;
  model: string;
  durationMs: number;
  status?: number;
}

export interface OpenAiOptions {
  /** 0 = determinístico. Padrão 0.4 (comercial, com alguma naturalidade). */
  temperature?: number;
  maxTokens?: number;
}

/**
 * Chama a OpenAI (chat/completions) forçando resposta em JSON e devolve o
 * texto bruto + JSON parseado. Nunca lança — sempre retorna OpenAiResult.
 * O chamador é quem valida o formato do JSON (Zod) antes de persistir.
 */
export async function openaiJson<T = unknown>(
  system: string,
  user: string,
  opts: OpenAiOptions = {},
): Promise<OpenAiResult<T>> {
  const model = config.OPENAI_MODEL;
  const started = Date.now();
  const key = config.OPENAI_API_KEY;
  if (!key) {
    return { ok: false, data: null, raw: "", error: "IA desativada (sem OPENAI_API_KEY)", model, durationMs: 0 };
  }
  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: opts.temperature ?? 0.4,
        max_tokens: opts.maxTokens ?? 1400,
        // Garante JSON válido no corpo da resposta (evita Markdown/explicações soltas).
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(config.OPENAI_TIMEOUT_MS),
    });
    const durationMs = Date.now() - started;
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      logger.warn(`OpenAI respondeu ${res.status}: ${body}`);
      return { ok: false, data: null, raw: body, error: `OpenAI HTTP ${res.status}`, model, durationMs, status: res.status };
    }
    const payload = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = payload.choices?.[0]?.message?.content ?? "";
    const data = parseJsonLoose<T>(raw);
    if (data == null) {
      logger.warn("OpenAI retornou JSON inválido/não-parseável");
      return { ok: false, data: null, raw, error: "JSON inválido retornado pela IA", model, durationMs, status: res.status };
    }
    return { ok: true, data, raw, model, durationMs, status: res.status };
  } catch (e) {
    const durationMs = Date.now() - started;
    const msg = (e as Error).name === "TimeoutError" ? "Timeout na chamada à OpenAI" : (e as Error).message;
    logger.warn(`OpenAI falhou: ${msg}`);
    return { ok: false, data: null, raw: "", error: msg, model, durationMs };
  }
}
