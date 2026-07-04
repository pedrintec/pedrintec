import type { SearchInput, SearchType } from "../types/index.js";

// Geração de "Google Dorks" (consultas avançadas) a partir de cidade + nicho.
// Estes operadores são públicos e legítimos; o que importa é COMO consultamos
// (via API oficial, com rate limit) e não criar carga abusiva.

const TLD = "com.br";

/** Termos genéricos que indicam atendimento manual / oportunidade de IA. */
const INTENT_TERMS = [
  "contato",
  "WhatsApp",
  "agendamento",
  "atendimento",
  "orçamento",
  "telefone",
  "instagram",
  "suporte",
];

/** Conjuntos extras de termos por "família" de nicho (heurística simples). */
const NICHE_EXTRA: Record<string, string[]> = {
  saude: ["clínica", "consulta", "agendamento", "convênio"],
  beleza: ["agendamento", "horário", "salão", "estética"],
  alimentacao: ["delivery", "reserva", "cardápio", "pedido"],
  juridico: ["consulta", "advogado", "escritório", "atendimento"],
  educacao: ["matrícula", "curso", "turma", "inscrição"],
  imobiliario: ["imóveis", "agendar visita", "corretor", "aluguel"],
  servicos: ["orçamento", "atendimento", "agendar", "WhatsApp"],
};

function guessNicheFamily(niche: string): string[] {
  const n = niche.toLowerCase();
  if (/(clinic|saúde|saude|médic|medic|odonto|dentista|fisio|psico)/.test(n)) return NICHE_EXTRA.saude!;
  if (/(beleza|salão|salao|estética|estetica|barbear|cabelo|unha)/.test(n)) return NICHE_EXTRA.beleza!;
  if (/(restaurante|pizza|lanche|food|aliment|delivery|bar|café|cafe)/.test(n)) return NICHE_EXTRA.alimentacao!;
  if (/(advoc|advog|jurídic|juridic|direito)/.test(n)) return NICHE_EXTRA.juridico!;
  if (/(escola|curso|educa|ensino|faculdade)/.test(n)) return NICHE_EXTRA.educacao!;
  if (/(imóvel|imovel|imobili|corretor|aluguel)/.test(n)) return NICHE_EXTRA.imobiliario!;
  return NICHE_EXTRA.servicos!;
}

/**
 * Gera as queries conforme o tipo de busca.
 * - rapida: poucas queries de alto sinal
 * - completa: combinação ampla de termos
 * - somente-sites: foca em sites institucionais (.com.br)
 */
/**
 * Blocklist de segurança (§4): nenhuma query pode mirar login, credenciais,
 * áreas administrativas, arquivos sensíveis ou vazamentos — apenas descoberta
 * comercial pública. Defesa em profundidade: o gerador já produz só dorks
 * comerciais, mas isto garante que nada sensível escape (inclusive se termos
 * vierem de nicho/cidade digitados pelo usuário).
 */
const UNSAFE_PATTERNS: RegExp[] = [
  /password/i,
  /\bsenha\b/i,
  /\blogin\b/i,
  /\badmin\b/i,
  /wp-admin/i,
  /wp-login/i,
  /\bfiletype:\s*(sql|env|log|bak|backup|db|sqlite|passwd|htpasswd)/i,
  /\bext:\s*(sql|env|log|bak|backup)/i,
  /\binurl:\s*(admin|login|senha|password|backup|dump|config)/i,
  /index of/i,
  /\.env\b/i,
  /\bbackup\b/i,
  /\bdump\b/i,
  /credenciais|credentials/i,
];

/** true se a query é segura (não casa com nenhum termo proibido). */
export function isSafeDork(query: string): boolean {
  return !UNSAFE_PATTERNS.some((re) => re.test(query));
}

export function buildDorks(input: SearchInput): string[] {
  const { niche, city, region, searchType } = input;
  const loc = `"${city}"`;
  const n = `"${niche}"`;
  const extra = guessNicheFamily(niche);

  const base: string[] = [];

  const terms = pickTerms(searchType, extra);

  for (const t of terms) {
    base.push(`${n} ${loc} "${t}"`);
  }

  // Buscas com restrição de site institucional brasileiro.
  if (searchType !== "rapida") {
    base.push(`site:.${TLD} ${n} ${loc} "contato"`);
    base.push(`${n} ${loc} ${region ? `"${region}"` : ""} "WhatsApp"`.trim());
  }

  // Diretórios públicos e redes (sinais de atendimento manual).
  if (searchType === "completa") {
    base.push(`${n} ${loc} site:instagram.com`);
    base.push(`${n} ${loc} "fale conosco"`);
    base.push(`${n} ${loc} "horário de atendimento"`);
  }

  // Remove duplicadas, linhas vazias e qualquer dork que viole a blocklist (§4).
  return [...new Set(base.map((q) => q.replace(/\s+/g, " ").trim()))]
    .filter(Boolean)
    .filter(isSafeDork);
}

function pickTerms(searchType: SearchType, extra: string[]): string[] {
  switch (searchType) {
    case "rapida":
      return ["WhatsApp", "contato", "agendamento"];
    case "somente-sites":
      return ["contato", "atendimento", "orçamento"];
    case "completa":
    default:
      return [...new Set([...INTENT_TERMS, ...extra])];
  }
}

/** URL de busca do Google (para o modo manual: usuário abre no navegador). */
export function googleSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
