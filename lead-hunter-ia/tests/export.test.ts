import { describe, it, expect } from "vitest";
import { readFileSync, rmSync } from "node:fs";
import { exportJson } from "../src/exporters/index.js";
import type { Lead } from "../src/types/index.js";

function lead(p: Partial<Lead>): Lead {
  return {
    companyName: "Empresa",
    site: "x.com",
    city: "Goiânia",
    region: "GO",
    niche: "x",
    sourceUrl: "",
    evidence: "",
    opportunities: [],
    score: 50,
    temperature: "Morno",
    collectedAt: "",
    ...p,
  };
}

describe("exportação e opt-out", () => {
  it("ignora leads com opt-out por padrão", () => {
    const leads = [
      lead({ companyName: "Ativo" }),
      lead({ companyName: "Saiu", optOutAt: new Date().toISOString() }),
    ];
    const file = exportJson(leads, "test-optout", false);
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Lead[];
    rmSync(file, { force: true });
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.companyName).toBe("Ativo");
  });

  it("inclui opt-out quando explicitamente pedido", () => {
    const leads = [
      lead({ companyName: "Ativo" }),
      lead({ companyName: "Saiu", optOutAt: new Date().toISOString() }),
    ];
    const file = exportJson(leads, "test-optout", true);
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Lead[];
    rmSync(file, { force: true });
    expect(parsed).toHaveLength(2);
  });
});
