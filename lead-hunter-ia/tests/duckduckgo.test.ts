import { describe, it, expect } from "vitest";
import * as cheerio from "cheerio";
import { unwrapDdgUrl } from "../src/search/providers/duckduckgo.js";

// DuckDuckGo é um robô gratuito (raspagem do HTML público de resultados, sem
// chave/cota). Sem infraestrutura de mock de rede no projeto, testamos os
// dois pontos que quebram silenciosamente se a DDG mudar o formato:
// (1) o decodificador do link de redirecionamento e (2) o parser de um bloco
// de resultado real (capturado ao vivo em 2026-07-04).

describe("unwrapDdgUrl", () => {
  it("decodifica o link de redirecionamento //duckduckgo.com/l/?uddg=...", () => {
    const href =
      "//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.vitaeodontologia.com.br%2F&rut=abc123";
    expect(unwrapDdgUrl(href)).toBe("https://www.vitaeodontologia.com.br/");
  });

  it("devolve o próprio href se não houver uddg (sem quebrar)", () => {
    expect(unwrapDdgUrl("https://example.com/sem-redirect")).toBe("https://example.com/sem-redirect");
  });

  it("devolve o próprio href se a URL for inválida (sem lançar)", () => {
    expect(() => unwrapDdgUrl("não é uma url")).not.toThrow();
  });
});

describe("parser de bloco de resultado (fixture real de 2026-07-04)", () => {
  // Bloco real capturado de html.duckduckgo.com/html/?q=clinica+odontologica+goiania
  const FIXTURE = `
    <div class="result results_links results_links_deep web-result ">
      <div class="links_main links_deep result__body">
        <h2 class="result__title">
          <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.guiatelefone.com%2Fempresas%2Fgoiania&amp;rut=xyz">10 MELHORES Clínicas Odontológicas em Goiânia, GO</a>
        </h2>
        <div class="result__extras">
          <div class="result__extras__url">
            <a class="result__url" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.guiatelefone.com%2Fempresas%2Fgoiania&amp;rut=xyz">www.guiatelefone.com/empresas/goiania</a>
          </div>
        </div>
        <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.guiatelefone.com%2Fempresas%2Fgoiania&amp;rut=xyz">10 MELHORES <b>Clínicas</b> <b>Odontológicas</b> em <b>Goiânia</b>, GO.</a>
      </div>
    </div>
  `;

  it("extrai título, URL real (decodificada) e snippet do bloco", () => {
    const $ = cheerio.load(FIXTURE);
    const el = $(".result__body").first();
    const a = el.find(".result__a").first();
    const title = a.text().trim();
    const url = unwrapDdgUrl(a.attr("href")!);
    const snippet = el.find(".result__snippet").first().text().trim();

    expect(title).toBe("10 MELHORES Clínicas Odontológicas em Goiânia, GO");
    expect(url).toBe("https://www.guiatelefone.com/empresas/goiania");
    expect(snippet).toContain("Clínicas Odontológicas em Goiânia");
    expect(snippet).not.toContain("<b>"); // cheerio .text() já remove as tags de destaque
  });
});
