import { describe, expect, it } from "vitest";
import { buildGeminiContents, geminiJsonWithClient, type GeminiClientLike } from "../src/integrations/geminiService.js";

describe("Gemini commercial AI adapter", () => {
  it("builds a JSON-only prompt with system and user context", () => {
    const contents = buildGeminiContents("Siga o contrato.", "Analise este lead.");

    expect(contents).toContain("Instrucoes do sistema:");
    expect(contents).toContain("Siga o contrato.");
    expect(contents).toContain("Solicitacao:");
    expect(contents).toContain("Analise este lead.");
    expect(contents).toContain("Retorne somente JSON valido.");
  });

  it("calls Gemini with JSON response config and parses the text response", async () => {
    const calls: unknown[] = [];
    const client: GeminiClientLike = {
      models: {
        generateContent: async (params: unknown) => {
          calls.push(params);
          return { text: '{"score":82,"priority":"alta"}' };
        },
      },
    };

    const result = await geminiJsonWithClient<{ score: number; priority: string }>(
      client,
      "gemini-test",
      "Sistema",
      "Usuario",
      { temperature: 0.2, maxTokens: 512, timeoutMs: 1000 },
    );

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ score: 82, priority: "alta" });
    expect(result.model).toBe("gemini-test");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      model: "gemini-test",
      config: {
        temperature: 0.2,
        maxOutputTokens: 512,
        responseMimeType: "application/json",
      },
    });
  });

  it("returns a controlled error when Gemini does not return parseable JSON", async () => {
    const client: GeminiClientLike = {
      models: {
        generateContent: async () => ({ text: "sem json aqui" }),
      },
    };

    const result = await geminiJsonWithClient(client, "gemini-test", "Sistema", "Usuario", { timeoutMs: 1000 });

    expect(result.ok).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error).toBe("JSON invalido retornado pela IA");
  });
});
