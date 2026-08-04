# Lead Hunter IA — Documento Técnico Detalhado

> Companion do `ARQUITETURA-VISAO-GERAL.md`.
> Foco: equipe de engenharia, code review, decisões de design.

---

## 1. Estrutura de pastas (backend)

```
src/
├── cli/                  # CLI Inquirer + Commander (npm start)
├── config/               # Validação Zod do .env (boot fail-fast)
├── compliance/
│   └── dataConfidence.ts # heurística de confiança 0-100 por origem
├── database/
│   ├── client.ts         # better-sqlite3 + Drizzle, WAL mode
│   ├── schema.ts         # 14 tabelas tipadas
│   ├── migrate.ts        # CREATE TABLE IF NOT EXISTS + PRAGMA p/ ALTER idempotente
│   └── repository.ts     # camada de acesso (~700 linhas; CRUD + paginação)
├── enrichment/
│   └── websiteDiagnostic.ts  # gera summary + findings + risks + aiOpportunities
├── exporters/
│   └── index.ts          # CSV, JSON, XLSX (ExcelJS com freeze/filtro/destaque)
├── normalization/
│   ├── normalizeDomain.ts
│   ├── normalizePhone.ts
│   ├── normalizeEmail.ts
│   ├── normalizeInstagram.ts
│   ├── normalizeCompanyName.ts
│   ├── similarity.ts     # Dice bigrams + comparação de nome
│   ├── dedup.ts          # leadsAreDuplicate(a,b) + dedupeLeads(list)
│   └── index.ts
├── prospecting/
│   ├── commercialHookGenerator.ts
│   ├── outreachMessageGenerator.ts   # adapta por nicho + opt-out hint
│   └── roiEstimator.ts
├── scoring/
│   ├── fitScore.ts       # bloco 1: nicho aderente?
│   ├── urgencyScore.ts   # bloco 2: sinais de baixa automação?
│   ├── accessScore.ts    # bloco 3: facilidade de abordagem?
│   ├── finalScore.ts     # combinação ponderada
│   ├── scoreEvidence.ts  # acumulador auditável de pontos
│   └── index.ts          # detectOpportunities (categorias de IA)
├── scrapers/
│   ├── fetch.ts (utils/http.ts)
│   ├── extract.ts        # Cheerio: extrai contatos, sinais, tech-stack
│   ├── robots.ts (utils/robots.ts)
│   └── playwrightFallback.ts  # dynamic import opcional
├── search/
│   ├── dorks.ts          # gera consultas (ex.: "clínica X" "Goiânia" "WhatsApp")
│   ├── index.ts          # getProvider() + runSearch() orquestrador
│   └── providers/
│       ├── manual.ts            # gera URL de busca (sem chave)
│       ├── serpapi.ts           # POST serpapi.com
│       ├── googleCustomSearch.ts # opcional
│       └── serper.ts            # 3 classes: Serper, SerperPlaces, MultiSearchProvider
├── server/
│   └── index.ts          # Express + SSE + 21 endpoints
├── pipeline.ts           # orquestra search → analyze → score → save
├── types/index.ts        # tipos compartilhados (Lead, LeadRecord, ScoreEvidence, etc.)
└── utils/
    ├── logger.ts         # ANSI colorido por nível
    ├── http.ts           # axios wrapper com retry exponencial
    ├── rateLimiter.ts    # p-limit para concorrência global
    ├── robots.ts         # robots-parser + cache em DB
    └── text.ts           # rootDomain, similarity legado

public/
├── index.html            # ~1.7K linhas (HTML + CSS + JS Gravity)
├── classic.html          # backup do painel V1
├── gestao-inteligente.html  # backup intermediário
└── v3-api-driven.html    # backup do painel "limpo"

scripts/
└── test-lusha.ts         # (preparado pra integração futura)

tests/
├── normalization.test.ts # 10 testes
├── dedup.test.ts         # 5 testes
├── scoring.test.ts       # 4 testes
├── prospecting.test.ts   # 3 testes
└── export.test.ts        # 2 testes
                          # Total: 24/24 passando
```

---

