import { normalizeCompanyName } from "./normalizeCompanyName.js";

// Similaridade de strings (coeficiente de Dice sobre bigramas), 0..1.
export function similarity(a: string, b: string): number {
  const x = a.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const y = b.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      m.set(bg, (m.get(bg) ?? 0) + 1);
    }
    return m;
  };
  const ma = bigrams(x);
  const mb = bigrams(y);
  let overlap = 0;
  for (const [bg, count] of ma) overlap += Math.min(count, mb.get(bg) ?? 0);
  return (2 * overlap) / (x.length - 1 + (y.length - 1));
}

/** Compara nomes de empresa já normalizados (ignora LTDA, acentos, etc.). */
export function companyNameSimilarity(a: string, b: string): number {
  return similarity(normalizeCompanyName(a), normalizeCompanyName(b));
}
