import { describe, it, expect } from "vitest";
import {
  normalizeDomain,
  normalizePhone,
  normalizeEmail,
  normalizeInstagram,
  normalizeCompanyName,
} from "../src/normalization/index.js";

describe("normalizeDomain", () => {
  it("remove protocolo, www, caminho e query", () => {
    expect(normalizeDomain("https://www.empresa.com.br/contato?x=1")).toBe("empresa.com.br");
    expect(normalizeDomain("HTTP://Empresa.COM.br")).toBe("empresa.com.br");
    expect(normalizeDomain("empresa.com.br/")).toBe("empresa.com.br");
  });
  it("trata vazio/nulo", () => {
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain(null)).toBeNull();
    expect(normalizeDomain(undefined)).toBeNull();
  });
});

describe("normalizePhone (BR)", () => {
  it("prefixa +55 em DDD+número", () => {
    expect(normalizePhone("(62) 99999-8888")).toBe("+5562999998888");
    expect(normalizePhone("62 3000-1234")).toBe("+556230001234");
  });
  it("mantém DDI 55 já presente", () => {
    expect(normalizePhone("+55 62 99999-8888")).toBe("+5562999998888");
    expect(normalizePhone("5562999998888")).toBe("+5562999998888");
  });
  it("não inventa dígitos para entradas curtas", () => {
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

describe("normalizeEmail", () => {
  it("normaliza e valida", () => {
    expect(normalizeEmail("  Contato@Empresa.com.BR ")).toBe("contato@empresa.com.br");
    expect(normalizeEmail("(joao@x.com)")).toBe("joao@x.com");
  });
  it("rejeita inválidos e assets", () => {
    expect(normalizeEmail("não-email")).toBeNull();
    expect(normalizeEmail("logo@2x.png")).toBeNull();
  });
});

describe("normalizeInstagram", () => {
  it("extrai o handle de várias formas", () => {
    expect(normalizeInstagram("@Empresa")).toBe("empresa");
    expect(normalizeInstagram("https://www.instagram.com/empresa/")).toBe("empresa");
    expect(normalizeInstagram("instagram.com/Empresa_Oficial")).toBe("empresa_oficial");
  });
  it("ignora reservados/ inválidos", () => {
    expect(normalizeInstagram("https://instagram.com/p")).toBeNull();
    expect(normalizeInstagram("")).toBeNull();
  });
});

describe("normalizeCompanyName", () => {
  it("remove sufixos societários e acentos", () => {
    expect(normalizeCompanyName("Clínica Sorriso LTDA")).toBe("clinica sorriso");
    expect(normalizeCompanyName("ACME S/A")).toBe("acme");
  });
});
