import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

// Integração opcional com n8n (§6c). Disparada na mudança de etapa do funil.
// Ativada apenas se N8N_WEBHOOK_URL estiver definido no .env.
// Fire-and-forget: nunca lança nem bloqueia a operação de banco.

export interface StageChangePayload {
  lead_id: number;
  name: string;
  old_stage: string;
  new_stage: string;
  score: number;
  temp: string;
  at: string;
}

/**
 * POST no webhook n8n com o payload da mudança de etapa.
 * Se a integração estiver desativada (sem URL), não faz nada.
 */
export function fireStageChangeWebhook(payload: StageChangePayload): void {
  const url = config.N8N_WEBHOOK_URL;
  if (!url) return; // integração desativada

  // fetch global (Node 20+). Fire-and-forget: erros só viram log.
  // Timeout de 8s: um n8n travado não pode segurar promises indefinidamente.
  void fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  })
    .then((r) => {
      if (!r.ok) logger.warn(`Webhook n8n respondeu ${r.status} para lead #${payload.lead_id}.`);
      else logger.debug(`Webhook n8n enviado: lead #${payload.lead_id} → ${payload.new_stage}.`);
    })
    .catch((e) => logger.warn(`Webhook n8n falhou: ${(e as Error).message}`));
}
