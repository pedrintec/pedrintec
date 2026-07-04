import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import type { SearchInput, SearchProvider, SearchResult } from "../types/index.js";
import { buildDorks } from "./dorks.js";
import { SerpApiProvider } from "./providers/serpapi.js";
import { GoogleCustomSearchProvider } from "./providers/googleCustomSearch.js";
import { ManualProvider } from "./providers/manual.js";
import { SerperProvider, SerperPlacesProvider, MultiSearchProvider } from "./providers/serper.js";
import { ExaProvider } from "./providers/exa.js";
import { DuckDuckGoProvider } from "./providers/duckduckgo.js";

// Fábrica de provedor + orquestração das buscas (gera dorks, consulta, agrega).

export function getProvider(): SearchProvider {
  switch (config.SEARCH_PROVIDER) {
    case "serpapi":
      return new SerpApiProvider();
    case "google_cse":
      return new GoogleCustomSearchProvider();
    case "serper":
      return new SerperProvider();
    case "serper_places":
      return new SerperPlacesProvider();
    case "exa":
      return new ExaProvider();
    case "duckduckgo":
      return new DuckDuckGoProvider();
    case "multi":
      return buildMultiProvider();
    case "manual":
    default:
      return new ManualProvider();
  }
}

/** Nomes dos robôs que entrariam em ação no modo multi, dado o .env atual (sem instanciar nada). */
export function listActiveProviders(): string[] {
  // DuckDuckGo não exige chave — sempre entra no modo multi (robô gratuito garantido).
  const names: string[] = ["duckduckgo"];
  if (config.SERPAPI_KEY) names.push("serpapi");
  if (config.SERPER_API_KEY) names.push("serper", "serper_places");
  if (config.EXA_API_KEY) names.push("exa");
  if (config.GOOGLE_CSE_KEY && config.GOOGLE_CSE_CX) names.push("google_cse");
  return names;
}

/** Modo multi-robô: usa todos os provedores com chave configurada, em paralelo. */
function buildMultiProvider(): SearchProvider {
  // DuckDuckGo é gratuito e sem chave — sempre participa do multi-robô.
  const providers: SearchProvider[] = [new DuckDuckGoProvider()];
  if (config.SERPAPI_KEY) providers.push(new SerpApiProvider());
  if (config.SERPER_API_KEY) {
    providers.push(new SerperProvider());
    providers.push(new SerperPlacesProvider()); // empresas locais (telefone/endereço)
  }
  if (config.EXA_API_KEY) providers.push(new ExaProvider());
  if (config.GOOGLE_CSE_KEY && config.GOOGLE_CSE_CX) providers.push(new GoogleCustomSearchProvider());

  logger.info(`Modo multi-robô: ${providers.map((p) => p.name).join(" + ")}`);
  return new MultiSearchProvider(providers);
}

export interface RunSearchResult {
  provider: string;
  queries: string[];
  results: SearchResult[];
}

/** Executa todas as queries no provedor e devolve URLs únicas. */
export async function runSearch(input: SearchInput): Promise<RunSearchResult> {
  const provider = getProvider();
  const queries = buildDorks(input);
  logger.info(`Provedor de busca: ${provider.name} | ${queries.length} queries geradas`);

  const seen = new Set<string>();
  const results: SearchResult[] = [];

  // Distribui o limite de leads entre as queries.
  const perQuery = Math.max(3, Math.ceil(input.maxLeads / Math.max(queries.length, 1)));

  for (const q of queries) {
    if (results.length >= input.maxLeads * 3) break; // colhe um excedente p/ filtrar depois
    try {
      const r = await provider.search(q, perQuery);
      for (const item of r) {
        if (!item.url || seen.has(item.url)) continue;
        seen.add(item.url);
        results.push(item);
      }
    } catch (err) {
      logger.warn(`Falha na query "${q}": ${(err as Error).message}`);
    }
  }

  logger.success(`${results.length} URLs únicas coletadas das buscas.`);
  return { provider: provider.name, queries, results };
}
