import type { SearchProvider, SearchResult } from "../../types/index.js";
import { googleSearchUrl } from "../dorks.js";
import { logger } from "../../utils/logger.js";

// Provedor "manual": NÃO consulta nenhuma API e NÃO raspa o Google
// (isso violaria os Termos de Uso). Em vez disso, ele apenas devolve
// as URLs de busca prontas para você abrir no navegador e, se quiser,
// colar as URLs de empresas encontradas para análise.
//
// É o modo padrão quando você ainda não tem chave de API (SerpAPI/Google CSE).
export class ManualProvider implements SearchProvider {
  readonly name = "manual" as const;

  async search(query: string): Promise<SearchResult[]> {
    const url = googleSearchUrl(query);
    logger.info(`🔎 [manual] Abra no navegador: ${url}`);
    // Não retorna "resultados de empresa" reais — apenas a própria query/URL,
    // que o pipeline trata como informativo (não vira lead automaticamente).
    return [
      {
        title: `[BUSCA MANUAL] ${query}`,
        url,
        snippet:
          "Modo manual: abra a URL, copie os sites das empresas e use o modo de análise direta de URLs.",
        query,
      },
    ];
  }
}
