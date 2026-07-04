import { describe, it, expect } from "vitest";
import { generateCommercialHook } from "../src/prospecting/commercialHookGenerator.js";
import { generateOutreachMessage } from "../src/prospecting/outreachMessageGenerator.js";
import type { Lead } from "../src/types/index.js";

function lead(p: Partial<Lead> = {}): Lead {
  return {
    companyName: "Clínica Sorriso",
    site: "clinicasorriso.com.br",
    city: "Goiânia",
    region: "GO",
    niche: "clínica odontológica",
    whatsapp: "5562999998888",
    sourceUrl: "",
    evidence: "",
    opportunities: ["Agente para WhatsApp", "Agente de agendamento"],
    score: 80,
    temperature: "Quente",
    collectedAt: "",
    websiteDiagnostic: {
      summary: "ok",
      findings: ["Não foi identificado chatbot visível."],
      risks: [],
      aiOpportunities: [],
    },
    ...p,
  };
}

describe("gancho comercial", () => {
  it("gera frase consultiva baseada em evidências", () => {
    const hook = generateCommercialHook(lead());
    expect(hook).toContain("agente de IA");
    expect(hook.length).toBeGreaterThan(20);
  });
});

describe("mensagem de abordagem", () => {
  it("inclui opção de opt-out", () => {
    const msg = generateOutreachMessage(lead());
    expect(msg.toLowerCase()).toContain("não envio mais mensagens");
  });
  it("adapta o contexto ao nicho de clínica", () => {
    const msg = generateOutreachMessage(lead({ niche: "clínica odontológica" }));
    expect(msg.toLowerCase()).toMatch(/clínic|paciente/);
  });
});
