import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import ExcelJS from "exceljs";
import type { Lead } from "../types/index.js";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

// Exportadores: CSV, JSON e XLSX. Os arquivos vão para ./exports.
// Por padrão, leads com opt-out NÃO são exportados (LGPD).

const EXPORT_DIR = resolve(process.cwd(), "exports");

function ensureDir() {
  if (!existsSync(EXPORT_DIR)) mkdirSync(EXPORT_DIR, { recursive: true });
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

const PRIORITY_LABEL: Record<string, string> = {
  atacar_hoje: "Atacar hoje",
  validar_manual: "Validar manual",
  nutrir: "Nutrir",
  descartar: "Descartar",
};
const STATUS_LABEL: Record<string, string> = {
  novo: "Novo",
  validado: "Validado",
  contatado: "Contatado",
  respondeu: "Respondeu",
  reuniao_marcada: "Reunião marcada",
  sem_interesse: "Sem interesse",
  cliente: "Cliente",
  descartado: "Descartado",
};

// Cada coluna tem um "getter" que formata o valor (objetos viram texto legível).
const COLUMNS: Array<{ header: string; get: (l: Lead) => string }> = [
  { header: "Empresa", get: (l) => l.companyName },
  { header: "Site", get: (l) => l.site ?? "" },
  { header: "Cidade", get: (l) => l.city ?? "" },
  { header: "Estado/País", get: (l) => l.region ?? "" },
  { header: "Nicho", get: (l) => l.niche ?? "" },
  { header: "Telefone", get: (l) => l.phone ?? "" },
  { header: "WhatsApp", get: (l) => l.whatsapp ?? "" },
  { header: "E-mail", get: (l) => l.email ?? "" },
  { header: "Instagram", get: (l) => l.instagram ?? "" },
  { header: "LinkedIn", get: (l) => l.linkedin ?? "" },
  { header: "Endereço", get: (l) => l.address ?? "" },
  { header: "Fit Comercial", get: (l) => str(l.fitScore) },
  { header: "Urgência Digital", get: (l) => str(l.urgencyScore) },
  { header: "Acesso Comercial", get: (l) => str(l.accessScore) },
  { header: "Score Final", get: (l) => str(l.finalScore ?? l.score) },
  { header: "Temperatura", get: (l) => l.temperature },
  { header: "Prioridade Comercial", get: (l) => PRIORITY_LABEL[l.commercialPriority ?? ""] ?? "" },
  { header: "Status Comercial", get: (l) => STATUS_LABEL[l.commercialStatus ?? "novo"] ?? "" },
  { header: "Oportunidades IA", get: (l) => (l.opportunities ?? []).join(" | ") },
  { header: "Diagnóstico do Site", get: (l) => l.websiteDiagnostic?.summary ?? "" },
  { header: "Gancho Comercial", get: (l) => l.commercialHook ?? "" },
  { header: "Mensagem de Abordagem", get: (l) => l.outreachMessage ?? "" },
  { header: "Estimativa de ROI", get: (l) => l.roiEstimate?.narrative ?? "" },
  {
    header: "Evidências",
    get: (l) =>
      (l.scoreEvidences ?? []).map((e) => `${e.signal} (${e.points >= 0 ? "+" : ""}${e.points})`).join(" | ") ||
      l.evidence ||
      "",
  },
  { header: "Confiança do Dado", get: (l) => str(l.dataConfidence) },
  { header: "Fonte (URL)", get: (l) => l.sourceUrl ?? "" },
  { header: "Origem do Dado", get: (l) => l.dataOrigin ?? l.sourceProvider ?? "" },
  { header: "Base Legal", get: (l) => l.legalBasis ?? "" },
  { header: "Coletado em", get: (l) => l.collectedAt ?? "" },
  { header: "Última Verificação", get: (l) => l.lastCheckedAt ?? "" },
];

function str(v: number | undefined | null): string {
  return v == null ? "" : String(v);
}

/** Remove leads com opt-out, salvo se explicitamente incluídos. */
function applyOptOut(leads: Lead[], includeOptOut: boolean): Lead[] {
  return includeOptOut ? leads : leads.filter((l) => !l.optOutAt);
}

export function exportJson(
  leads: Lead[],
  baseName = "leads",
  includeOptOut = config.EXPORT_INCLUDE_OPT_OUT,
): string {
  ensureDir();
  const data = applyOptOut(leads, includeOptOut);
  const file = resolve(EXPORT_DIR, `${baseName}-${timestamp()}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  logger.success(`JSON exportado: ${file} (${data.length} leads)`);
  return file;
}

export function exportCsv(
  leads: Lead[],
  baseName = "leads",
  includeOptOut = config.EXPORT_INCLUDE_OPT_OUT,
): string {
  ensureDir();
  const data = applyOptOut(leads, includeOptOut);
  const file = resolve(EXPORT_DIR, `${baseName}-${timestamp()}.csv`);
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const header = COLUMNS.map((c) => esc(c.header)).join(",");
  const rows = data.map((l) => COLUMNS.map((c) => esc(c.get(l))).join(","));
  // BOM para abrir corretamente no Excel (acentos).
  writeFileSync(file, "﻿" + [header, ...rows].join("\r\n"), "utf8");
  logger.success(`CSV exportado: ${file} (${data.length} leads)`);
  return file;
}

export async function exportXlsx(
  leads: Lead[],
  baseName = "leads",
  includeOptOut = config.EXPORT_INCLUDE_OPT_OUT,
): Promise<string> {
  ensureDir();
  const data = applyOptOut(leads, includeOptOut);
  const file = resolve(EXPORT_DIR, `${baseName}-${timestamp()}.xlsx`);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Lead Hunter IA";
  const ws = wb.addWorksheet("Leads", {
    views: [{ state: "frozen", ySplit: 1 }], // congela o cabeçalho
  });
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.header, width: columnWidth(c.header) }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF111727" },
  };
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

  for (const lead of data) {
    const row: Record<string, string> = {};
    for (const c of COLUMNS) row[c.header] = c.get(lead);
    const added = ws.addRow(row);
    // Destaque: quente / atacar hoje.
    if (lead.temperature === "Quente") {
      added.getCell("Temperatura").fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFE2E5" },
      };
    }
    if (lead.commercialPriority === "atacar_hoje") {
      added.getCell("Prioridade Comercial").font = { bold: true, color: { argb: "FFC0392B" } };
    }
  }

  // Filtro automático em todas as colunas.
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };

  await wb.xlsx.writeFile(file);
  logger.success(`XLSX exportado: ${file} (${data.length} leads)`);
  return file;
}

function columnWidth(header: string): number {
  if (["Gancho Comercial", "Mensagem de Abordagem", "Estimativa de ROI", "Diagnóstico do Site", "Evidências"].includes(header))
    return 50;
  if (["Site", "Fonte (URL)", "E-mail"].includes(header)) return 30;
  return 20;
}

export async function exportAll(
  leads: Lead[],
  formats: Array<"csv" | "json" | "xlsx">,
  baseName = "leads",
  includeOptOut = config.EXPORT_INCLUDE_OPT_OUT,
): Promise<string[]> {
  const out: string[] = [];
  for (const f of formats) {
    if (f === "csv") out.push(exportCsv(leads, baseName, includeOptOut));
    else if (f === "json") out.push(exportJson(leads, baseName, includeOptOut));
    else if (f === "xlsx") out.push(await exportXlsx(leads, baseName, includeOptOut));
  }
  return out;
}
