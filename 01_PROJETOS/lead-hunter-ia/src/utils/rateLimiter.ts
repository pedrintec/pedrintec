import pLimit from "p-limit";
import { config } from "../config/index.js";

// Controle de concorrência global + atraso por host.
// Objetivo (conformidade/ética): não sobrecarregar servidores de terceiros.

const limit = pLimit(config.MAX_CONCURRENCY);

// Último acesso por host, para impor REQUEST_DELAY_MS entre chamadas ao mesmo host.
const lastHit = new Map<string, number>();

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Executa `fn` respeitando:
 *  - concorrência global (MAX_CONCURRENCY)
 *  - atraso mínimo por host (REQUEST_DELAY_MS)
 */
export async function withRateLimit<T>(url: string, fn: () => Promise<T>): Promise<T> {
  return limit(async () => {
    const host = hostOf(url);
    const now = Date.now();
    const last = lastHit.get(host) ?? 0;
    const wait = config.REQUEST_DELAY_MS - (now - last);
    if (wait > 0) await sleep(wait);
    lastHit.set(host, Date.now());
    return fn();
  });
}
