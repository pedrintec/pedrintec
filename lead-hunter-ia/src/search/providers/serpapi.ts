import { httpGet } from "../../utils/http.js";
import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";
import type { SearchProvider, SearchResult } from "../../types/index.js";

// Provedor SerpAPI (https://serpapi.com) - API OFICIAL de resultados de busca.
// Vantagem: não viola ToS do Google (a SerpAPI faz o trabalho com seus contratos).

export class SerpApiProvider implements SearchProvider {
  readonly name = "serpapi" as const;

  async search(query: string, limit: number): Promise<SearchResult[]> {
    if (!config.SERPAPI_KEY) {
      throw new Error("SERPAPI_KEY não configurada no .env");
    }
    const url =
      "https://serpapi.com/search.json?" +
      new URLSearchParams({
        q: query,
        engine: "google",
        google_domain: "google.com.br",
        gl: "br",
        hl: "pt-br",
        num: String(Math.min(limit, 20)),
        api_key: config.SERPAPI_KEY,
      }).toString();

    const res = await httpGet(url);
    let json: any;
    try {
      json = JSON.parse(res.data);
    } catch {
      logger.warn(`SerpAPI: resposta não-JSON: ${res.data.slice(0, 200)}`);
      return [];
    }
    if (json.error) {
      logger.warn(`SerpAPI erro: ${json.error}`);
      return [];
    }

    const organic = (json.organic_results ?? []) as Array<any>;
    return organic.slice(0, limit).map((r) => ({
      title: String(r.title ?? ""),
      url: String(r.link ?? ""),
      snippet: String(r.snippet ?? ""),
      query,
    }));
  }
}
