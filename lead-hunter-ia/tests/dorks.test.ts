import { describe, it, expect } from "vitest";
import { buildDorks, isSafeDork } from "../src/search/dorks.js";
import type { SearchInput, SearchType } from "../src/types/index.js";

// §4 — A blocklist de segurança é inegociável: nenhum dork gerado pode mirar
// login, credenciais, áreas administrativas, arquivos sensíveis ou vazamentos.

const BLOCKED = [
  /password/i,
  /\bsenha\b/i,
  /\blogin\b/i,
  /\badmin\b/i,
  /filetype:\s*(sql|env)/i,
  /index of/i,
  /\.env\b/i,
  /\bbackup\b/i,
  /\bdump\b/i,
];

function input(p: Partial<SearchInput> = {}): SearchInput {
  return {
    city: "Goiânia",
    region: "GO",
    niche: "Clínica Odontológica",
    maxLeads: 20,
    searchType: "completa",
    ...p,
  };
}

describe("isSafeDork (blocklist §4)", () => {
  it("rejeita termos sensíveis", () => {
    expect(isSafeDork('"clínica" "Goiânia" login')).toBe(false);
    expect(isSafeDork('inurl:admin exemplo')).toBe(false);
    expect(isSafeDork('filetype:sql "senha"')).toBe(false);
    expect(isSafeDork("index of /backup")).toBe(false);
    expect(isSafeDork('"clínica" "Goiânia" password')).toBe(false);
  });
  it("aceita dorks comerciais legítimos", () => {
    expect(isSafeDork('"clínica" "Goiânia" "WhatsApp"')).toBe(true);
    expect(isSafeDork('"clínica" "Goiânia" site:instagram.com')).toBe(true);
    expect(isSafeDork('"clínica" "Goiânia" "orçamento"')).toBe(true);
  });
});

describe("buildDorks nunca gera dork inseguro", () => {
  const types: SearchType[] = ["rapida", "completa", "somente-sites"];
  for (const searchType of types) {
    it(`tipo ${searchType}: saída 100% segura`, () => {
      const dorks = buildDorks(input({ searchType }));
      expect(dorks.length).toBeGreaterThan(0);
      expect(dorks.every(isSafeDork)).toBe(true);
      for (const d of dorks) for (const re of BLOCKED) expect(re.test(d)).toBe(false);
    });
  }

  it("mesmo com entrada adversária, remove dorks perigosos", () => {
    const dorks = buildDorks(input({ niche: "clínica login admin", city: "senha backup" }));
    expect(dorks.every(isSafeDork)).toBe(true);
    for (const d of dorks) for (const re of BLOCKED) expect(re.test(d)).toBe(false);
  });
});
