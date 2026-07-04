import robotsParser from "robots-parser";
import { config } from "../config/index.js";
import { httpGet } from "./http.js";
import { logger } from "./logger.js";
import { normalizeDomain } from "../normalization/index.js";
import { getRobotsCache, setRobotsCache } from "../database/repository.js";

// Verificação de robots.txt antes de raspar uma página (requisito de conformidade).
// Cacheia o robots.txt em memória (por host) e na tabela robots_cache (com TTL).

const cache = new Map<string, ReturnType<typeof robotsParser> | null>();

async function getRobots(url: string) {
  const { origin } = new URL(url);
  if (cache.has(origin)) return cache.get(origin) ?? null;

  const robotsUrl = `${origin}/robots.txt`;
  try {
    const res = await httpGet(robotsUrl, { timeout: 8000 });
    const parser = robotsParser(robotsUrl, res.data);
    cache.set(origin, parser);
    persistRobotsCache(origin, robotsUrl, parser);
    return parser;
  } catch {
    // Sem robots.txt acessível -> assume permitido (comportamento padrão da web).
    cache.set(origin, null);
    return null;
  }
}

/** Persiste na tabela robots_cache (observabilidade + TTL entre execuções). */
function persistRobotsCache(
  origin: string,
  robotsUrl: string,
  parser: ReturnType<typeof robotsParser>,
) {
  const domain = normalizeDomain(origin);
  if (!domain) return;
  try {
    if (getRobotsCache(domain)) return; // já há entrada válida (dentro do TTL)
    const allowedRoot = parser.isAllowed(`${origin}/`, config.USER_AGENT) !== false;
    const crawlSeconds = parser.getCrawlDelay(config.USER_AGENT);
    const crawlDelayMs = typeof crawlSeconds === "number" ? Math.round(crawlSeconds * 1000) : null;
    setRobotsCache(domain, allowedRoot, crawlDelayMs, robotsUrl, config.ROBOTS_CACHE_TTL_HOURS);
  } catch {
    /* cache de robots nunca deve quebrar o fluxo */
  }
}

/** Retorna true se for permitido raspar a URL para nosso User-Agent. */
export async function isAllowed(url: string): Promise<boolean> {
  if (!config.RESPECT_ROBOTS_TXT) return true;
  try {
    const robots = await getRobots(url);
    if (!robots) return true;
    const allowed = robots.isAllowed(url, config.USER_AGENT);
    if (allowed === false) {
      logger.warn(`robots.txt bloqueia: ${url}`);
    }
    return allowed !== false;
  } catch {
    return true;
  }
}
