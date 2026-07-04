// Mapa fixo dor digital → oferta recomendada por nicho (spec §3.2).
// Espelha o mapa do frontend (public/index.html) — manter os dois em sincronia.

export interface PainOffer {
  pain: string;
  offer: string;
}

export const NICHE_PAIN_OFFER: Record<string, PainOffer> = {
  "Clínica Odontológica": {
    pain: "Pouca captação digital, agenda com horários ociosos",
    offer: "Funil de captação + automação de agendamento",
  },
  Estética: {
    pain: "Baixa recompra e ausência de funil de retorno",
    offer: "Programa de recompra e nutrição via WhatsApp",
  },
  "Energia Solar": {
    pain: "Leads desqualificados e ciclo de venda longo",
    offer: "Qualificação por SDR + CRM Gravity",
  },
  Advocacia: {
    pain: "Pouca presença digital e site sem conversão",
    offer: "Site institucional + landing pages especializadas",
  },
  Academia: {
    pain: "Alto churn e baixa retenção de alunos",
    offer: "CRM de retenção e campanhas de winback",
  },
  Barbearia: {
    pain: "Agenda manual e baixo ticket médio",
    offer: "Agenda automatizada + upsell de produtos",
  },
  Escola: {
    pain: "Captação sazonal e jornada de matrícula confusa",
    offer: "Funil de matrícula sazonal multicanal",
  },
  Imobiliária: {
    pain: "Lentidão no atendimento e perda de leads quentes",
    offer: "Speed-to-lead em <5min com automação",
  },
  "Clínica Médica": {
    pain: "Falta de follow-up e agenda fragmentada",
    offer: "CRM médico + lembretes automáticos",
  },
  Restaurante: {
    pain: "Pouco delivery direto e dependência de marketplaces",
    offer: "Delivery direto e fidelidade via WhatsApp",
  },
  "Pet Shop": {
    pain: "Baixa recorrência e sem CRM de clientes",
    offer: "Clube de assinatura e recompra automática",
  },
  Construtora: {
    pain: "Funil longo sem nutrição comercial",
    offer: "Nutrição comercial longa via e-mail + WhatsApp",
  },
};

export const PAIN_OFFER_FALLBACK: PainOffer = {
  pain: "Operação comercial sem automação",
  offer: "CRM Gravity + automação comercial",
};

/** Resolve dor/oferta por nicho com matching parcial (ex.: "clínica" casa "Clínica Odontológica"). */
export function resolvePainOffer(niche: string | undefined | null): PainOffer {
  if (!niche) return PAIN_OFFER_FALLBACK;
  const exact = NICHE_PAIN_OFFER[niche];
  if (exact) return exact;
  const n = niche.toLowerCase();
  for (const key of Object.keys(NICHE_PAIN_OFFER)) {
    const k = key.toLowerCase();
    if (n.includes(k) || k.includes(n)) return NICHE_PAIN_OFFER[key]!;
  }
  return PAIN_OFFER_FALLBACK;
}
