import { describe, it, expect } from "vitest";
import { leadsAreDuplicate, dedupeLeads } from "../src/normalization/dedup.js";
import type { Lead } from "../src/types/index.js";

function lead(p: Partial<Lead>): Lead {
  return {
    companyName: "Empresa",
    site: "",
    city: "Goiânia",
    region: "GO",
    niche: "x",
    sourceUrl: "",
    evidence: "",
    opportunities: [],
    score: 0,
    temperature: "Frio",
    collectedAt: "",
    ...p,
  };
}

describe("deduplicação", () => {
  it("detecta duplicado por domínio (mesmo site, formas diferentes)", () => {
    const a = lead({ site: "https://www.x.com.br/contato" });
    const b = lead({ site: "http://x.com.br" });
    expect(leadsAreDuplicate(a, b)).toBe(true);
  });

  it("detecta duplicado por telefone normalizado", () => {
    const a = lead({ companyName: "A", phone: "(62) 99999-8888" });
    const b = lead({ companyName: "B", phone: "+5562999998888" });
    expect(leadsAreDuplicate(a, b)).toBe(true);
  });

  it("detecta duplicado por WhatsApp x telefone cruzados", () => {
    const a = lead({ companyName: "A", whatsapp: "5562999998888" });
    const b = lead({ companyName: "B", phone: "62 99999-8888" });
    expect(leadsAreDuplicate(a, b)).toBe(true);
  });

  it("não marca empresas diferentes como duplicadas", () => {
    const a = lead({ companyName: "Alpha", site: "alpha.com", phone: "6230001111" });
    const b = lead({ companyName: "Beta", site: "beta.com", phone: "6230002222" });
    expect(leadsAreDuplicate(a, b)).toBe(false);
  });

  it("dedupeLeads remove repetidos da lista", () => {
    const list = [
      lead({ companyName: "A", site: "x.com.br" }),
      lead({ companyName: "A2", site: "https://www.x.com.br/" }),
      lead({ companyName: "C", site: "c.com" }),
    ];
    expect(dedupeLeads(list)).toHaveLength(2);
  });
});
