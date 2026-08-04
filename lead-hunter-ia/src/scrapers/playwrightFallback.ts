import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

// Fallback opcional com Playwright para páginas que dependem de JS.
// Import é DINÂMICO e tolerante: se "playwright" não estiver instalado,
// retornamos null sem quebrar o pipeline.
//
// Para habilitar:
//   npm i playwright
//   npx playwright install chromium
//   USE_PLAYWRIGHT_FALLBACK=true no .env

export async function renderWithPlaywright(url: string): Promise<string | null> {
  if (!config.USE_PLAYWRIGHT_FALLBACK) return null;
  try {
    // Dependência opcional: o cast para string evita que o TypeScript exija
    // o pacote em tempo de compilação (pode não estar instalado).
    const specifier = "playwright";
    const mod: any = await import(specifier as string);
    const chromium = mod.chromium;
    const browser = await chromium.launch({ headless: true });
    try {
      const ctx = await browser.newContext({ userAgent: config.USER_AGENT });
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: config.REQUEST_TIMEOUT_MS });
      // Pequena espera para conteúdo dinâmico.
      await page.waitForTimeout(1500);
      const html = await page.content();
      return html;
    } finally {
      await browser.close();
    }
  } catch (err) {
    logger.warn(`Playwright indisponível/falhou (${url}): ${(err as Error).message}`);
    return null;
  }
}
