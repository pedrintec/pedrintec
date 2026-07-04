import type { ExtractedData, WebsiteDiagnostic } from "../types/index.js";
import { detectOpportunities } from "../scoring/index.js";

// Diagnóstico automático do site: descreve sinais e oportunidades para IA.
// Apenas a partir de evidências reais extraídas (não inventa nada).

export function generateWebsiteDiagnostic(
  data: ExtractedData,
  niche = "",
): WebsiteDiagnostic {
  const findings: string[] = [];
  const risks: string[] = [];
  const has = (s: string) => data.techSignals.includes(s);
  const text = data.rawTextSample.toLowerCase();
  const hasWhats = !!data.whatsapp || has("tem-whatsapp");

  if (hasWhats) findings.push("WhatsApp aparece como canal de contato.");
  if (data.phones.length) findings.push("Telefone público disponível.");
  if (data.emails.length) findings.push("E-mail público disponível.");
  if (data.instagram) findings.push("Presença no Instagram.");

  if (has("tem-chatbot")) {
    findings.push("Já possui algum chatbot/automação de chat.");
  } else {
    findings.push("Não foi identificado chatbot visível.");
    risks.push("Atendimento provavelmente manual, sujeito a demora na resposta.");
  }

  if (!/agendamento online|agende online|booking|marcar online/.test(text)) {
    findings.push("Não foi encontrado agendamento online.");
  }
  if (!/faq|perguntas frequentes|d[úu]vidas frequentes/.test(text)) {
    findings.push("Sem FAQ visível (dúvidas tendem a virar mensagens diretas).");
  }
  if (has("tem-formulario")) {
    findings.push("Possui formulário de contato.");
  }
  if (has("site-simples")) {
    findings.push("Site com estrutura simples/possivelmente desatualizada.");
    risks.push("Baixa maturidade digital pode indicar processos manuais.");
  }
  if (data.signals.length) {
    findings.push(`Sinais de intenção no texto: ${data.signals.slice(0, 6).join(", ")}.`);
  }

  const aiOpportunities = detectOpportunities(data, niche);

  const summary = hasWhats
    ? "WhatsApp é um canal de contato e não há automação aparente — há espaço para um agente de IA que faça a triagem e o primeiro atendimento."
    : "Atendimento aparentemente manual e sem automação visível — há espaço para um agente de IA de atendimento e qualificação.";

  return { summary, findings, risks, aiOpportunities };
}
