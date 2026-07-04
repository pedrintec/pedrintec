import type { ExtractedData } from "../types/index.js";

// Confiança do dado (0..100): quão confiável é o conjunto de contatos extraído.
// Heurística baseada na ORIGEM/forma como o dado apareceu na página.

export function calculateDataConfidence(data: ExtractedData): number {
  const scores: number[] = [];
  const has = (s: string) => data.techSignals.includes(s);

  if (data.whatsapp || has("tem-whatsapp")) scores.push(95); // botão/link oficial de WhatsApp
  if (data.emails.length) scores.push(80); // e-mail público (mailto/contato)
  if (data.phones.length) scores.push(80); // telefone público (tel:/rodapé)
  if (data.instagram) scores.push(80);
  if (data.linkedin) scores.push(80);

  if (scores.length === 0) return 0;
  // Média ponderada simples: usa o melhor sinal com leve reforço por múltiplos canais.
  const best = Math.max(...scores);
  const bonus = Math.min(10, (scores.length - 1) * 3);
  return Math.min(100, best + bonus);
}