## 2. Endpoints HTTP (`src/server/index.ts`)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/config` | Provider ativo + flag `ready` |
| POST | `/api/preview` | Gera dorks reais (sem disparar busca) |
| GET | `/api/leads` | **Paginação** (com query params) ou base inteira (sem) |
| GET | `/api/leads/all` | Base inteira (explícito, sem ambiguidade) |
| GET | `/api/leads/:id` | Detalhe completo + atividades + evidências |
| POST | `/api/leads` | Criar lead manual |
| DELETE | `/api/leads/:id` | Excluir lead (cascata: tasks, activities, evidências, opt-outs) |
| POST | `/api/leads/:id/status` | Muda `commercialStatus` |
| POST | `/api/leads/:id/stage` | Muda `stage` + `dealValue` + `owner` + `nextAction` |
| POST | `/api/leads/:id/notes` | Adiciona nota ao histórico |
| POST | `/api/leads/:id/tasks` | Cria tarefa vinculada |
| POST | `/api/leads/:id/contact` | Marca "último contato" agora |
| POST | `/api/leads/:id/opt-out` | LGPD — opt-out |
| GET | `/api/tasks` | Lista plana (com empresa do lead) |
| POST | `/api/tasks/:taskId/toggle` | Alterna done |
| DELETE | `/api/tasks/:taskId` | Excluir tarefa |
| GET | `/api/searches` | Histórico de buscas |
| GET | `/api/search/stream` | **SSE**: progresso ao vivo da prospecção |
| GET | `/api/export/:format` | csv / json / xlsx (com filtro opt-out) |
| GET | `/api/settings` | Lê settings (com defaults) |
| PUT | `/api/settings` | Patch parcial das settings |

### Detalhes do `GET /api/leads` paginado

Query params aceitos:
- `page` (default 1) · `perPage` (default 10, clamp [1, 100])
- `search` (busca livre em company_name, city, niche, site, phone, whatsapp)
- `niche`, `city`, `temp` (Quente/Morno/Frio), `stage`
- `sort` (`created` | `score` | `value` | `last`) — default `created`
- `dateRange` (`todos` | `hoje` | `ontem` | `last7` | `thisMonth`)

Resposta:
```json
{
  "leads": [/* LeadRecord[] */],
  "total": 157,
  "page": 1,
  "perPage": 10,
  "pages": 16,
  "filters": { "niches": [...], "cities": [...] }
}
```

**Anti SQL-injection**: `sort` passa por whitelist `SORT_COLUMNS`; demais filtros usam `prepared statements` com `?` placeholders.

### SSE — `/api/search/stream`

Eventos emitidos:
- `status` — mensagem + progress 0-100
- `queries` — lista de dorks gerados
- `urls` — total de URLs únicas coletadas
- `lead` — payload completo do lead encontrado
- `done` — resultado final + stats `{queries, urls, analyzed, leads, durationMs}`
- `error` — mensagem amigável

---

## 3. Schema do banco (`src/database/schema.ts`)

14 tabelas. As mais quentes:

### `leads` (~80 colunas)
```ts
id, searchId, companyName, site, domain, city, region, country, niche,
phone, whatsapp, email, instagram, linkedin, address, sourceUrl,
evidence, opportunities, score, temperature, collectedAt,
// --- Consultiva ---
normalizedCompanyName, rootDomain, normalizedPhone, normalizedWhatsapp,
normalizedEmail, normalizedInstagram, sourceProvider, sourceQuery,
dataOrigin, legalBasis, dataConfidence,
commercialStatus, fitScore, urgencyScore, accessScore, finalScore,
commercialPriority, scoreEvidences (JSON), websiteDiagnostic (JSON),
commercialHook, outreachMessage, roiEstimate (JSON),
firstSeenAt, lastSeenAt, lastCheckedAt, optOutAt,
// --- CRM ---
stage, dealValue, owner, nextAction, lastContactAt
```

### `lead_tasks`
```ts
id, leadId, text, due, priority ('Alta'|'Média'|'Baixa'), done (0|1), createdAt
```

### `score_evidences`
```ts
id, leadId, scoreType ('fit'|'urgency'|'access'|'penalty'|'bonus'),
signal, points, evidence, sourceUrl, createdAt
```

### `lead_activities`
```ts
id, leadId, type ('note'|'status_change'|'stage_change'|...),
description, metadata (JSON), createdAt
```

### `robots_cache`
```ts
id, domain, allowed (0|1), crawlDelayMs, robotsTxtUrl, checkedAt, expiresAt, createdAt
```

### `scrape_logs`
```ts
id, url, domain, statusCode, success (0|1), errorMessage,
robotsAllowed (0|1), durationMs, requestedAt, createdAt
```

### `settings`
```ts
key (PK), value, updatedAt
```

### Migração
Estratégia simples e segura para SQLite local:
- `CREATE TABLE IF NOT EXISTS` em todas as tabelas
- `ALTER TABLE ADD COLUMN` checando via `PRAGMA table_info(...)` — idempotente
- Sem `drizzle-kit push` (mais previsível e 100% não-interativo)

