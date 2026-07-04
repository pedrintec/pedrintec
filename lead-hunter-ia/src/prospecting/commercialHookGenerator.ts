import type { Lead } from "../types/index.js";

// Gera um gancho comercial consultivo a partir das EVIDÊNCIAS do lead.
// Regras: não prometer resultado garantido, não afirmar sem evidência,
// linguagem comercial simples, tom consultivo, adaptado ao nicho.

export function generateCommercialHook(lead: Lead): string {
  const parts: string[] = [];
  const hasWhats = !!lead.whatsapp;
  const diag = lead.websiteDiagnostic;

  const subject = lead.companyName ? `A empresa` : `O negócio`;
  const evidências: string[] = [];

  if (hasWhats) evidências.push("possui WhatsApp público");
  if (lead.instagram) evidências.push("mantém presença ativa no Instagram");
  if (diag?.findings.some((f) => /formulário/i.test(f)))
    evidências.push("usa formulário de contato");
  if (diag?.findings.some((f) => /não foi identificado chatbot/i.test(f)))
    evidências.push("não apresenta chatbot visível");
  if (diag?.findings.some((f) => /agendamento/i.test(f)))
    evidências.push("não possui agendamento online aparente");

  if (evidências.length) {
    parts.push(`${subject} ${joinPt(evidências)}.`);
  }

  const ops = (lead.opportunities ?? []).slice(0, 3).map((o) => o.toLowerCase());
  if (ops.length) {
    parts.push(
      `Existe oportunidade para implementar um agente de IA que ajude com ${joinPt(
        ops.map((o) => o.replace(/^agente (de |para |)/, "")),
      )}, qualificando interessados antes do atendimento humano.`,
    );
  } else {
    parts.push(
      "Existe oportunidade para um agente de IA que responda dúvidas e organize o primeiro atendimento.",
    );
  }

  return parts.join(" ");
}

/** Junta itens em português: "a, b e c". */
function joinPt(items: string[]): string {
  const arr = items.filter(Boolean);
  if (arr.length <= 1) return arr.join("");
  return `${arr.slice(0, -1).join(", ")} e ${arr[arr.length - 1]}`;
}
