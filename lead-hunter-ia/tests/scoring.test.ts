import { describe, it, expect } from "vitest";
import {
  computeScoreBreakdown,
  temperatureFromScore,
  priorityFromScore,
} from "../src/scoring/finalScore.js";
import type { ExtractedData } from "../src/types/index.js";

function data(p: Partial<ExtractedData> = {}): ExtractedData {
  return {
    phones: [],
    emails: [],
    signals: [],
    techSignals: [],
    rawTextSample: "",
    ...p,
  };
}

describe("temperatura e prioridade", () => {
  it("temperatura por faixa", () => {
    expect(temperatureFromScore(70)).toBe("Quente");
    expect(temperatureFromScore(40)).toBe("Morno");
    expect(temperatureFromScore(39)).toBe("Frio");
  });
  it("prioridade por faixa", () => {
    expect(priorityFromScore(80)).toBe("atacar_hoje");
    expect(priorityFromScore(60)).toBe("validar_manual");
    expect(priorityFromScore(40)).toBe("nutrir");
    expect(priorityFromScore(39)).toBe("descartar");
  });
});

describe("computeScoreBreakdown", () => {
  it("usa a fórmula ponderada 0.4/0.35/0.25", () => {
    const d = data({
      phones: ["(62) 3000-1234"],
      emails: ["a@b.com"],
      whatsapp: "5562999998888",
      instagram: "https://instagram.com/x",
      signals: ["agendamento", "orçamento"],
      techSignals: ["sem-chatbot", "site-simples", "tem-whatsapp", "tem-formulario", "tem-instagram"],
      rawTextSample: "atendimento e orçamento",
    });
    const r = computeScoreBreakdown({ data: d, niche: "clínica odontológica" });
    const expected = Math.round(r.fitScore * 0.4 + r.urgencyScore * 0.35 + r.accessScore * 0.25);
    expect(r.finalScore).toBe(expected);
    expect(r.finalScore).toBeGreaterThan(0);
    expect(r.evidences.length).toBeGreaterThan(0);
  });

  it("lead vazio gera score baixo", () => {
    const r = computeScoreBreakdown({ data: data(), niche: "" });
    expect(r.finalScore).toBeLessThan(40);
    expect(r.temperature).toBe("Frio");
  });
});
