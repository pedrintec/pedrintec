import { httpGet } from "../utils/http.js";
import { withRateLimit } from "../utils/rateLimiter.js";
import { isAllowed } from "../utils/robots.js";
import { logger } from "../utils/logger.js";
import type { ExtractedData } from "../types/index.js";
import { extractFromHtml } from "./extract.js";
import { renderWithPlaywright } from "./playwrightFallback.js";
import { recordScrapeLog } from "../database/repository.js";
import { normalizeDomain } from "../normalization/index.js";

function logScrape(
  url: string,
  success: boolean,
  extra: { statusCode?: number; errorMessage?: string; robotsAllowed?: boolean; durationMs?: number },
) {
  try {
    recordScrapeLog({ url, domain: normalizeDomain(url) ?? "", success, ...extra });
  } catch {
    /* logging de scraping nunca deve quebrar o pipeline */
  }
}

// Orquestra a análise de uma página pública:
//  1. Checa robots.txt
//  2. Baixa via HTTP (com rate limit, UA, timeout, retry)
//  3. Se o HTML parecer "vazio" (SPA) e Playwright estiver habilitado, renderiza
//  4. Extrai os dados

export interface PageAnalysis {
  url: string;
  status: "ok" | "blocked" | "error" | "skipped";
  data?: ExtractedData;
  notes?: string;
}

/** Hosts que NÃO devem ser raspados como "lead" (agregadores/redes). */
const SKIP_HOSTS = [
  "google.",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "twitter.com",
  "x.com",
  "whatsapp.com",
  "wa.me",
  "wikipedia.org",
  "tripadvisor.",
  "ifood.com",
  "doctoralia.",
  "bookings.",
  "google.com",
];

function shouldSkip(url: string): boolean {
  try {
    const host = new URL(url).host.toLowerCase();
    return SKIP_HOSTS.some((h) => host.includes(h));
  } catch {
    return true;
  }
}

export async function analyzePage(url: string): Promise<PageAnalysis> {
  if (shouldSkip(url)) {
    return { url, status: "skipped", notes: "Host agregador/rede social (não é site de empresa)" };
  }

  if (!(await isAllowed(url))) {
    logScrape(url, false, { robotsAllowed: false, errorMessage: "Bloqueado por robots.txt" });
    return { url, status: "blocked", notes: "Bloqueado por robots.txt" };
  }

  const t0 = Date.now();
  try {
    const res = await withRateLimit(url, () => httpGet(url));
    if (!res.contentType.includes("html") && res.contentType !== "") {
      logScrape(url, true, {
        statusCode: res.status,
        robotsAllowed: true,
        durationMs: Date.now() - t0,
        errorMessage: `não-HTML (${res.contentType})`,
      });
      return { url, status: "skipped", notes: `Conteúdo não-HTML (${res.contentType})` };
    }

    let html = res.data;
    let data = extractFromHtml(html, res.finalUrl);

    // Se quase nada foi extraído, tenta renderizar com Playwright (SPA).
    const sparse = data.phones.length === 0 && data.emails.length === 0 && !data.whatsapp;
    if (sparse) {
      const rendered = await renderWithPlaywright(url);
      if (rendered) {
        html = rendered;
        data = extractFromHtml(html, res.finalUrl);
      }
    }

    logScrape(res.finalUrl, true, {
      statusCode: res.status,
      robotsAllowed: true,
      durationMs: Date.now() - t0,
    });
    return { url: res.finalUrl, status: "ok", data };
  } catch (err) {
    logger.debug(`Erro ao analisar ${url}: ${(err as Error).message}`);
    logScrape(url, false, { robotsAllowed: true, durationMs: Date.now() - t0, errorMessage: (err as Error).message });
    return { url, status: "error", notes: (err as Error).message };
  }
}
