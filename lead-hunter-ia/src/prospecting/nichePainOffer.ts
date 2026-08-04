// Mapa fixo dor digital → oferta recomendada por nicho (spec §3.2).
// Espelha o mapa do frontend (public/index.html) — manter os dois em sincronia.

export interface PainOffer {
  pain: string;
  offer: string;
}

// Mantido em sincronia com o mapa do frontend (public/index.html → NICHE_PAIN_OFFER).
export const NICHE_PAIN_OFFER: Record<string, PainOffer> = {
  // Saúde e bem-estar  (entradas originais preservadas na íntegra; novas apenas adicionadas)
  Odontologia: { pain: "Pouca captação digital, agenda com horários ociosos", offer: "Funil de captação + automação de agendamento" },
  "Clínica Odontológica": { pain: "Pouca captação digital, agenda com horários ociosos", offer: "Funil de captação + automação de agendamento" },
  Estética: { pain: "Baixa recompra e ausência de funil de retorno", offer: "Programa de recompra e nutrição via WhatsApp" },
  Dermatologia: { pain: "Procura sazonal e baixa recompra de procedimentos", offer: "Nutrição e recompra via WhatsApp" },
  Fisioterapia: { pain: "Dependência de indicação e agenda com vagas", offer: "Captação local + lembrete de retorno" },
  Nutrição: { pain: "Baixa retenção de pacientes após a 1ª consulta", offer: "Acompanhamento e recompra automatizados" },
  Psicologia: { pain: "Agenda irregular e alto índice de no-show", offer: "Confirmação e lembrete automático de sessões" },
  "Clínica Médica": { pain: "Falta de follow-up e agenda fragmentada", offer: "CRM médico + lembretes automáticos" },
  Veterinária: { pain: "Baixa recorrência e sem controle de retorno", offer: "Lembrete de vacina + clube de recompra" },
  // Fitness
  Academia: { pain: "Alto churn e baixa retenção de alunos", offer: "CRM de retenção e campanhas de winback" },
  Pilates: { pain: "Turmas com vagas e captação irregular", offer: "Captação local + planos recorrentes" },
  CrossFit: { pain: "Churn alto e poucos leads recorrentes", offer: "CRM de retenção + winback de ex-alunos" },
  "Personal Trainer": { pain: "Poucos alunos recorrentes e agenda ociosa", offer: "Captação local + planos recorrentes" },
  // Beleza
  Barbearia: { pain: "Agenda manual e baixo ticket médio", offer: "Agenda automatizada + upsell de produtos" },
  "Salão de Beleza": { pain: "Agenda manual e baixa recorrência", offer: "Agenda online + programa de fidelidade" },
  // Imóveis e construção
  Imobiliária: { pain: "Lentidão no atendimento e perda de leads quentes", offer: "Speed-to-lead em <5min com automação" },
  "Corretor de Imóveis": { pain: "Leads frios e resposta lenta", offer: "Speed-to-lead + qualificação por SDR" },
  Construtora: { pain: "Funil longo sem nutrição comercial", offer: "Nutrição comercial longa via e-mail + WhatsApp" },
  Arquitetura: { pain: "Ciclo longo e orçamento sem acompanhamento", offer: "Portfólio digital + nutrição comercial" },
  // Casa e serviços
  "Energia Solar": { pain: "Leads desqualificados e ciclo de venda longo", offer: "Qualificação por SDR + CRM Gravity" },
  "Segurança Eletrônica": { pain: "Orçamentos parados e follow-up manual", offer: "Qualificação + follow-up automático" },
  // Serviços profissionais
  Advocacia: { pain: "Pouca presença digital e site sem conversão", offer: "Site institucional + landing pages especializadas" },
  Contabilidade: { pain: "Aquisição por indicação e churn de clientes", offer: "Aquisição digital + onboarding automatizado" },
  Consultoria: { pain: "Autoridade sem geração de demanda previsível", offer: "Funil de autoridade + captação de reuniões" },
  // Alimentação
  Restaurante: { pain: "Pouco delivery direto e dependência de marketplaces", offer: "Delivery direto e fidelidade via WhatsApp" },
  Pizzaria: { pain: "Dependência de marketplace e margem baixa", offer: "Delivery próprio + recompra no WhatsApp" },
  Hamburgueria: { pain: "Dependência de marketplace e margem baixa", offer: "Delivery próprio + recompra no WhatsApp" },
  Cafeteria: { pain: "Baixa recorrência e sem base de clientes", offer: "Clube de fidelidade + recompra" },
  Padaria: { pain: "Baixa recorrência e sem CRM de clientes", offer: "Clube de fidelidade + encomendas por WhatsApp" },
  // Automotivo
  "Oficina Mecânica": { pain: "Baixa recorrência e sem follow-up de revisão", offer: "Lembrete de revisão + CRM de clientes" },
  "Estética Automotiva": { pain: "Agenda ociosa e ticket médio baixo", offer: "Agenda online + upsell de serviços" },
  Concessionária: { pain: "Leads sem qualificação e resposta lenta", offer: "Qualificação por SDR + speed-to-lead" },
  // Educação
  Escola: { pain: "Captação sazonal e jornada de matrícula confusa", offer: "Funil de matrícula sazonal multicanal" },
  "Curso Profissionalizante": { pain: "Matrícula sazonal e alta evasão", offer: "Funil de matrícula + retenção de alunos" },
  "Escola de Idiomas": { pain: "Matrícula sazonal e evasão de alunos", offer: "Funil de matrícula + retenção" },
  Autoescola: { pain: "Captação irregular e concorrência por preço", offer: "Captação local + prova social" },
  // Comércio e varejo
  "Loja de Roupas": { pain: "Tráfego só físico e sem recompra", offer: "Vitrine digital + remarketing e recompra" },
  Ótica: { pain: "Baixa recompra e sem base de clientes", offer: "Recompra programada + campanhas locais" },
  "Pet Shop": { pain: "Baixa recorrência e sem CRM de clientes", offer: "Clube de assinatura e recompra automática" },
  // Eventos e turismo
  Buffet: { pain: "Sazonalidade e orçamento demorado", offer: "Captação + orçamento rápido no WhatsApp" },
  Fotografia: { pain: "Demanda sazonal e agenda irregular", offer: "Captação local + follow-up de orçamentos" },
  Hotel: { pain: "Dependência de OTAs e diárias ociosas", offer: "Reserva direta + remarketing" },
  Pousada: { pain: "Dependência de OTAs e baixa ocupação fora de pico", offer: "Reserva direta + campanhas de baixa temporada" },
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
