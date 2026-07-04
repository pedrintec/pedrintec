import { logger } from "./utils/logger.js";
import { config } from "./config/index.js";
import type { Lead, SearchInput } from "./types/index.js";
import { runSearch } from "./search/index.js";
import { analyzePage } from "./scrapers/index.js";
import { detectOpportunities } from "./scoring/index.js";
import { computeScoreBreakdown } from "./scoring/finalScore.js";
import { generateWebsiteDiagnostic } from "./enrichment/websiteDiagnostic.js";
import { generateCommercialHook } from "./prospecting/commercialHookGenerator.js";
import { generateOutreachMessage } from "./prospecting/outreachMessageGenerator.js";
import { estimateRoiPotential } from "./prospecting/roiEstimator.js";
import { calculateDataConfidence } from "./compliance/dataConfidence.js";
import {
  createSearch,
  dedupeLeads,
  recordExecution,
  recordSource,
  saveLeads,
} from "./database/repository.js";
import { rootDomain } from "./utils/text.js";

// Pipeline completo: busca -> análise -> score -> dedup -> persistência.

export interface PipelineResult {
  searchId: number;
  provider: string;
  leads: Lead[];
  stats: { queries: number; urls: number; analyzed: number; leads: number; durationMs: number };
}

/** Evento de progresso emitido durante a execução (usado pelo painel via SSE). */
export interface PipelineEvent {
  type: "status" | "queries" | "urls" | "lead" | "done";
  message?: string;
  progress?: number; // 0-100
  data?: unknown;
}

type OnEvent = (e: PipelineEvent) => void;

export async function runPipeline(
  input: SearchInput,
  onEvent: OnEvent = () => {},
): Promise<PipelineResult> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  // 1) Buscas
  onEvent({ type: "status", message: "Gerando consultas e buscando URLs...", progress: 5 });
  const { provider, queries, results } = await runSearch(input);
  const searchId = createSearch(input, provider);
  onEvent({ type: "queries", message: `${queries.length} consultas geradas`, data: queries });
  onEvent({
    type: "urls",
    message: `${results.length} URLs encontradas`,
    progress: 15,
    data: results.length,
  });

  if (provider === "manual") {
    logger.warn(
      "Modo MANUAL ativo: nenhuma página é raspada automaticamente. " +
        "Veja as URLs de busca acima, configure SerpAPI/Google CSE no .env para coleta automática.",
    );
  }

  // 2) Análise das páginas (em série respeitando rate limit interno)
  const collected: Lead[] = [];
  let analyzed = 0;

  for (const r of results) {
    if (collected.length >= input.maxLeads) break;
    // No modo manual o "resultado" é só a URL de busca; não analisamos.
    if (provider === "manual") {
      recordSource(searchId, r.url, r.query, "skipped", "modo manual");
      continue;
    }

    const analysis = await analyzePage(r.url);
    analyzed += 1;
    recordSource(searchId, analysis.url, r.query, analysis.status, analysis.notes ?? "");
    onEvent({
      type: "status",
      message: `Analisando ${analyzed}/${results.length}: ${analysis.url.slice(0, 60)}`,
      progress: Math.min(90, 15 + Math.round((analyzed / Math.max(results.length, 1)) * 75)),
    });

    if (analysis.status !== "ok" || !analysis.data) continue;
    const d = analysis.data;

    // Precisa de ao menos 1 canal de contato para virar lead.
    const hasContact = d.phones.length > 0 || d.emails.length > 0 || !!d.whatsapp;
    if (!hasContact) {
      logger.debug(`Sem contato, ignorando: ${analysis.url}`);
      continue;
    }

    // Novo scoring de 3 blocos + diagnóstico + argumentos comerciais.
    const breakdown = computeScoreBreakdown({ data: d, niche: input.niche });
    const opportunities = detectOpportunities(d, input.niche);
    const diagnostic = generateWebsiteDiagnostic(d, input.niche);
    const confidence = calculateDataConfidence(d);
    const nowIso = new Date().toISOString();

    const lead: Lead = {
      companyName: d.companyName || rootDomain(analysis.url),
      site: analysis.url,
      city: input.city,
      region: input.region,
      niche: input.niche,
      phone: d.phones[0],
      whatsapp: d.whatsapp,
      email: d.emails[0],
      instagram: d.instagram,
      linkedin: d.linkedin,
      address: d.address,
      sourceUrl: r.url,
      evidence: breakdown.evidences.map((e) => e.signal).join("; "),
      opportunities,
      score: breakdown.finalScore,
      temperature: breakdown.temperature,
      collectedAt: nowIso,
      // --- prospecção consultiva ---
      country: config.DEFAULT_COUNTRY,
      sourceProvider: provider,
      sourceQuery: r.query,
      dataOrigin: provider,
      legalBasis: config.DEFAULT_LEGAL_BASIS,
      dataConfidence: confidence,
      commercialStatus: "novo",
      fitScore: breakdown.fitScore,
      urgencyScore: breakdown.urgencyScore,
      accessScore: breakdown.accessScore,
      finalScore: breakdown.finalScore,
      commercialPriority: breakdown.priority,
      scoreEvidences: breakdown.evidences,
      websiteDiagnostic: diagnostic,
      firstSeenAt: nowIso,
      lastSeenAt: nowIso,
      lastCheckedAt: nowIso,
    };
    // Argumentos comerciais (dependem do lead já montado).
    lead.commercialHook = generateCommercialHook(lead);
    if (config.GENERATE_OUTREACH_MESSAGES) lead.outreachMessage = generateOutreachMessage(lead);
    if (config.GENERATE_ROI_ESTIMATE) lead.roiEstimate = estimateRoiPotential(lead);

    collected.push(lead);
    logger.info(
      `+ Lead: ${lead.companyName} (score ${lead.score}, ${lead.temperature}, ${breakdown.priority})`,
    );
    onEvent({ type: "lead", message: lead.companyName, data: lead });
  }

  // 3) Dedup interno + ordenação por score
  const deduped = dedupeLeads(collected).sort((a, b) => b.score - a.score);

  // 4) Persistência (dedup também contra o banco)
  const saved = saveLeads(searchId, deduped);

  const durationMs = Date.now() - t0;
  recordExecution(searchId, {
    totalQueries: queries.length,
    totalUrls: results.length,
    totalLeads: saved.length,
    durationMs,
    startedAt,
    finishedAt: new Date().toISOString(),
  });

  const result: PipelineResult = {
    searchId,
    provider,
    leads: deduped, // retorna todos os desta execução (mesmo os já existentes no banco)
    stats: {
      queries: queries.length,
      urls: results.length,
      analyzed,
      leads: saved.length,
      durationMs,
    },
  };
  onEvent({ type: "done", message: "Concluído", progress: 100, data: result });
  return result;
}