---

## 4. Regras de Score (auditáveis)

### Fórmula
```
finalScore = round(fitScore * 0.40 + urgencyScore * 0.35 + accessScore * 0.25)
```

### Bloco 1 — `fitScore` (até 100)
Mede se o **nicho** tem dor real para agentes de IA. Baseado só no nicho informado.

| Sinal | Pontos |
|---|---:|
| Nicho com alto volume de atendimento | +20 |
| Nicho com agendamento | +20 |
| Nicho com orçamento/cotação | +15 |
| Nicho com suporte/dúvidas recorrentes | +15 |
| Nicho com venda consultiva | +15 |
| Nicho B2C com alto contato via WhatsApp | +15 |
| Nicho genérico (piso) | +20 |

### Bloco 2 — `urgencyScore` (até 100)
Mede **sinais de baixa automação** no site da empresa.

| Sinal | Pontos |
|---|---:|
| Sem chatbot aparente | +20 |
| Site simples/desatualizado | +20 |
| Sem agendamento online | +15 |
| Usa WhatsApp como canal principal | +15 |
| Sem FAQ visível | +10 |
| Tem formulário de contato (atendimento manual) | +10 |
| Texto menciona orçamento/agendamento/suporte | +10 |
| Já possui chatbot | **-10** |

### Bloco 3 — `accessScore` (até 100)
Mede **facilidade de abordagem** (quantos canais públicos a empresa expõe).

| Sinal | Pontos |
|---|---:|
| WhatsApp público | +30 |
| Telefone público | +20 |
| E-mail público | +20 |
| Instagram público | +15 |
| LinkedIn público | +10 |
| Múltiplos canais (≥2) | +5 |

### Temperatura
- ≥70 → 🔥 Quente
- ≥40 → 🌤️ Morno
- <40 → ❄️ Frio

### Prioridade Comercial
- ≥80 → `atacar_hoje`
- ≥60 → `validar_manual`
- ≥40 → `nutrir`
- <40 → `descartar`

### Auditoria
Cada ponto somado vira uma linha em `score_evidences` com `scoreType`, `signal`, `points` e `evidence`. **Toda nota é justificável** — pode-se reconstruir o cálculo pela tabela.

> Total atual: 1184 evidências de score gravadas para 157 leads (~7.5 evidências por lead em média).

---

## 5. Normalização e dedup (`src/normalization/`)

Funções puras (zero IO, 100% testáveis):

### `normalizeDomain(url)`
- Aceita `https://www.empresa.com.br/contato?x=1` → `empresa.com.br`
- Trata vazio/null, URL inválida, com fallback manual sem `URL`

### `normalizePhone(phone, defaultCountry='BR')`
- Brasil: prefixa `+55` quando detecta DDD+número (10 ou 11 dígitos)
- Mantém DDI 55 quando já presente
- 0800 e similares: mantém sem prefixar
- **Nunca inventa DDD** que não exista
- Outros países: aceita só se >=10 dígitos

### `normalizeEmail(email)`
- lowercase, trim, remove pontuação nas pontas
- Regex de validação básica
- Rejeita `.png`/`.jpg` etc. (assets que parecem e-mail)

### `normalizeInstagram(value)`
- Aceita `@empresa`, `instagram.com/empresa`, `https://www.instagram.com/empresa/`
- Filtra reservados (`p`, `reel`, `reels`, `explore`, `stories`, `tv`)
- Saída: handle puro (2-30 chars `[a-z0-9_.]`)

### `normalizeCompanyName(name)`
- Remove acentos (NFD)
- Remove sufixos societários (LTDA, ME, EPP, EIRELI, S/A, MEI...)
- Reduz pontuação/duplo espaço

### `similarity.ts`
- Dice coefficient sobre bigrams (0..1)
- `companyNameSimilarity(a, b)` aplica normalização antes

### `dedup.ts`
`leadsAreDuplicate(a, b)` retorna `true` se **qualquer** uma das condições:
- Mesmo `rootDomain`
- Mesmo telefone OU WhatsApp normalizado (cross-check tel↔wa)
- Mesmo e-mail normalizado
- Mesmo Instagram handle
- Mesma `city` + nome igual OU `similarity >= 0.9`

---

## 6. Pipeline (`src/pipeline.ts`)

