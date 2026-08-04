import axios, { type AxiosRequestConfig } from "axios";
import { config } from "../config/index.js";
import { logger } from "./logger.js";
import { sleep } from "./rateLimiter.js";

// Cliente HTTP central com:
//  - User-Agent identificado (ética)
//  - timeout
//  - retry controlado com backoff exponencial
// NÃO segue redirecionamentos infinitos e limita o tamanho de resposta.

export interface HttpResponse {
  status: number;
  data: string;
  finalUrl: string;
  contentType: string;
}

export async function httpGet(
  url: string,
  opts: AxiosRequestConfig = {},
): Promise<HttpResponse> {
  let attempt = 0;
  let lastErr: unknown;

  while (attempt <= config.MAX_RETRIES) {
    try {
      const res = await axios.get<string>(url, {
        timeout: config.REQUEST_TIMEOUT_MS,
        responseType: "text",
        maxRedirects: 5,
        maxContentLength: 5 * 1024 * 1024, // 5MB
        validateStatus: (s) => s >= 200 && s < 400,
        headers: {
          "User-Agent": config.USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
        ...opts,
      });

      return {
        status: res.status,
        data: typeof res.data === "string" ? res.data : String(res.data ?? ""),
        finalUrl: res.request?.res?.responseUrl ?? url,
        contentType: String(res.headers["content-type"] ?? ""),
      };
    } catch (err) {
      lastErr = err;
      attempt += 1;
      if (attempt > config.MAX_RETRIES) break;
      const backoff = 500 * 2 ** (attempt - 1);
      logger.debug(`HTTP falhou (${attempt}/${config.MAX_RETRIES}) ${url} - retry em ${backoff}ms`);
      await sleep(backoff);
    }
  }

  throw lastErr;
}
