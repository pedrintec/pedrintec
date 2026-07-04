import * as cheerio from "cheerio";
import { httpGet } from "../../utils/http.js";
import type { SearchProvider, SearchResult } from "../../types/index.js";

// DuckDuckGo — raspagem leve da página pública de resultados em HTML
// (html.duckduckgo.com/html/). Gratuito, sem chave, sem cota.
// Não é uma API oficial: DDG pode mudar o HTML a qualquer momento — por isso
// o parser é tolerante (ignora blocos que não casarem) e uma falha aqui
// derruba só este robô, não a busca inteira (modo multi segue com os outros).

const DDG_BASE = "https://html.duckduckgo.com/html/";

/** Extrai a URL real do link de redirecionamento do DDG (?uddg=<url-encoded>). */
export function unwrapDdgUrl(href: string): string {
  try {
    const full = href.startsWith("//") ? `https:${href}` : href;
    const uddg = new URL(full).searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : full;
  } catch {
    return href;
  }
}

export class DuckDuckGoProvider implements SearchProvider {
  readonly name = "duckduckgo" as const;

  async search(query: string, limit: number): Promise<SearchResult[]> {
    const url = `${DDG_BASE}?${new URLSearchParams({ q: query, kl: "br-pt" }).toString()}`;
    const res = await httpGet(url);
    // A DDG responde 200 numa página de resultados normal. Sob rate-limit ou
    // bloqueio anti-bot, já observamos HTTP 202 com a home genérica (sem
    // resultados) — sem checar isso, isso viraria silenciosamente "0
    // resultados" em vez de erro visível no log do modo multi.
    if (res.status !== 200) {
      throw new Error(`DuckDuckGo HTML HTTP ${res.status} (possível rate-limit/bloqueio)`);
    }

    const $ = cheerio.load(res.data);
    const results: SearchResult[] = [];
    $(".result__body").each((_, el) => {
      if (results.length >= limit) return false;
      const $el = $(el);
      const a = $el.find(".result__a").first();
      const title = a.text().trim();
      const href = a.attr("href");
      if (!title || !href) return;
      results.push({
        title,
        url: unwrapDdgUrl(href),
        snippet: $el.find(".result__snippet").first().text().trim(),
        query,
      });
    });
    return results;
  }
}