```ts
runPipeline(input, onEvent?) {
  // 1) Busca
  const { provider, queries, results } = await runSearch(input);
  const searchId = createSearch(input, provider);
  emit('queries' + 'urls')

  // 2) Analisa cada URL (em série, respeitando rate-limit interno)
  for (const r of results) {
    if (collected.length >= maxLeads) break;
    const analysis = await analyzePage(r.url);    // robots → fetch → extract
    recordSource(searchId, ...)                    // rastreabilidade
    if (analysis.status !== 'ok') continue;
    const d = analysis.data;
    if (!hasContact(d)) continue;                  // exige pelo menos 1 canal

    // 3) Inteligência
    const breakdown = computeScoreBreakdown({ data: d, niche });
    const opportunities = detectOpportunities(d, niche);
    const diagnostic = generateWebsiteDiagnostic(d, niche);
    const confidence = calculateDataConfidence(d);
    const lead = { ...d, ...breakdown, ... };
    lead.commercialHook = generateCommercialHook(lead);
    if (GENERATE_OUTREACH_MESSAGES) lead.outreachMessage = generateOutreachMessage(lead);
    if (GENERATE_ROI_ESTIMATE)      lead.roiEstimate     = estimateRoiPotential(lead);

    collected.push(lead);
    emit('lead', lead);
  }

  // 4) Dedup interno + ordenação
  const deduped = dedupeLeads(collected).sort((a, b) => b.score - a.score);

  // 5) Persistência (dedup também contra o banco existente)
  const saved = saveLeads(searchId, deduped);

  emit('done', { stats: { queries, urls, analyzed, leads: saved.length, durationMs } });
}
```

---

## 7. Frontend Gravity — arquitetura do `public/index.html`

Único arquivo de ~1.7K linhas, dividido em:
- **HTML estrutura** (linhas 1-1000): sidebar + 7 sections + modal + toasts
- **CSS** (`<style>` no `<head>`): ~700 linhas, design system Gravity completo
- **JS** (`<script>` ao final): ~900 linhas

### State global
```ts
let state = {
  leads: [],              // base inteira (Dashboard/Funil/Stats)
  tasks: [],              // tarefas planas com empresa
  settings: { agencyName, message, niches, theme },
  currentDorks: [],
  currentResults: [],
  currentLeadId: null,
  provider: 'multi',
  activeView: 'dashboard',
  // --- Adicionado pela paginação ---
  leadsPage: { page, perPage, total, pages, dateRange, loading, lastReqId }
};
let _statsCache = null;   // invalidado em refreshAll/initApp
let _searchDebounce = 0;  // 250ms
let _suppressHash = false; // anti-loop ao re-aplicar URL
```

### Funções por responsabilidade
- **Loaders**: `loadConfig`, `loadSettings`, `loadLeads`, `loadTasks`, `loadLeadsPage`, `refreshAll`
- **Render por aba**: `renderDashboard`, `renderHunter`, `renderKanban`, `renderLeadsTable`, `renderTasks`, `renderAutomations`, `renderSettings`
- **CRM API**: `changeStage` (drag), `saveLeadChanges`, `addNote`, `addTask`, `toggleTask`, `markLastContact`, `optOut`, `deleteLead`, `deleteTask`
- **Hunter**: `generateDorks` (POST /api/preview), `runProspect` (EventSource), `copyText`, `openGoogle`
- **Modais**: `openModal`, `closeModal`, `openLeadModal`, `quickTaskForLead`, `openNewTask`, `openQuickAdd`
- **Util**: `api`, `mapLead`, `mapTask`, `toast`, `escapeHtml`, `brl`, `tempBadge`, `stageBadge`

### Performance
- `getStats()` com **cache invalidável**: 1 loop O(n) substitui 8 filtros separados.
- `refreshAll`: **Promise.all** com 2 fetches (`/api/leads` + `/api/tasks`).
- `initApp`: **Promise.all** com 4 fetches (config + settings + leads + tasks).
- `loadLeadsPage`: **debounce 250ms** + **lastReqId** (anti race-condition).
- Skeleton durante o fetch para feedback imediato.

### Deep link (`#hash` na URL)
Filtros, página, perPage, sort, dateRange, busca, nicho, cidade, temp, etapa.
Só persiste valores não-default → URL curtinha. Back/forward do navegador funciona via `hashchange`.

---

## 8. Configuração (`.env` validado por Zod)

