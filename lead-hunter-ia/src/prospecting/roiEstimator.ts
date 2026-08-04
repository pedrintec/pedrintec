import type { Lead, RoiEstimate } from "../types/index.js";

// Simulador SIMPLES de ROI. Como não há dados reais, é sempre uma ESTIMATIVA
// com disclaimer explícito — para servir de argumento, não de promessa.

const DISCLAIMER =
  "Estimativa baseada em premissas genéricas. Deve ser validada com o cliente.";

// Premissas padrão (poderão ser parametrizadas por nicho no futuro).
const DEFAULT_CONTACTS_PER_MONTH = 100;
const DEFAULT_LOSS_RATE = 0.2; // 20% perdidos por demora/triagem
const DEFAULT_TICKET = 500; // valor médio por cliente (R$)

export function estimateRoiPotential(lead: Lead): RoiEstimate {
  const contacts = DEFAULT_CONTACTS_PER_MONTH;
  const lossRate = DEFAULT_LOSS_RATE;
  const ticket = DEFAULT_TICKET;
  const estimatedMonthlyLoss = Math.round(contacts * lossRate * ticket);

  const assumptions = [
    `~${contacts} contatos por mês`,
    `~${Math.round(lossRate * 100)}% perdidos por demora ou falta de triagem`,
    `ticket médio de R$ ${ticket.toLocaleString("pt-BR")}`,
  ];

  const narrative =
    `Se ${lead.companyName || "a empresa"} recebe cerca de ${contacts} contatos/mês e perde ` +
    `~${Math.round(lossRate * 100)}% por demora no atendimento, com ticket médio de R$ ${ticket}, ` +
    `a perda potencial estimada seria de R$ ${estimatedMonthlyLoss.toLocaleString("pt-BR")}/mês. ` +
    `Um agente de IA que responda na hora e qualifique os contatos pode recuperar parte dessa perda.`;

  return { disclaimer: DISCLAIMER, assumptions, estimatedMonthlyLoss, narrative };
}
