import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

// Cliente mínimo da API da Anthropic (Messages), sem SDK: fetch global (Node 20+).
// Env-gated: só é usado quando ANTHROPIC_API_KEY está no .env.
// Nunca lança: qualquer falha vira null e o chamador cai no caminho heurístico.

export function aiEnabled(): boolean {
  return Boolean(config.ANTHROPIC_API_KEY);
}

interface MessagesResponse {
  content?: Array<{ type: string; text?: string }>;
}

/** Pergunta ao Claude e espera um objeto JSON de volta (ou null em qualquer falha). */
export async function askClaudeJson<T>(system: string, user: string): Promise<T | null> {
  const key = config.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.ANTHROPIC_MODEL,
        max_tokens: 2048,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) {
      logger.warn(`Claude API respondeu ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const data = (await res.json()) as MessagesResponse;
    const text = (data.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
    return parseJsonLoose<T>(text);
  } catch (e) {
    logger.warn(`Claude API falhou: ${(e as Error).message}`);
    return null;
  }
}

/** Aceita JSON puro ou cercado por ```json ... ``` (modelos às vezes embrulham). */
export function parseJsonLoose<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1]! : text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