```env
DATABASE_PATH=./data/lead-hunter.db

# Provedor de busca: manual | serpapi | serper | serper_places | multi | google_cse
SEARCH_PROVIDER=multi
SERPAPI_KEY=...
SERPER_API_KEY=...
GOOGLE_CSE_KEY=
GOOGLE_CSE_CX=
GOOGLE_PLACES_KEY=

# Scraping / Conformidade
USER_AGENT=LeadHunterIA/1.0 (+https://example.com/bot; contato@example.com)
REQUEST_DELAY_MS=1500
MAX_CONCURRENCY=3
REQUEST_TIMEOUT_MS=15000
MAX_RETRIES=2
RESPECT_ROBOTS_TXT=true
ROBOTS_CACHE_TTL_HOURS=24
USE_PLAYWRIGHT_FALLBACK=false

# LGPD
DEFAULT_LEGAL_BASIS=legitimo_interesse_comercial
EXPORT_INCLUDE_OPT_OUT=false

# Prospecção consultiva
GENERATE_OUTREACH_MESSAGES=true
GENERATE_ROI_ESTIMATE=true

# Logs
LOG_LEVEL=info
DEFAULT_COUNTRY=Brasil
```

Boot fail-fast: se uma chave inválida, o app não sobe (mensagem clara via Zod).

---

## 9. Testes (24/24 verdes)

| Arquivo | Cobertura |
|---|---|
| `normalization.test.ts` | Domain, phone (BR + edge cases), email, instagram, companyName |
| `dedup.test.ts` | Duplicado por domínio, telefone, WA↔tel cruzados, não-duplicado, lista |
| `scoring.test.ts` | Faixas de temperatura/prioridade, fórmula ponderada, edge cases |
| `prospecting.test.ts` | Gancho consultivo, mensagem por nicho, opt-out hint |
| `export.test.ts` | CSV filtra opt-out por padrão, inclui opt-out quando explícito |

Sem testes de integração (decisão consciente: pipeline depende de rede e APIs externas; rodaríamos contra mocks ou ambiente de homologação — vale colocar no roadmap).

---

## 10. Decisões de design notáveis

1. **SQLite local** ao invés de Postgres/Supabase desde o início:
   - Pró: zero infra, propriedade do dado, desenvolve sem servidor.
   - Contra: não escala para múltiplos usuários simultâneos. **Drizzle facilita a troca.**

2. **Vanilla JS no frontend** ao invés de React/Vue:
   - Pró: bundle minúsculo, sem build, debug direto no `index.html`.
   - Contra: state management caseiro; ao crescer, vale migrar.

3. **Multi-robô em paralelo (não fallback)**: `MultiSearchProvider` dispara todos os providers **simultaneamente** e mescla URLs únicas. Resultado: ~2× a cobertura vs. provider único.

4. **Cache de stats no Dashboard**: invalidado só quando dados mudam (refreshAll / initApp). Render em <2ms.

5. **Paginação server-side** com `LIMIT/OFFSET` + `COUNT(*)`. Notas/tarefas batch-loaded **apenas dos leads da página atual** (não da base inteira).

6. **Anti race-condition na busca**: cada `loadLeadsPage` tem um `lastReqId`. Respostas cuja id é menor que a última são descartadas → digitar rápido na busca nunca renderiza dados velhos.

7. **Deep link via hash**: URL é fonte da verdade dos filtros. Refresh, compartilhamento e back/forward do navegador "just work".

8. **Migração idempotente sem drizzle-kit push**: `PRAGMA table_info` detecta colunas faltando antes do `ALTER`. Mais previsível, especialmente em produção.

---

## 11. Riscos & débitos técnicos para discutir

| Item | Risco | Mitigação sugerida |
|---|---|---|
| SQLite + multi-usuário | Lock de escrita em concorrência | Migrar para Postgres antes de subir |
| Automações cosméticas | Usuário pode achar que estão ativas | Adicionar badge "Em breve" + roadmap visível |
| Frontend num único HTML | Difícil testar componentes | Refatorar em módulos JS quando crescer |
| Provider Google CSE despriorizado | Pode parecer "esquecido" | Documentado no README (limitações comerciais) |
| Score com regras fixas | Pouca calibração por nicho | Permitir ajustar pesos no Settings |
| Sem auth | Qualquer um no localhost acessa | Adicionar token básico quando sair do localhost |
| LGPD | Estrutura técnica OK, política não | Revisar com jurídico antes de produção |

---

## 12. Comandos úteis para a equipe

```bash
# Setup
npm install
cp .env.example .env
npm run db:migrate

# Operação
npm run web              # painel http://localhost:3000
npm start                # CLI interativo
npm test                 # suíte Vitest
npm run typecheck        # tsc --noEmit
npm run db:studio        # Drizzle Studio (browser do DB)

# Migração de uma máquina pra outra
# Basta copiar a pasta data/ inteira → SQLite + tudo persistido viaja junto.
```

---

Documento mantido por: time Lead Hunter IA.
