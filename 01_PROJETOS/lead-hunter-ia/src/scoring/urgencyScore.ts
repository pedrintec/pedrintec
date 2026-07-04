import type { ExtractedData, ScoreEvidence } from "../types/index.js";
import { EvidenceBuilder } from "./scoreEvidence.js";

// Urgência Digital: sinais de oportunidade (baixa automação aparente).
// Baseado nos dados extraídos do site.

export function urgencyScore(data: ExtractedData): { score: number; evidences: ScoreEvidence[] } {
  const b = new EvidenceBuilder("urgency");
  const has = (s: string) => data.techSignals.includes(s);
  const text = data.rawTextSample.toLowerCase();

  if (has("sem-chatbot")) b.add(20, "Sem chatbot aparente");
  if (has("site-simples")) b.add(20, "Site simples/desatualizado");
  if (!/faq|perguntas frequentes|d[úu]vidas frequentes/.test(text))
    b.add(10, "Não possui FAQ visível");
  if (!/agendamento online|agende online|marcar online|booking/.test(text))
    b.add(15, "Não possui agendamento online");
  if (has("tem-whatsapp")) b.add(15, "Usa WhatsApp como canal");
  if (has("tem-formulario")) b.add(10, "Tem formulário de contato (atendimento manual)");
  if (data.signals.some((s) => /orcamento|orçamento|agendamento|suporte/.test(s)))
    b.add(10, "Texto menciona orçamento/agendamento/suporte");

  if (has("tem-chatbot")) b.add(-10, "Já possui chatbot (oportunidade menor)");

  return b.result();
}
