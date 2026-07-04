import { askClaudeJson, aiEnabled } from "../integrations/claudeClient.js";
import { resolvePainOffer } from "./nichePainOffer.js";

// PESQUISADOR EMPRESARIAL (agente 2 do pipeline Gravity).
// Antes de qualquer abordagem, analisa os dados públicos já coletados do lead
// (site, diagnóstico, redes sociais, evidências de busca) e produz um relatório
// comercial estruturado. Caminho duplo:
//   - heurístico: sempre disponível, monta o relatório a partir dos dados locais;
//   - IA (env-gated): se ANTHROPIC_API_KEY existir, o Claude refina o relatório.
// Honestidade: só usa dados coletados; nada de inventar fatos.

/** Subconjunto estrutural do LeadRecord que o Pesquisador consome (testável). */
export interface ResearchSource {
  companyName: string;
  niche?: string | null;
  city?: string | null;
  region?: string | null;
  site?: string | null;
  instagram?: string | null;
  whatsapp?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  sourceUrl?: string | null;
  evidence?: string | null;
  opportunities?: string[];
  temperature?: string;
  urgencyScore?: number;
  accessScore?: number;
  finalScore?: number;
  dataConfidence?: number;
  scoreEvidences?: Array<{ signal?: string; evidence?: string; points?: number }>;
  websiteDiagnostic?: { summary?: string; findings?: string[] };
  commercialHook?: string;
}

/** Relatório do Pesquisador — estrutura pedida pelo usuário (chaves em pt-BR). */
export interface ResearchReport {
  resumo_da_empresa: string;
  publico_alvo: string;
  possiveis_dores: string[];
  servicos: string[];
  possiveis_problemas: string[];
  oportunidades_de_automacao: string[];
  possibilidade_uso_ia: string[];
  nivel_maturidade_digital: { score: number; label: "Baixa" | "Média" | "Alta"; sinais: string[] };
  fontes: string[];
  gerado_por: "heuristica" | "ia";
  gerado_em: string;
}

/** Público-alvo provável por família de nicho (fallback honesto e genérico). */
function guessAudience(niche: string, city: string): string {
  const n = niche.toLowerCase();
  const loc = city ? ` em ${city} e região` : " na região de atuação";
  if (/odonto|dentista|cl[ií]nica m[eé]dica|sa[uú]de|fisio|psico/.test(n))
    return `Pacientes locais${loc} que buscam atendimento de confiança e agendamento fácil.`;
  if (/est[eé]tica|sal[aã]o|barbear|beleza/.test(n))
    return `Clientes recorrentes de beleza/autocuidado${loc}, sensíveis a agenda e relacionamento.`;
  if (/academia|fit|crossfit|personal/.test(n))
    return `Alunos locais${loc} em busca de resultado e acompanhamento — retenção é o jogo.`;
  if (/advocacia|advog|jur[ií]dico/.test(n))
    return `Pessoas físicas e empresas${loc} que pesquisam reputação antes de contratar.`;
  if (/imobili|imóve|imovel|corretor/.test(n))
    return `Compradores e locatários ativos${loc} — decisão rápida, quem responde primeiro leva.`;
  if (/restaurante|pizza|lanche|delivery|aliment/.test(n))
    return `Consumidores locais${loc} pedindo por WhatsApp/apps — recorrência e fidelidade importam.`;
  if (/escola|curso|educa/.test(n))
    return `Famílias e alunos${loc} em jornada de matrícula (sazonal e comparativa).`;
  if (/pet/.test(n)) return `Tutores de pets${loc} com potencial de recompra mensal.`;
  if (/solar|energia/.test(n))
    return `Proprietários de imóveis e empresas${loc} avaliando economia de energia (ciclo longo).`;
  if (/construtora|constru|engenharia/.test(n))
    return `Compradores de alto ticket${loc} com funil longo que exige nutrição.`;
  return `Consumidores e empresas locais${loc} que pesquisam ${niche || "o serviço"} online antes de contratar.`;
}

