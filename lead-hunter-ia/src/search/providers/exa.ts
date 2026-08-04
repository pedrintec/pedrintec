import axios from "axios";
import { config } from "../../config/index.js";
import type { SearchProvider, SearchResult } from "../../types/index.js";

// Exa (https://exa.ai) — motor de busca neural voltado a agentes de IA.
// Robô adicional do modo multi: complementa SerpAPI/Serper com um índice
// diferente (bom para achar páginas que buscadores tradicionais não rankeiam).
// Contrato: POST https://api.exa.ai/search, header x-api-key, body { query }.

const EXA_BASE = "https://api.exa.ai";

interface ExaResult {
  title?: string;
  url?: string;
  highlights?: string[];
}

export class ExaProvider implements SearchProvider {
  readonly name = "exa" as const;

  async search(query: string, limit: number): Promise<SearchResult[]> {
    if (!config.EXA_API_KEY) throw new Error("EXA_API_KEY não configurada no .env");
    const res = await axios.post(
      `${EXA_BASE}/search`,
      {
        query,
        type: "auto",
        numResults: Math.min(Math.max(limit, 1), 100),
        contents: { highlights: true },
      },
      {
        timeout: config.REQUEST_TIMEOUT_MS,
        headers: { "x-api-key": config.EXA_API_KEY, "content-type": "application/json" },
        validateStatus: () => true,
      },
    );
    if (res.status < 200 || res.status >= 300) {
      const msg =
        typeof res.data === "object" ? JSON.stringify(res.data).slice(0, 200) : String(res.data).slice(0, 200);
      throw new Error(`Exa /search HTTP ${res.status}: ${msg}`);
    }
    const results = (res.data?.results ?? []) as ExaResult[];
    return results.slice(0, limit).map((r) => ({
      title: String(r.title ?? ""),
      url: String(r.url ?? ""),
      snippet: (r.highlights ?? []).join(" … "),
      query,
    }));
  }
}
