import type {
  CommercialPriority,
  ExtractedData,
  LeadTemperature,
  ScoreBreakdown,
} from "../types/index.js";
import { fitScore } from "./fitScore.js";
import { urgencyScore } from "./urgencyScore.js";
import { accessScore } from "./accessScore.js";

// Score final = combinação ponderada dos três blocos.
// Pesos: fit 0.40, urgência 0.35, acesso 0.25.

export function temperatureFromScore(score: number): LeadTemperature {
  if (score >= 70) return "Quente";
  if (score >= 40) return "Morno";
  return "Frio";
}

export function priorityFromScore(score: number): CommercialPriority {
  if (score >= 80) return "atacar_hoje";
  if (score >= 60) return "validar_manual";
  if (score >= 40) return "nutrir";
  return "descartar";
}

export interface ComputeScoreInput {
  data: ExtractedData;
  niche: string;
}

export function computeScoreBreakdown({ data, niche }: ComputeScoreInput): ScoreBreakdown {
  const fit = fitScore(niche);
  const urgency = urgencyScore(data);
  const access = accessScore(data);

  const finalScore = Math.round(
    fit.score * 0.4 + urgency.score * 0.35 + access.score * 0.25,
  );

  return {
    fitScore: fit.score,
    urgencyScore: urgency.score,
    accessScore: access.score,
    finalScore,
    temperature: temperatureFromScore(finalScore),
    priority: priorityFromScore(finalScore),
    evidences: [...fit.evidences, ...urgency.evidences, ...access.evidences],
  };
}