/** Serviços prováveis por nicho (marcados como prováveis — não inventamos catálogo). */
function guessServices(niche: string): string[] {
  const n = (niche || "").toLowerCase();
  if (/odonto|dentista/.test(n))
    return ["Avaliação/consulta odontológica (provável)", "Tratamentos estéticos e clínicos (provável)"];
  if (/est[eé]tica/.test(n)) return ["Procedimentos estéticos (provável)", "Pacotes/recorrência (provável)"];
  if (/barbear/.test(n)) return ["Corte e barba (provável)", "Produtos e assinatura (provável)"];
  if (/academia/.test(n)) return ["Planos mensais/anuais (provável)", "Aulas e acompanhamento (provável)"];
  if (/advocacia|advog/.test(n)) return ["Consultas e pareceres (provável)", "Atuação contenciosa (provável)"];
  if (/imobili/.test(n)) return ["Venda e locação de imóveis (provável)", "Avaliação/visitas (provável)"];
  if (/restaurante|delivery/.test(n)) return ["Cardápio no salão (provável)", "Delivery/retirada (provável)"];
  if (/escola|curso/.test(n)) return ["Matrículas e mensalidades (provável)", "Turmas/horários (provável)"];
  if (/pet/.test(n)) return ["Banho e tosa (provável)", "Produtos e clínica (provável)"];
  if (/solar|energia/.test(n)) return ["Projeto e instalação fotovoltaica (provável)", "Financiamento (provável)"];
  if (/construtora/.test(n)) return ["Empreendimentos próprios (provável)", "Obras sob contrato (provável)"];
  return [`Serviços de ${niche || "atendimento local"} (provável)`];
}

/** Maturidade digital: presença (access) pesa metade; automação (inverso da urgência) a outra metade. */
export function digitalMaturity(src: ResearchSource): ResearchReport["nivel_maturidade_digital"] {
  const access = src.accessScore ?? (src.site ? 40 : 0) + (src.instagram ? 30 : 0) + (src.whatsapp ? 30 : 0);
  const urgency = src.urgencyScore ?? 60;
  const score = Math.max(0, Math.min(100, Math.round(access * 0.5 + (100 - urgency) * 0.5)));
  const label: "Baixa" | "Média" | "Alta" = score >= 70 ? "Alta" : score >= 40 ? "Média" : "Baixa";
  const sinais: string[] = [];
  if (src.site) sinais.push("Tem site próprio");
  if (src.instagram) sinais.push("Presente no Instagram");
  if (src.whatsapp) sinais.push("Atende por WhatsApp");
  if (src.email) sinais.push("E-mail comercial público");
  for (const f of src.websiteDiagnostic?.findings ?? []) {
    if (/chatbot|agendamento|formul[aá]rio/i.test(f)) sinais.push(f);
  }
  if (!sinais.length) sinais.push("Pouca presença digital identificada");
  return { score, label, sinais: sinais.slice(0, 6) };
}

/** Monta o relatório 100% localmente, a partir do que os robôs já coletaram. */
export function buildHeuristicReport(src: ResearchSource): ResearchReport {
  const niche = src.niche ?? "";
  const city = src.city ?? "";
  const po = resolvePainOffer(niche);
  const diag = src.websiteDiagnostic;
  const canais: string[] = [];
  if (src.site) canais.push("site");
  if (src.instagram) canais.push("Instagram");
  if (src.whatsapp) canais.push("WhatsApp");
  if (src.phone) canais.push("telefone");
  if (src.email) canais.push("e-mail");

  const resumo =
    `${src.companyName} é um negócio de ${niche || "serviços locais"}` +
    (city ? ` em ${city}${src.region ? "/" + src.region : ""}` : "") +
    (canais.length ? `, com presença pública via ${canais.join(", ")}.` : ", com pouca presença digital pública.") +
    (diag?.summary ? ` ${diag.summary}` : "");

  const dores = [po.pain];
  const problemas: string[] = [];
  for (const f of diag?.findings ?? []) {
    if (/n[aã]o|sem /i.test(f)) problemas.push(f);
  }
  if ((src.dataConfidence ?? 100) < 50) problemas.push("Dados de contato públicos incompletos");
  if (!src.site) problemas.push("Sem site próprio identificado");
  if (!problemas.length) problemas.push("Nenhum problema estrutural evidente nos dados coletados");

  const oportunidades = [...(src.opportunities ?? [])];
  if (!oportunidades.length) oportunidades.push("Agente de atendimento 24h");
  oportunidades.push(po.offer);

  const usoIa = (src.opportunities ?? []).length
    ? (src.opportunities ?? []).map((o) => `${o} treinado no contexto do negócio`)
    : ["Agente de IA para primeiro atendimento e qualificação de interessados"];

  const fontes = [src.site, src.instagram, src.sourceUrl, "Busca pública (Google)"]
    .filter((f): f is string => Boolean(f));

  return {
    resumo_da_empresa: resumo.trim(),
    publico_alvo: guessAudience(niche, city),
    possiveis_dores: [...new Set(dores)],
    servicos: guessServices(niche),
    possiveis_problemas: [...new Set(problemas)].slice(0, 6),
    oportunidades_de_automacao: [...new Set(oportunidades)].slice(0, 6),
    possibilidade_uso_ia: [...new Set(usoIa)].slice(0, 5),
    nivel_maturidade_digital: digitalMaturity(src),
    fontes: [...new Set(fontes)],
    gerado_por: "heuristica",
    gerado_em: new Date().toISOString(),
  };
}

