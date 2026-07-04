import { askClaudeJson, aiEnabled } from "../integrations/claudeClient.js";
import type { ResearchReport, ResearchSource } from "./researcher.js";

// SDR IA (agente 5 do pipeline Gravity) — roda 100% local.
// Responsabilidades:
//   1. Cadência: abordagem inicial + follow-ups D+2 e D+5 (tarefas no CRM).
//   2. Qualificador: classifica a resposta do lead (colada pelo usuário) e
//      decide próxima etapa/ação — heurística sempre, Claude quando há chave.
//   3. Agendador: propõe 2 horários em dias úteis para a mensagem/reunião.
// Nenhuma mensagem é ENVIADA automaticamente: o SDR prepara tudo e o humano
// dispara pelo WhatsApp (wa.me) — postura ética e compatível com LGPD.

export interface SdrTaskPlan {
  text: string;
  due: string; // YYYY-MM-DD (data local)
  priority: string;
}

export interface SdrSequence {
  message: string;
  tasks: SdrTaskPlan[];
}

export interface ReplyAssessment {
  classificacao: "interessado" | "sem_interesse" | "depois" | "duvida";
  nova_etapa: string | null; // etapa sugerida do funil (ou null p/ manter)
  proxima_acao: string;
  sugestao_resposta: string;
  followup_em_dias: number | null;
  sugerir_opt_out: boolean;
}

/** Data local (YYYY-MM-DD) daqui a N dias — mesmo formato de lead_tasks.due. */
export function localDateInDays(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const WEEKDAYS_PT = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

/** Propõe 2 horários em dias úteis (10h e 15h30), pt-BR: "terça-feira 08/07 às 10h". */
export function proposeMeetingSlots(from: Date = new Date()): [string, string] {
  const slots: string[] = [];
  const hours = ["10h", "15h30"];
  const d = new Date(from);
  while (slots.length < 2) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue; // pula fim de semana
    const p = (n: number) => String(n).padStart(2, "0");
    slots.push(`${WEEKDAYS_PT[dow]} ${p(d.getDate())}/${p(d.getMonth() + 1)} às ${hours[slots.length]}`);
  }
  return [slots[0]!, slots[1]!];
}

/** Cadência padrão de tarefas: D0 abordagem, D+2 e D+5 follow-ups. */
export function buildSdrCadence(companyName: string, from: Date = new Date()): SdrTaskPlan[] {
  return [
    { text: `SDR D0 — Enviar abordagem inicial: ${companyName}`, due: localDateInDays(0, from), priority: "Alta" },
    { text: `SDR D+2 — Follow-up 1 (sem resposta): ${companyName}`, due: localDateInDays(2, from), priority: "Alta" },
    { text: `SDR D+5 — Follow-up 2 (última tentativa): ${companyName}`, due: localDateInDays(5, from), priority: "Média" },
  ];
}

/** Mensagem de abordagem heurística, personalizada pelo relatório do Pesquisador. */
export function buildApproachMessage(
  src: Pick<ResearchSource, "companyName" | "city" | "niche">,
  report: ResearchReport,
  agencyName: string,
  from: Date = new Date(),
): string {
  const dor = report.possiveis_dores[0] ?? "a captação e o acompanhamento de contatos comerciais";
  const oferta = report.oportunidades_de_automacao[0] ?? "automação do primeiro atendimento";
  const [s1, s2] = proposeMeetingSlots(from);
  const cidade = src.city ? ` em ${src.city}` : "";
  return (
    `Olá, tudo bem? Aqui é da ${agencyName}. Pesquisei a ${src.companyName}${cidade} e, ` +
    `pelo que vi da presença digital de vocês, um ponto que costuma custar caro no segmento de ${src.niche || "vocês"} é: ${dor.toLowerCase()}.\n\n` +
    `Trabalhamos com ${oferta.toLowerCase()} e posso te mostrar, num diagnóstico gratuito de 20 minutos, onde estão os gargalos e o que dá para automatizar sem mudar sua operação.\n\n` +
    `Tenho ${s1} ou ${s2} — qual fica melhor para você?`
  );
}

/** Monta a sequência completa (mensagem + cadência). IA refina a mensagem quando disponível. */
export async function buildSdrSequence(
  src: Pick<ResearchSource, "companyName" | "city" | "niche">,
  report: ResearchReport,
  agencyName: string,
  from: Date = new Date(),
): Promise<SdrSequence> {
  const tasks = buildSdrCadence(src.companyName, from);
  const heuristicMsg = buildApproachMessage(src, report, agencyName, from);
  if (!aiEnabled()) return { message: heuristicMsg, tasks };

  const [s1, s2] = proposeMeetingSlots(from);
  const ai = await askClaudeJson<{ mensagem?: string }>(
    `Você é um SDR consultivo e educado da agência ${agencyName}. Escreva mensagens de WhatsApp de prospecção B2B em português do Brasil.
Regras: máximo 600 caracteres; personalizada com os dados fornecidos; sem promessas garantidas; sem pressão; convide para um diagnóstico gratuito oferecendo os dois horários fornecidos; nada de emojis em excesso (no máximo 1).
Responda APENAS com JSON: {"mensagem": string}`,
    `Empresa: ${src.companyName} (${src.niche ?? "nicho não informado"}${src.city ? ", " + src.city : ""})
Dor principal: ${report.possiveis_dores[0] ?? "-"}
Oportunidade: ${report.oportunidades_de_automacao[0] ?? "-"}
Resumo: ${report.resumo_da_empresa}
Horários a oferecer: ${s1} | ${s2}`,
  );
  const message = ai?.mensagem && ai.mensagem.trim().length > 40 ? ai.mensagem.trim() : heuristicMsg;
  return { message, tasks };
}

