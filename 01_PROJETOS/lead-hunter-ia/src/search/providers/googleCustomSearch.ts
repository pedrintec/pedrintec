import { httpGet } from "../../utils/http.js";
import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";
import type { SearchProvider, SearchResult } from "../../types/index.js";

// Provedor Google Programmable Search / Custom Search JSON API - API OFICIAL.
// Limite gratuito: 100 queries/dia. Requer GOOGLE_CSE_KEY + GOOGLE_CSE_CX.
// Docs: https://developers.google.com/custom-search/v1/overview

export class GoogleCustomSearchProvider implements SearchProvider {
  readonly name = "google_cse" as const;

  async search(query: string, limit: number): Promise<SearchResult[]> {
    if (!config.GOOGLE_CSE_KEY || !config.GOOGLE_CSE_CX) {
      throw new Error("GOOGLE_CSE_KEY e/ou GOOGLE_CSE_CX não configurados no .env");
    }

    const results: SearchResult[] = [];
    // A API devolve até 10 por página; pagina via "start".
    for (let start = 1; results.length < limit && start <= 91; start += 10) {
      const url =
        "https://www.googleapis.com/customsearch/v1?" +
        new URLSearchParams({
          key: config.GOOGLE_CSE_KEY,
          cx: config.GOOGLE_CSE_CX,
          q: query,
          num: "10",
          start: String(start),
          gl: "br",
          hl: "pt-BR",
        }).toString();

      const res = await httpGet(url);
      let json: any;
      try {
        json = JSON.parse(res.data);
      } catch {
        logger.warn(`Google CSE: resposta não-JSON: ${res.data.slice(0, 200)}`);
        break;
      }
      if (json.error) {
        logger.warn(`Google CSE erro: ${JSON.stringify(json.error).slice(0, 200)}`);
        break;
      }
      const items = (json.items ?? []) as Array<any>;
      if (items.length === 0) break;
      for (const it of items) {
        results.push({
          title: String(it.title ?? ""),
          url: String(it.link ?? ""),
          snippet: String(it.snippet ?? ""),
          query,
        });
      }
    }
    return results.slice(0, limit);
  }
}
