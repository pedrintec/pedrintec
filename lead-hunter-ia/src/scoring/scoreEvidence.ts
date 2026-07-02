import type { ScoreEvidence, ScoreType } from "../types/index.js";

// Acumulador de evidências de pontuação (mantém o score auditável).
export class EvidenceBuilder {
  private items: ScoreEvidence[] = [];
  private total = 0;

  constructor(private readonly scoreType: ScoreType) {}

  add(points: number, signal: string, evidence?: string): this {
    this.items.push({ scoreType: this.scoreType, signal, points, evidence });
    this.total += points;
    return this;
  }

  /** Score limitado a 0..100 e a lista de evidências. */
  result(): { score: number; evidences: ScoreEvidence[] } {
    return { score: Math.max(0, Math.min(100, this.total)), evidences: this.items };
  }
}
