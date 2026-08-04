import { describe, it, expect } from "vitest";
import {
  buildApproachMessage,
  buildSdrCadence,
  classifyReply,
  localDateInDays,
  proposeMeetingSlots,
} from "../src/prospecting/sdr.js";
import { buildHeuristicReport, digitalMaturity } from "../src/prospecting/researcher.js";

// Pipeline Pesquisador/SDR IA — caminho heurístico (100% local, sem API).

const SRC = {
  companyName: "Barbearia Alfa",
  niche: "Barbearia",
  city: "Goiânia",
  region: "GO",
  site: null,
  instagram: "@barbearia.alfa",
  whatsapp: "5562999990000",
  opportunities: ["Agente para WhatsApp"],
  urgencyScore: 70,
  accessScore: 55,
  websiteDiagnostic: { summary: "", findings: ["Não foi identificado chatbot"] },
};

describe("Pesquisador — relatório heurístico", () => {
  it("gera todas as seções pedidas, com dor do mapa por nicho", () => {
    const r = buildHeuristicReport(SRC);
    expect(r.resumo_da_empresa).toContain("Barbearia Alfa");
    expect(r.possiveis_dores[0]).toBe("Agenda manual e baixo ticket médio");
    expect(r.oportunidades_de_automacao).toContain("Agenda automatizada + upsell de produtos");
    expect(r.publico_alvo.length).toBeGreaterThan(10);
    expect(r.servicos.length).toBeGreaterThan(0);
    expect(r.possiveis_problemas.length).toBeGreaterThan(0);
    expect(r.possibilidade_uso_ia.length).toBeGreaterThan(0);
    expect(["Baixa", "Média", "Alta"]).toContain(r.nivel_maturidade_digital.label);
    expect(r.gerado_por).toBe("heuristica");
  });

  it("maturidade digital fica em 0-100", () => {
    const m = digitalMaturity({ companyName: "X", urgencyScore: 100, accessScore: 0 });
    expect(m.score).toBeGreaterThanOrEqual(0);
    expect(m.score).toBeLessThanOrEqual(100);
  });
});

describe("SDR — cadência e agendamento", () => {
  it("cadência D0/D+2/D+5 com prioridades corretas", () => {
    const from = new Date(2026, 6, 1); // 01/07/2026 (local)
    const tasks = buildSdrCadence("Barbearia Alfa", from);
    expect(tasks).toHaveLength(3);
    expect(tasks[0]).toMatchObject({ due: "2026-07-01", priority: "Alta" });
    expect(tasks[1]).toMatchObject({ due: "2026-07-03", priority: "Alta" });
    expect(tasks[2]).toMatchObject({ due: "2026-07-06", priority: "Média" });
  });

  it("localDateInDays usa data LOCAL (não UTC)", () => {
    const from = new Date(2026, 6, 1, 23, 30); // 23h30 local — UTC já seria dia 2
    expect(localDateInDays(1, from)).toBe("2026-07-02");
  });

  it("horários propostos caem em dias úteis", () => {
    const sexta = new Date(2026, 6, 3); // sexta-feira 03/07/2026
    const [s1, s2] = proposeMeetingSlots(sexta);
    for (const s of [s1, s2]) {
      expect(s).toMatch(/às/);
      expect(s).not.toMatch(/sábado|domingo/);
    }
  });

  it("abordagem menciona a empresa e oferece 2 horários", () => {
    const r = buildHeuristicReport(SRC);
    const msg = buildApproachMessage(SRC, r, "Gravity", new Date(2026, 6, 1));
    expect(msg).toContain("Barbearia Alfa");
    expect(msg).toContain("Gravity");
    expect(msg).toMatch(/às .*? ou .*às/s);
  });
});

describe("SDR — qualificador de respostas (heurístico)", () => {
  it("recusa explícita → sem_interesse + Perdido + opt-out sugerido", () => {
    const r = classifyReply("Não tenho interesse, remova meu contato por favor");
    expect(r.classificacao).toBe("sem_interesse");
    expect(r.nova_etapa).toBe("Perdido");
    expect(r.sugerir_opt_out).toBe(true);
  });

  it("interesse → Reunião com sugestão de horários", () => {
    const r = classifyReply("Opa, tenho interesse sim! Quanto custa?");
    expect(r.classificacao).toBe("interessado");
    expect(r.nova_etapa).toBe("Reunião");
    expect(r.sugestao_resposta).toMatch(/às/);
  });

  it("adiamento → follow-up em 7 dias, sem mudar etapa", () => {
    const r = classifyReply("Agora não dá, me procure mês que vem");
    expect(r.classificacao).toBe("depois");
    expect(r.nova_etapa).toBeNull();
    expect(r.followup_em_dias).toBe(7);
  });

  it("dúvida neutra → mantém etapa e devolve resposta explicativa", () => {
    const r = classifyReply("Quem são vocês? De onde pegaram meu contato?");
    expect(r.classificacao).toBe("duvida");
    expect(r.nova_etapa).toBeNull();
    expect(r.sugestao_resposta.length).toBeGreaterThan(30);
  });

  it("pergunta de compra ('como funciona?') conta como interesse", () => {
    const r = classifyReply("Como funciona esse serviço de vocês?");
    expect(r.classificacao).toBe("interessado");
  });

  it("recusa vence adiamento e interesse na ordem de prioridade", () => {
    const r = classifyReply("não quero, talvez depois, mas não me mande mais nada");
    expect(r.classificacao).toBe("sem_interesse");
  });
});
