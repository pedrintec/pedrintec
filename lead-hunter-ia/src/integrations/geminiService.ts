import { GoogleGenAI } from "@google/genai";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { parseJsonLoose } from "./claudeClient.js";

export interface GeminiResult<T> {
  ok: boolean;
  data: T | null;
  raw: string;
  error?: string;
  model: string;
  durationMs: number;
  status?: number;
}

export interface GeminiOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface GeminiClientLike {
  models: {
    generateContent(params: {
      model: string;
      contents: string;
      config: {
        temperature: number;
        maxOutputTokens: number;
        responseMimeType: "application/json";
      };
    }): Promise<unknown>;
  };
}

export function geminiApiKey(): string | undefined {
  return config.GEMINI_API_KEY || config.GOOGLE_API_KEY;
}

export function geminiEnabled(): boolean {
  return Boolean(geminiApiKey());
}

export function aiDisabledResponse() {
  return {
    enabled: false as const,
    error: "Recursos de IA desativados. Configure GEMINI_API_KEY para habilitar.",
  };
}

export function buildGeminiContents(system: string, user: string): string {
  return [
    "Instrucoes do sistema:",
    system,
    "",
    "Solicitacao:",
    user,
    "",
    "Retorne somente JSON valido. Nao inclua Markdown, explicacoes ou texto fora do JSON.",
  ].join("\n");
}

function extractGeminiText(response: unknown): string {
  const payload = response as {
    text?: string | (() => string);
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = typeof payload.text === "function" ? payload.text() : payload.text;
  if (typeof text === "string") return text;
  return (payload.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("");
}

/** Converte o erro cru do Google em uma mensagem curta e amigável para a UI. */
export function friendlyGeminiError(raw: string): string {
  const m = (raw || "").toLowerCase();
  if (m.includes("api key not valid") || m.includes("api_key_invalid") || m.includes("invalid_argument") && m.includes("api key"))
    return "Chave da API Gemini inválida. Gere uma chave válida em aistudio.google.com/apikey (começa com AIza) e atualize GEMINI_API_KEY.";
  if (m.includes("api_key_invalid")) return "Chave da API Gemini inválida. Verifique GEMINI_API_KEY.";
  if (m.includes("referer") || m.includes("referrer") || m.includes("api_key_http_referrer_blocked"))
    return "Chave da Gemini restrita a referrers HTTP (uso em navegador). Para uso no servidor, edite a chave e defina 'Application restrictions' = None (ou IP). A Gemini API está ok — o bloqueio é da chave.";
  if (m.includes("api_key_service_blocked") || m.includes("service_blocked"))
    return "Chave da Gemini com restrição de API. Nas 'API restrictions' da chave, permita a Generative Language API (ou 'Don't restrict key').";
  if (m.includes("permission_denied") || m.includes("permission denied") || m.includes("403"))
    return "Acesso negado pela Gemini: a chave está restrita. Ajuste 'Application restrictions' (None/IP) e 'API restrictions' (Generative Language API) no Google AI Studio.";
  if (m.includes("resource_exhausted") || m.includes("quota") || m.includes("429") || m.includes("rate limit"))
    return "Limite/quota da Gemini atingido. Verifique os limites da sua chave no Google AI Studio.";
  if (m.includes("timeout")) return "Tempo esgotado ao chamar a IA (Gemini). Tente novamente.";
  if (m.includes("not found") || m.includes("404")) return "Modelo Gemini não encontrado. Verifique GEMINI_MODEL.";
  return "Falha ao chamar a IA (Gemini). Tente novamente em instantes.";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        const error = new Error("Timeout na chamada ao Gemini");
        error.name = "TimeoutError";
        reject(error);
      }, timeoutMs);
    });
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function geminiJsonWithClient<T = unknown>(
  client: GeminiClientLike,
  model: string,
  system: string,
  user: string,
  opts: GeminiOptions = {},
): Promise<GeminiResult<T>> {
  const started = Date.now();
  try {
    const response = await withTimeout(
      client.models.generateContent({
        model,
        contents: buildGeminiContents(system, user),
        config: {
          temperature: opts.temperature ?? 0.4,
          maxOutputTokens: opts.maxTokens ?? 1400,
          responseMimeType: "application/json",
        },
      }),
      opts.timeoutMs ?? config.GEMINI_TIMEOUT_MS,
    );
    const durationMs = Date.now() - started;
    const raw = extractGeminiText(response);
    const data = parseJsonLoose<T>(raw);
    if (data == null) {
      logger.warn("Gemini retornou JSON invalido/nao parseavel");
      return { ok: false, data: null, raw, error: "JSON invalido retornado pela IA", model, durationMs };
    }
    return { ok: true, data, raw, model, durationMs };
  } catch (e) {
    const durationMs = Date.now() - started;
    const rawMsg = (e as Error).name === "TimeoutError" ? "Timeout na chamada ao Gemini" : (e as Error).message;
    logger.warn(`Gemini falhou: ${rawMsg}`);
    return { ok: false, data: null, raw: "", error: friendlyGeminiError(rawMsg), model, durationMs };
  }
}

export async function geminiJson<T = unknown>(
  system: string,
  user: string,
  opts: GeminiOptions = {},
): Promise<GeminiResult<T>> {
  const model = config.GEMINI_MODEL;
  const key = geminiApiKey();
  if (!key) {
    return { ok: false, data: null, raw: "", error: "IA desativada (sem GEMINI_API_KEY)", model, durationMs: 0 };
  }
  const client = new GoogleGenAI({ apiKey: key }) as GeminiClientLike;
  return geminiJsonWithClient<T>(client, model, system, user, opts);
}