const RESEARCHER_SYSTEM = `Você é um pesquisador empresarial de uma agência de automação comercial.
Antes de qualquer abordagem, você analisa os dados PÚBLICOS já coletados de uma empresa (site, descrição, presença em buscadores/Google Maps e redes sociais disponíveis) e cria um relatório comercial honesto e útil para prospecção consultiva.
Regras inegociáveis:
- Use SOMENTE os dados fornecidos; nunca invente fatos, números, nomes ou avaliações.
- Quando um dado não existir, faça estimativas prudentes baseadas no nicho, marcadas com "(provável)".
- Português do Brasil, tom consultivo, frases curtas.
- Responda APENAS com JSON válido (sem markdown), exatamente com estas chaves:
{"resumo_da_empresa": string, "publico_alvo": string, "possiveis_dores": string[], "servicos": string[], "possiveis_problemas": string[], "oportunidades_de_automacao": string[], "possibilidade_uso_ia": string[], "nivel_maturidade_digital": {"score": número 0-100, "label": "Baixa"|"Média"|"Alta", "sinais": string[]}, "fontes": string[]}`;

type AiReport = Omit<ResearchReport, "gerado_por" | "gerado_em">;

function isValidAiReport(r: AiReport | null): r is AiReport {
  return Boolean(
    r &&
      typeof r.resumo_da_empresa === "string" &&
      typeof r.publico_alvo === "string" &&
      Array.isArray(r.possiveis_dores) &&
      Array.isArray(r.oportunidades_de_automacao) &&
      r.nivel_maturidade_digital &&
      typeof r.nivel_maturidade_digital.score === "number",
  );
}

/**
 * Gera o relatório: heurístico sempre; refinado pelo Claude quando há chave.
 * Nunca lança — em falha da IA, devolve o heurístico.
 */
export async function generateResearchReport(src: ResearchSource): Promise<ResearchReport> {
  const heuristic = buildHeuristicReport(src);
  if (!aiEnabled()) return heuristic;

  const dados = {
    empresa: src.companyName,
    nicho: src.niche,
    cidade: src.city,
    uf: src.region,
    site: src.site,
    instagram: src.instagram,
    whatsapp_publico: Boolean(src.whatsapp),
    telefone_publico: Boolean(src.phone),
    email_publico: Boolean(src.email),
    endereco: src.address,
    diagnostico_do_site: src.websiteDiagnostic,
    evidencias_de_score: (src.scoreEvidences ?? []).map((e) => e.signal ?? e.evidence).filter(Boolean),
    oportunidades_detectadas: src.opportunities,
    gancho_comercial: src.commercialHook,
    temperatura: src.temperature,
    rascunho_heuristico: heuristic,
  };

  const ai = await askClaudeJson<AiReport>(
    RESEARCHER_SYSTEM,
    `Dados coletados da empresa:\n${JSON.stringify(dados, null, 2)}\n\nGere o relatório JSON.`,
  );
  if (!isValidAiReport(ai)) return heuristic;

  const label = ai.nivel_maturidade_digital.label;
  return {
    ...heuristic,
    ...ai,
    nivel_maturidade_digital: {
      score: Math.max(0, Math.min(100, Math.round(ai.nivel_maturidade_digital.score))),
      label: label === "Alta" || label === "Média" || label === "Baixa" ? label : heuristic.nivel_maturidade_digital.label,
      sinais: Array.isArray(ai.nivel_maturidade_digital.sinais)
        ? ai.nivel_maturidade_digital.sinais.slice(0, 6)
        : heuristic.nivel_maturidade_digital.sinais,
    },
    gerado_por: "ia",
    gerado_em: new Date().toISOString(),
  };
}
