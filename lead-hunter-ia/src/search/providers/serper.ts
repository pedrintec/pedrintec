import axios from "axios";
import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";
import type { SearchProvider, SearchResult } from "../../types/index.js";

// Provedor Serper (https://serper.dev) — API de busca do Google (POST + X-API-KEY).
// É um "robô" independente da SerpAPI. Dois endpoints úteis:
//   /search -> resultados orgânicos (title/link/snippet)
//   /places -> empresas locais com telefone, endereço, site, rating (ótimo p/ leads)

const SERPER_BASE = "https://google.serper.dev";

async function serperRequest(path: string, body: Record<string, unknown>): Promise<any> {
  if (!config.SERPER_API_KEY) throw new Error("SERPER_API_KEY não configurada no .env");
  const res = await axios.post(`${SERPER_BASE}${path}`, body, {
    timeout: config.REQUEST_TIMEOUT_MS,
    headers: { "X-API-KEY": config.SERPER_API_KEY, "Content-Type": "application/json" },
    validateStatus: () => true,
  });
  if (res.status < 200 || res.status >= 300) {
    const msg = typeof res.data === "object" ? JSON.stringify(res.data).slice(0, 200) : String(res.data).slice(0, 200);
    throw new Error(`Serper ${path} HTTP ${res.status}: ${msg}`);
  }
  return res.data;
}

/** Serper /search — resultados orgânicos do Google. */
export class SerperProvider implements SearchProvider {
  readonly name = "serper" as const;
  async search(query: string, limit: number): Promise<SearchResult[]> {
    const data = await serperRequest("/search", {
      q: query,
      gl: "br",
      hl: "pt-br",
      num: Math.min(Math.max(limit, 10), 100),
    });
    const organic = (data?.organic ?? []) as Array<any>;
    return organic.slice(0, limit).map((r) => ({
      title: String(r.title ?? ""),
      url: String(r.link ?? ""),
      snippet: String(r.snippet ?? ""),
      query,
    }));
  }
}

/**
 * Serper /places — empresas locais (telefone/endereço/site/rating).
 * Para entrar no pipeline (que raspa páginas), usamos o `website` como URL.
 * Lugares sem site são ignorados aqui (sem página para analisar).
 */
export class SerperPlacesProvider implements SearchProvider {
  readonly name = "serper_places" as const;
  async search(query: string, limit: number): Promise<SearchResult[]> {
    const data = await serperRequest("/places", { q: query, gl: "br", hl: "pt-br" });
    const places = (data?.places ?? []) as Array<any>;
    return places
      .filter((p) => p.website)
      .slice(0, limit)
      .map((p) => ({
        title: String(p.title ?? ""),
        url: String(p.website ?? ""),
        snippet: [p.address, p.phoneNumber, p.rating ? `★${p.rating} (${p.ratingCount ?? 0})` : ""]
          .filter(Boolean)
          .join(" · "),
        query,
      }));
  }
}

/**
 * Multi-robô: dispara vários provedores EM PARALELO numa mesma query e mescla
 * os resultados (URLs únicas). A deduplicação final de leads continua no pipeline.
 */
export class MultiSearchProvider implements SearchProvider {
  readonly name = "multi" as const;
  constructor(private readonly providers: SearchProvider[]) {}

  async search(query: string, limit: number): Promise<SearchResult[]> {
    const settled = await Promise.allSettled(this.providers.map((p) => p.search(query, limit)));
    const seen = new Set<string>();
    const merged: SearchResult[] = [];
    settled.forEach((s, i) => {
      const prov = this.providers[i]!.name;
      if (s.status === "fulfilled") {
        for (const item of s.value) {
          if (!item.url || seen.has(item.url)) continue;
          seen.add(item.url);
          merged.push(item);
        }
      } else {
        logger.warn(`[multi] provedor ${prov} falhou: ${s.reason?.message ?? s.reason}`);
      }
    });
    return merged;
  }
}
