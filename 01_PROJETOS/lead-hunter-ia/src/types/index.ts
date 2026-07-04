// Tipos centrais do Lead Hunter IA.

export type SearchProviderName =
  | "serpapi"
  | "google_cse"
  | "manual"
  | "serper"
  | "serper_places"
  | "exa"
  | "multi";

export type LeadTemperature = "Quente" | "Morno" | "Frio";

/** Tipos de oportunidade de agente de IA detectados para um lead. */
export type AiOpportunity =
  | "Agente de atendimento 24h"
  | "Agente de qualificação de leads"
  | "Agente de agendamento"
  | "Agente de vendas"
  | "Agente de suporte"
  | "Agente para WhatsApp"
  | "Agente de recuperação de clientes";

/** Parâmetros informados pelo usuário para uma busca. */
export interface SearchInput {
  city: string;
  region: string; // estado ou país
  niche: string;
  maxLeads: number;
  searchType: SearchType;
}

export type SearchType = "completa" | "rapida" | "somente-sites";

/** Resultado bruto devolvido por um provedor de busca (1 URL). */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  query: string; // o dork que gerou este resultado
}

/** Contrato que todo provedor de busca implementa. */
export interface SearchProvider {
  readonly name: SearchProviderName;
  search(query: string, limit: number): Promise<SearchResult[]>;
}

/** Dados extraídos de uma página pública. */
export interface ExtractedData {
  companyName?: string;
  phones: string[];
  whatsapp?: string;
  emails: string[];
  instagram?: string;
  linkedin?: string;
  address?: string;
  /** Sinais textuais encontrados (ex.: "agendamento", "orçamento"). */
  signals: string[];
  /** Indícios técnicos (ex.: "tem-formulario", "sem-chatbot"). */
  techSignals: string[];
  /** Conteúdo textual aproximado (para heurísticas de score). */
  rawTextSample: string;
}

/** Resultado do scoring de um lead. */
export interface ScoreResult {
  score: number; // 0-100
  temperature: LeadTemperature;
  opportunities: AiOpportunity[];
  reasons: string[]; // evidências que justificam o score
}

// ---------------------------------------------------------------------
// Prospecção consultiva: scoring de 3 blocos, CRM e conformidade
// ---------------------------------------------------------------------

/** Prioridade comercial derivada do score final. */
export type CommercialPriority = "atacar_hoje" | "validar_manual" | "nutrir" | "descartar";

/** Status do lead no mini-CRM. */
export type CommercialStatus =
  | "novo"
  | "validado"
  | "contatado"
  | "respondeu"
  | "reuniao_marcada"
  | "sem_interesse"
  | "cliente"
  | "descartado";

/** Base legal (LGPD) para tratamento do dado. */
export type LegalBasis =
  | "legitimo_interesse_comercial"
  | "dados_publicos_comerciais"
  | "consentimento"
  | "importado_pelo_usuario";

/** Categoria de cada evidência de pontuação. */
export type ScoreType = "fit" | "urgency" | "access" | "penalty" | "bonus";

/** Uma evidência que justifica pontos no score (auditável). */
export interface ScoreEvidence {
  scoreType: ScoreType;
  signal: string;
  points: number;
  evidence?: string;
  sourceUrl?: string;
}

/** Resultado consolidado do novo scoring de 3 blocos. */
export interface ScoreBreakdown {
  fitScore: number;
  urgencyScore: number;
  accessScore: number;
  finalScore: number;
  temperature: LeadTemperature;
  priority: CommercialPriority;
  evidences: ScoreEvidence[];
}

/** Diagnóstico automático do site (oportunidades para IA). */
export interface WebsiteDiagnostic {
  summary: string;
  findings: string[];
  risks: string[];
  aiOpportunities: string[];
}

/** Estimativa (não-garantida) de ROI para argumento comercial. */
export interface RoiEstimate {
  disclaimer: string;
  assumptions: string[];
  estimatedMonthlyLoss?: number;
  narrative: string;
}

/** Lead consolidado (já com score) pronto para persistir/exibir/exportar. */
export interface Lead {
  companyName: string;
  site: string;
  city: string;
  region: string;
  niche: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  instagram?: string;
  linkedin?: string;
  address?: string;
  sourceUrl: string;
  evidence: string; // resumo das evidências encontradas
  opportunities: AiOpportunity[];
  score: number; // = finalScore (mantido para compatibilidade)
  temperature: LeadTemperature;
  collectedAt: string; // ISO date

  // --- Campos da prospecção consultiva (todos opcionais p/ retrocompat) ---
  normalizedCompanyName?: string;
  rootDomain?: string;
  country?: string;
  normalizedPhone?: string;
  normalizedWhatsapp?: string;
  normalizedEmail?: string;
  normalizedInstagram?: string;
  sourceProvider?: string;
  sourceQuery?: string;
  dataOrigin?: string;
  legalBasis?: LegalBasis;
  dataConfidence?: number;
  commercialStatus?: CommercialStatus;
  fitScore?: number;
  urgencyScore?: number;
  accessScore?: number;
  finalScore?: number;
  commercialPriority?: CommercialPriority;
  scoreEvidences?: ScoreEvidence[];
  websiteDiagnostic?: WebsiteDiagnostic;
  commercialHook?: string;
  outreachMessage?: string;
  roiEstimate?: RoiEstimate;
  firstSeenAt?: string;
  lastSeenAt?: string;
  lastCheckedAt?: string;
  optOutAt?: string;
}
