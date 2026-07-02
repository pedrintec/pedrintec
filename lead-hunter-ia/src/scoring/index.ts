import type {
  AiOpportunity,
  ExtractedData,
  LeadTemperature,
  ScoreResult,
} from "../types/index.js";

// Lead scoring (0-100) + classificação (Quente/Morno/Frio) + detecção de
// oportunidades para agentes de IA. Heurística transparente e auditável:
// cada ponto somado vem acompanhado de uma "reason" (evidência).

// Nichos com alta demanda por atendimento (mais propensos a precisar de IA).
const HIGH_DEMAND_NICHE = [
  "clinic",
  "saúde",
  "saude",
  "odonto",
  "dentista",
  "estética",
  "estetica",
  "salão",
  "salao",
  "barbear",
  "restaurante",
  "delivery",
  "imobili",
  "advoc",
  "escola",
  "curso",
  "academia",
  "pet",
];

interface ScoreInput {
  data: ExtractedData;
  niche: string;
}

export function scoreLead({ data, niche }: ScoreInput): ScoreResult {
  let score = 0;
  const reasons: string[] = [];

  const has = (sig: string) => data.techSignals.includes(sig);
  const nicheLower = niche.toLowerCase();

  // +25 WhatsApp público -> alvo clássico para agente de WhatsApp
  if (data.whatsapp || has("tem-whatsapp")) {
    score += 25;
    reasons.push("Possui WhatsApp público (forte candidato a agente de WhatsApp).");
  }

  // +15 site simples/desatualizado -> baixa maturidade digital
  if (has("site-simples")) {
    score += 15;
    reasons.push("Site simples/aparentemente desatualizado (baixa automação).");
  }

  // +10 formulário de contato (atendimento manual via e-mail)
  if (has("tem-formulario")) {
    score += 10;
    reasons.push("Tem formulário de contato (atendimento provavelmente manual).");
  }

  // +20 AUSÊNCIA de chatbot/automação aparente -> oportunidade direta
  if (has("sem-chatbot")) {
    score += 20;
    reasons.push("Sem chatbot/automação aparente.");
  } else if (has("tem-chatbot")) {
    score -= 10;
    reasons.push("Já possui chatbot (oportunidade menor / upgrade).");
  }

  // +15 nicho de alta demanda por atendimento
  if (HIGH_DEMAND_NICHE.some((k) => nicheLower.includes(k))) {
    score += 15;
    reasons.push("Nicho com alta demanda por atendimento.");
  }

  // +10 redes sociais ativas (Instagram/LinkedIn)
  if (data.instagram || data.linkedin) {
    score += 10;
    reasons.push("Presença ativa em redes sociais.");
  }

  // +até 15 por sinais de intenção (agendamento, orçamento, etc.)
  const intentBonus = Math.min(15, data.signals.length * 4);
  if (intentBonus > 0) {
    score += intentBonus;
    reasons.push(`Sinais de atendimento/intenção: ${data.signals.join(", ")}.`);
  }

  // +5 se tem múltiplos canais (telefone + email)
  if (data.phones.length > 0 && data.emails.length > 0) {
    score += 5;
    reasons.push("Múltiplos canais de contato (telefone + e-mail).");
  }

  score = Math.max(0, Math.min(100, score));

  const temperature: LeadTemperature = score >= 70 ? "Quente" : score >= 40 ? "Morno" : "Frio";
  const opportunities = detectOpportunities(data, nicheLower);

  return { score, temperature, opportunities, reasons };
}

/** Detecta oportunidades específicas de agentes de IA com base nos sinais. */
export function detectOpportunities(data: ExtractedData, niche: string): AiOpportunity[] {
  const ops = new Set<AiOpportunity>();
  const sig = data.signals.join(" ");
  const hasWhats = !!data.whatsapp || data.techSignals.includes("tem-whatsapp");

  if (hasWhats) ops.add("Agente para WhatsApp");

  if (data.techSignals.includes("sem-chatbot")) {
    ops.add("Agente de atendimento 24h");
    ops.add("Agente de suporte");
  }

  if (/agend|consult|reserva|horário|horario/.test(sig)) {
    ops.add("Agente de agendamento");
  }
  if (/orçamento|orcamento|vend|delivery|pedido|cardápio|cardapio/.test(sig)) {
    ops.add("Agente de vendas");
    ops.add("Agente de qualificação de leads");
  }
  if (data.techSignals.includes("tem-formulario")) {
    ops.add("Agente de qualificação de leads");
  }
  if (/clinic|saúde|saude|odonto|estética|estetica|salão|salao|academia|pet/.test(niche)) {
    ops.add("Agente de recuperação de clientes");
  }

  // Garante ao menos uma oportunidade plausível.
  if (ops.size === 0) ops.add("Agente de atendimento 24h");

  return [...ops];
}
