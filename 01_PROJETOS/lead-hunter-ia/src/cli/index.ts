import { input, number, select, checkbox, confirm } from "@inquirer/prompts";
import { Command } from "commander";
import Table from "cli-table3";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import type { Lead, SearchInput, SearchType } from "../types/index.js";
import { runPipeline } from "../pipeline.js";
import { buildDorks, googleSearchUrl } from "../search/dorks.js";
import { exportAll } from "../exporters/index.js";

// Interface CLI interativa. Aceita flags (modo não-interativo) OU pergunta.

const program = new Command();
program
  .name("lead-hunter-ia")
  .description("Busca local e ética de leads comerciais com potencial para agentes de IA")
  .option("--city <cidade>", "Cidade")
  .option("--region <estado>", "Estado ou país")
  .option("--niche <nicho>", "Nicho")
  .option("--max <n>", "Quantidade máxima de leads", (v) => Number.parseInt(v, 10))
  .option("--type <tipo>", "Tipo de busca: completa | rapida | somente-sites")
  .option("--export <formatos>", "Exportar automaticamente: csv,json,xlsx")
  .option("--min-score <n>", "Exibir/exportar apenas leads com score >= n", (v) => Number.parseInt(v, 10))
  .option("--include-opt-out", "Incluir leads com opt-out nas exportações")
  .option("--yes", "Não fazer perguntas interativas (usa flags/padrões)");

function banner() {
  console.log("");
  console.log("  🎯  \x1b[1mLEAD HUNTER IA\x1b[0m — caçador local de leads (MVP)");
  console.log(`  Provedor de busca: \x1b[36m${config.SEARCH_PROVIDER}\x1b[0m`);
  console.log("  Uso ético: apenas dados comerciais públicos. Respeita robots.txt.\n");
}

async function collectInput(opts: Record<string, unknown>): Promise<SearchInput> {
  const nonInteractive = Boolean(opts.yes);

  const city =
    (opts.city as string) ||
    (nonInteractive ? "" : await input({ message: "Cidade:", validate: req }));

  const region =
    (opts.region as string) ||
    (nonInteractive
      ? config.DEFAULT_COUNTRY
      : await input({ message: "Estado ou país:", default: config.DEFAULT_COUNTRY }));

  const niche =
    (opts.niche as string) ||
    (nonInteractive ? "" : await input({ message: "Nicho (ex.: clínica odontológica):", validate: req }));

  const maxLeads =
    (opts.max as number) ||
    (nonInteractive
      ? 20
      : (await number({ message: "Quantidade máxima de leads:", default: 20 })) ?? 20);

  const searchType: SearchType =
    (opts.type as SearchType) ||
    (nonInteractive
      ? "completa"
      : await select<SearchType>({
          message: "Tipo de busca:",
          choices: [
            { name: "Completa (mais queries, mais ampla)", value: "completa" },
            { name: "Rápida (poucas queries de alto sinal)", value: "rapida" },
            { name: "Somente sites institucionais", value: "somente-sites" },
          ],
        }));

  if (!city || !niche) {
    logger.error("Cidade e nicho são obrigatórios (use --city e --niche no modo --yes).");
    process.exit(1);
  }

  return { city, region, niche, maxLeads, searchType };
}

const req = (v: string) => (v.trim().length > 0 ? true : "Campo obrigatório");

function printDorks(inputData: SearchInput) {
  const dorks = buildDorks(inputData);
  console.log("\n  📋 \x1b[1mQueries (Google Dorks) geradas:\x1b[0m");
  dorks.forEach((q, i) => {
    console.log(`   ${String(i + 1).padStart(2, " ")}. ${q}`);
    if (config.SEARCH_PROVIDER === "manual") {
      console.log(`       ↳ ${googleSearchUrl(q)}`);
    }
  });
  console.log("");
}

function printLeadsTable(leads: Lead[]) {
  if (leads.length === 0) {
    logger.warn("Nenhum lead encontrado nesta execução.");
    return;
  }
  const PRIO: Record<string, string> = {
    atacar_hoje: "⚡ Atacar hoje",
    validar_manual: "Validar",
    nutrir: "Nutrir",
    descartar: "Descartar",
  };
  const table = new Table({
    head: ["#", "Empresa", "Tel/WhatsApp", "Score", "Temp.", "Prioridade", "Gancho comercial"],
    colWidths: [4, 22, 17, 7, 8, 14, 40],
    wordWrap: true,
    style: { head: ["cyan"] },
  });
  leads.forEach((l, i) => {
    const heat = l.temperature === "Quente" ? "🔥" : l.temperature === "Morno" ? "🌤️" : "❄️";
    table.push([
      i + 1,
      l.companyName,
      l.whatsapp || l.phone || "-",
      String(l.finalScore ?? l.score),
      `${heat} ${l.temperature}`,
      PRIO[l.commercialPriority ?? ""] ?? "-",
      (l.commercialHook ?? l.opportunities.slice(0, 2).join(", ")).slice(0, 160),
    ]);
  });
  console.log(table.toString());
}

async function maybeExport(leads: Lead[], opts: Record<string, unknown>) {
  if (leads.length === 0) return;

  const includeOptOut = Boolean(opts.includeOptOut);

  // Modo flag: --export csv,json,xlsx
  if (opts.export) {
    const formats = String(opts.export)
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((f): f is "csv" | "json" | "xlsx" => ["csv", "json", "xlsx"].includes(f));
    if (formats.length) await exportAll(leads, formats, "leads", includeOptOut);
    return;
  }

  if (opts.yes) return;

  const wants = await confirm({ message: "Deseja exportar os resultados?", default: true });
  if (!wants) return;

  const formats = await checkbox<"csv" | "json" | "xlsx">({
    message: "Formatos:",
    choices: [
      { name: "CSV", value: "csv", checked: true },
      { name: "JSON", value: "json" },
      { name: "XLSX", value: "xlsx" },
    ],
  });
  if (formats.length) {
    const files = await exportAll(leads, formats, "leads", includeOptOut);
    console.log("\n  💾 Arquivos gerados:");
    files.forEach((f) => console.log(`   - ${f}`));
  }
}

async function main() {
  program.parse(process.argv);
  const opts = program.opts();

  banner();

  const inputData = await collectInput(opts);
  printDorks(inputData);

  logger.info("Iniciando coleta... (isso pode levar alguns minutos)\n");
  const result = await runPipeline(inputData);

  // Filtro opcional por score mínimo (--min-score).
  const minScore = opts.minScore as number | undefined;
  const shown =
    typeof minScore === "number" && Number.isFinite(minScore)
      ? result.leads.filter((l) => (l.finalScore ?? l.score) >= minScore)
      : result.leads;

  console.log("");
  printLeadsTable(shown);

  console.log(
    `\n  📊 Resumo: ${result.stats.queries} queries | ${result.stats.urls} URLs | ` +
      `${result.stats.analyzed} analisadas | ${result.stats.leads} leads novos salvos | ` +
      `${(result.stats.durationMs / 1000).toFixed(1)}s (search #${result.searchId})\n`,
  );

  await maybeExport(shown, opts);

  logger.success("Concluído. ✨");
  process.exit(0);
}

main().catch((err) => {
  // Tratamento amigável de Ctrl+C nos prompts do Inquirer.
  if (err?.name === "ExitPromptError") {
    console.log("\nCancelado pelo usuário.");
    process.exit(0);
  }
  logger.error(err);
  process.exit(1);
});