// ---------------------------------------------------------------------
// Qualificador: classifica a resposta do lead
// ---------------------------------------------------------------------

const RE_SEM_INTERESSE =
  /n[aã]o (tenho|temos) interesse|n[aã]o quero|n[aã]o preciso|remova|remover|descadastr|pare de (enviar|mandar)|n[aã]o me (envie|mande|chame)|bloquear/i;
const RE_DEPOIS =
  /\b(depois|mais tarde|outro momento|semana que vem|m[eê]s que vem|pr[oó]ximo (m[eê]s|semestre|ano)|agora n[aã]o|momento ruim|ocupad[oa]|corrid[oa]|futuramente|me procure)\b/i;
const RE_INTERESSADO =
  /\b(sim|pode ser|quero|queremos|vamos sim|bora|tenho interesse|me interessa|interessante|como funciona|quanto custa|qual (o )?valor|me (conta|explica|mostra)|manda|pode marcar|fechado|combinado|topo|aceito)\b|\b(10h|15h30?)\b/i;

/** Classificação heurística da resposta (ordem importa: recusa > adiamento > interesse > dúvida). */
export function classifyReply(text: string): ReplyAssessment {
  const t = (text || "").trim();

  if (RE_SEM_INTERESSE.test(t)) {
    return {
      classificacao: "sem_interesse",
      nova_etapa: "Perdido",
      proxima_acao: "Encerrar cadência e respeitar a recusa (considerar opt-out).",
      sugestao_resposta:
        "Entendido, agradeço o retorno! Não vou mais te incomodar. Se em algum momento fizer sentido revisar a automação do atendimento, estou à disposição. Sucesso por aí!",
      followup_em_dias: null,
      sugerir_opt_out: true,
    };
  }
  if (RE_DEPOIS.test(t)) {
    return {
      classificacao: "depois",
      nova_etapa: null,
      proxima_acao: "Agendar follow-up em 7 dias e manter o lead aquecido.",
      sugestao_resposta:
        "Perfeito, sem problema! Te procuro de novo na próxima semana então. Se antes disso quiser adiantar, é só me chamar aqui. Obrigado!",
      followup_em_dias: 7,
      sugerir_opt_out: false,
    };
  }
  if (RE_INTERESSADO.test(t)) {
    const [s1, s2] = proposeMeetingSlots();
    return {
      classificacao: "interessado",
      nova_etapa: "Reunião",
      proxima_acao: "Confirmar horário e enviar convite da reunião de diagnóstico.",
      sugestao_resposta: `Ótimo! Então vamos confirmar: consigo ${s1} ou ${s2}. Qual prefere? A conversa leva ~20 minutos e já te mostro o diagnóstico na hora.`,
      followup_em_dias: null,
      sugerir_opt_out: false,
    };
  }
  return {
    classificacao: "duvida",
    nova_etapa: null,
    proxima_acao: "Responder a dúvida com clareza e reconvidar para o diagnóstico.",
    sugestao_resposta:
      "Boa pergunta! Em resumo: a gente mapeia como os clientes chegam e onde se perdem no atendimento, e monta automações (WhatsApp, agendamento, follow-up) para não deixar venda na mesa. Posso te mostrar num diagnóstico gratuito de 20 min — topa?",
    followup_em_dias: null,
    sugerir_opt_out: false,
  };
}

/** Versão com IA: o Claude classifica e sugere resposta; fallback = heurística. */
export async function assessReply(
  src: Pick<ResearchSource, "companyName" | "niche">,
  report: ResearchReport | null,
  text: string,
): Promise<ReplyAssessment> {
  const heuristic = classifyReply(text);
  if (!aiEnabled()) return heuristic;

  const ai = await askClaudeJson<Partial<ReplyAssessment>>(
    `Você é um SDR sênior. Classifique a resposta de um lead de prospecção B2B e sugira a próxima ação.
Responda APENAS com JSON: {"classificacao": "interessado"|"sem_interesse"|"depois"|"duvida", "nova_etapa": "Reunião"|"Perdido"|null, "proxima_acao": string, "sugestao_resposta": string (mensagem pronta de WhatsApp, pt-BR, educada, máx 400 caracteres), "followup_em_dias": número|null, "sugerir_opt_out": boolean}
Regra: se o lead recusar, respeite (sem insistência); se adiar, proponha follow-up; se demonstrar interesse, conduza para a reunião de diagnóstico.`,
    `Empresa: ${src.companyName} (${src.niche ?? "-"})
Contexto do relatório: ${report ? report.resumo_da_empresa : "sem relatório"}
Resposta do lead: """${text}"""`,
  );
  const validClass = ["interessado", "sem_interesse", "depois", "duvida"] as const;
  if (!ai || !validClass.includes(ai.classificacao as (typeof validClass)[number])) return heuristic;
  return {
    classificacao: ai.classificacao as ReplyAssessment["classificacao"],
    nova_etapa: typeof ai.nova_etapa === "string" ? ai.nova_etapa : heuristic.nova_etapa,
    proxima_acao: ai.proxima_acao || heuristic.proxima_acao,
    sugestao_resposta: ai.sugestao_resposta || heuristic.sugestao_resposta,
    followup_em_dias: typeof ai.followup_em_dias === "number" ? ai.followup_em_dias : heuristic.followup_em_dias,
    sugerir_opt_out: Boolean(ai.sugerir_opt_out ?? heuristic.sugerir_opt_out),
  };
}
