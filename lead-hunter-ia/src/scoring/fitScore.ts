import type { ScoreEvidence } from "../types/index.js";
import { EvidenceBuilder } from "./scoreEvidence.js";

// Fit Comercial: mede se o NICHO tem dor real para agentes de IA.
// Baseado apenas no nicho informado (não depende de scraping).

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

interface NicheProfile {
  highVolume: RegExp;
  scheduling: RegExp;
  quoting: RegExp;
  support: RegExp;
  consultative: RegExp;
  b2cWhatsapp: RegExp;
}

const PROFILE: NicheProfile = {
  highVolume: /(clinic|saude|odonto|dentista|estetic|salao|barbear|restaurante|delivery|pizza|lanche|petshop|pet shop|academia|hotel|loja)/,
  scheduling: /(clinic|saude|odonto|dentista|estetic|salao|barbear|consult|fisio|psico|academia|hotel|spa|agenda)/,
  quoting: /(imobili|construc|reforma|advoc|contabil|seguro|corretor|grafic|marcenaria|serralh|orcament|cotac)/,
  support: /(software|tecnologia|provedor|internet|telecom|ti |suporte|assistencia|conserto)/,
  consultative: /(advoc|contabil|consultor|imobili|seguro|financ|invest|corretor|arquitet)/,
  b2cWhatsapp: /(loja|delivery|restaurante|estetic|salao|barbear|petshop|pet shop|moda|roupa|ecommerce|e-commerce|boutique)/,
};

export function fitScore(niche: string): { score: number; evidences: ScoreEvidence[] } {
  const n = norm(niche || "");
  const b = new EvidenceBuilder("fit");

  if (PROFILE.highVolume.test(n)) b.add(20, "Nicho com alto volume de atendimento");
  if (PROFILE.scheduling.test(n)) b.add(20, "Nicho com agendamento");
  if (PROFILE.quoting.test(n)) b.add(15, "Nicho com orçamento/cotação");
  if (PROFILE.support.test(n)) b.add(15, "Nicho com suporte/dúvidas recorrentes");
  if (PROFILE.consultative.test(n)) b.add(15, "Nicho com venda consultiva");
  if (PROFILE.b2cWhatsapp.test(n)) b.add(15, "Nicho B2C com alto contato via WhatsApp");

  // Piso: qualquer negócio tem alguma dor de atendimento.
  const r = b.result();
  if (r.evidences.length === 0) {
    return new EvidenceBuilder("fit").add(20, "Nicho genérico (dor de atendimento básica)").result();
  }
  return r;
}
