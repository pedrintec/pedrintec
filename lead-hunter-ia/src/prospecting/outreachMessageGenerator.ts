import type { Lead } from "../types/index.js";

// Gera uma mensagem de abordagem consultiva, adaptada ao nicho, com opt-out.
// NÃO promete resultado; tom de demonstração/diagnóstico.

const OPT_OUT = "Se não fizer sentido para você, me avise que não envio mais mensagens.";

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Frase de contexto específica por família de nicho.
function nicheContext(niche: string): string {
  const n = norm(niche);
  if (/clinic|odonto|dentista|saude|medic|fisio|psico/.test(n))
    return "Em clínicas, muitos pacientes chegam pelo WhatsApp para tirar dúvidas e agendar, e parte desemboca em demora ou agenda desorganizada.";
  if (/estetic|salao|barbear|spa/.test(n))
    return "Em estética e beleza, boa parte dos agendamentos vem por mensagem, e respostas lentas fazem o cliente procurar o concorrente.";
  if (/imobili|corretor|imovel/.test(n))
    return "No mercado imobiliário, leads chegam a toda hora e esfriam rápido quando não há resposta imediata.";
  if (/escola|curso|educa|ensino/.test(n))
    return "Em educação, muitas dúvidas sobre matrícula e turmas se repetem e tomam tempo da equipe.";
  if (/oficina|mecanic|autocenter|funilaria/.test(n))
    return "Em oficinas, orçamentos e agendamentos por WhatsApp se acumulam e nem sempre recebem retorno rápido.";
  if (/contabil|contador/.test(n))
    return "Na contabilidade, muitos contatos são dúvidas recorrentes que poderiam ser triadas automaticamente.";
  if (/seguro|corretora/.test(n))
    return "Em seguros, a agilidade na cotação e no primeiro contato faz diferença direta na conversão.";
  if (/concessionaria|veiculo|carro|revenda/.test(n))
    return "Em concessionárias/revendas, interessados chegam por vários canais e precisam de resposta rápida para não esfriar.";
  if (/academia|crossfit|pilates/.test(n))
    return "Em academias, muitas perguntas sobre planos e horários se repetem e poderiam ser respondidas na hora.";
  if (/advoc|advog|direito|juridic/.test(n))
    return "Em escritórios, o primeiro contato e a triagem de casos consomem tempo que poderia ser automatizado com responsabilidade.";
  return "Muitas empresas perdem oportunidades por demora no primeiro contato, falta de triagem ou perguntas repetitivas.";
}

export function generateOutreachMessage(lead: Lead): string {
  const empresa = lead.companyName ? ` da ${lead.companyName}` : "";
  const canal = lead.whatsapp ? "WhatsApp" : "canais digitais";

  return [
    `Olá, tudo bem? Vi que o atendimento${empresa} usa ${canal} para falar com clientes.`,
    nicheContext(lead.niche || ""),
    "Nós criamos agentes de IA humanizados para atendimento, vendas, suporte e agendamento — eles respondem dúvidas, qualificam interessados e organizam o atendimento antes da equipe humana entrar.",
    "Faz sentido eu te mostrar um exemplo aplicado ao seu negócio?",
    OPT_OUT,
  ].join("\n\n");
}
