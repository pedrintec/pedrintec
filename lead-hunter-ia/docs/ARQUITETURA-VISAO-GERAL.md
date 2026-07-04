# Lead Hunter IA — Visão Geral para a Equipe

> Documento para análise técnica e de produto.
> Última atualização: 2026-06-25
> Estado: MVP funcional, local, com dados reais.

---

## 1. O que o sistema faz

Plataforma local de **prospecção comercial consultiva** que:

1. **Encontra empresas** públicas usando 2 robôs de busca em paralelo (SerpAPI + Serper).
2. **Raspa páginas públicas** das empresas com respeito a `robots.txt`, rate limit e UA identificado.
3. **Pontua cada lead** em 3 blocos (Fit Comercial, Urgência Digital, Acesso Comercial), gera diagnóstico do site, gancho comercial, mensagem de abordagem e estimativa de ROI.
4. **Persiste tudo no SQLite** local (sem dependência de SaaS).
5. **Painel web** estilo CRM (Dashboard, Hunter IA, CRM Funil, Leads, Tarefas, Automações, Configurações).
6. **Exporta** CSV / JSON / XLSX com filtro de opt-out (LGPD).

> Diferencial: tudo roda no PC do usuário, sem dependência de SaaS pago. Decisão consciente para **propriedade do dado** e **conformidade local**.

---

## 2. Stack

### Backend
| Camada | Tecnologia | Por quê |
|---|---|---|
| Runtime | Node.js 24 + TypeScript + `tsx` | Sem build step; rápido pra iterar localmente |
| Web | Express 4 | Pequeno, conhecido, SSE nativo |
| DB | SQLite via Drizzle ORM + `better-sqlite3` | Zero infra; queries síncronas; tipado |
| Validação | Zod | Schema de env e de input |
| HTTP client | Axios | Familiar; suporte a interceptors |
| Scraping | Cheerio + Playwright (opcional, lazy) | Cheerio cobre 90%; Playwright só pra páginas JS-heavy |
| Concorrência | `p-limit` | Rate-limit global do scraper |
| Robots | `robots-parser` | Padrão da indústria |
| CLI | Commander + Inquirer (`@inquirer/prompts`) | Mantemos o uso por terminal |
| Export | `exceljs` | XLSX com freeze/filtro/destaque |
| Testes | Vitest | Familiar, rápido |

### Frontend
- **HTML/CSS/JS vanilla** (sem framework). Decisão consciente: o backend já entrega tudo via API; o front é uma SPA simples (~1.7K linhas) que se mantém **100% API-driven** (sem localStorage exceto para preferência de paginação e tema).
- **Identidade visual**: tema Gravity (dark glassmorphism + gradientes índigo/ciano/âmbar). Vide `index.html` linhas 1-500 (CSS).
- **Premium polish**: hover/active/focus em todos os controles, animações stagger, skeleton de carregamento, mouse spotlight nos botões primários.

---

## 3. Funcionalidades por seção do painel

### 📊 Dashboard
- **8 KPIs em cards** com `stat-ico` flutuante (Total, Quentes, Pipeline R$, Conversão, Tarefas hoje, Com WhatsApp, Clientes, Robôs ativos).
- **Funil Comercial** com 7 etapas e barras gradientes coloridas por etapa.
- **Top 6 Oportunidades** com avatar de iniciais + temperatura.
- **Próxima Melhor Ação**: heurística que sugere o próximo lead a abordar.
- **Saúde Comercial**: % de organização da base + tarefas em aberto.
- **3 cards de Insights**: nicho dominante, atacar hoje, modo de busca.
- **Cache de stats**: `getStats()` em **1 loop O(n)**; renderização medida em <2ms.

### 🔎 Lead Hunter IA
- Formulário de configuração da caça (nicho, cidade, UF, oferta, tipo, profundidade, score mínimo, máx. de leads).
- **Gera dorks reais** chamando `POST /api/preview` (não é mock).
- **Rodar prospecção** via SSE (`/api/search/stream`): dispara os 2 robôs em paralelo, mostra leads chegando ao vivo, salva no SQLite.
- **Copiar todos / Exportar dorks** (download `.txt`).

### 🧭 CRM Funil
- **Kanban com 7 colunas** (Novo · Qualificado · Em contato · Reunião · Proposta · Cliente · Perdido).
- Cada coluna tem **barra colorida** por etapa, contador, soma R$ e estado vazio elegante.
- **Drag-and-drop** que persiste a mudança via `POST /api/leads/:id/stage`.

### 👥 Leads
- **Paginação server-side** com `LIMIT/OFFSET`, default 10/página (também 25 e 50).
- **Chips de data** (Todos · Hoje · Ontem · Últimos 7 dias · Este mês).
- **Filtros**: busca livre (debounce 250ms), nicho, cidade, temperatura, etapa, ordenação (mais recentes / score / valor / último contato).
- **Cabeçalho fixo**, **skeleton** durante o fetch, **estado vazio** quando filtros não retornam.
- **Anti race-condition**: cada request tem `reqId` para ignorar respostas atrasadas.
- **Deep link**: filtros e página vão pro `#hash` da URL → compartilhável, refresh-safe, back/forward do navegador funciona.
- **Navegação por teclado**: ← / → mudam de página (ignora se foco em campo de texto).
- **Preferência `perPage`** salva no `localStorage`.

### ✅ Tarefas
- 4 colunas: Hoje, Atrasadas, Próximas, Concluídas.
- Cada tarefa tem **prioridade** (Alta/Média/Baixa) colorida.
- Concluir / Reabrir / Excluir.
- Criar tarefa avulsa ou vinculada a um lead.

### ⚡ Automações
- 6 playbooks visuais (cosmético por enquanto): Speed-to-Lead, Follow-up Inteligente, Nurturing Mensal, Qualificação SDR, Score Dinâmico, Alerta Quente.
- **Roadmap**: ligar a cron + ações reais (WhatsApp/Email).

### ⚙️ Configurações
- Nome da agência, template de mensagem com variáveis (`{agencia}`, `{empresa}`, `{cidade}`, `{nicho}`, `{dor}`, `{oferta}`), lista de nichos, tema dark/light.
- Persistido no SQLite via `GET/PUT /api/settings`.

---

## 4. Fluxo end-to-end (prospecção)

```
[Painel] Hunter IA → Gerar Dorks (POST /api/preview)
   ↓
[Painel] Rodar Prospecção (SSE GET /api/search/stream)
   ↓
[Pipeline]
   1. runSearch(input)  → MultiProvider (SerpAPI + Serper + Serper Places em paralelo)
   2. analyzePage(url)  → robots.txt → HTTP GET → Cheerio → extractFromHtml
   3. computeScoreBreakdown(data, niche) → fitScore + urgencyScore + accessScore
   4. detectOpportunities + websiteDiagnostic + commercialHook + outreachMessage + roiEstimate
   5. dedupeLeads (normalização: domínio/telefone/email/instagram + similaridade de nome)
   6. saveLeads → SQLite + score_evidences + lead_activities
   ↓
[Painel] EventSource onLead/onDone → atualiza tabela em tempo real
```

---

## 5. Bancos de dados (SQLite local)

**Total atual: 14 tabelas, 157 leads reais, 1184 evidências de score, 301 scrape_logs, 35 buscas executadas.**

### Modelo (resumido)

```
┌─────────────────────────┐
│ searches                │  histórico de execuções
└────────────┬────────────┘
             │
             │ search_id
             ▼
┌─────────────────────────┐       ┌────────────────────────┐
│ leads                   │       │ lead_activities        │
│   (157 linhas, ~80 cols)│←─────┤  (notas + auditoria)   │
└──────┬──────┬───────────┘       └────────────────────────┘
       │      │
       │      └─────┐
       ▼            ▼
┌─────────┐  ┌──────────────┐  ┌─────────────────┐
│ lead_   │  │ score_       │  │ opt_outs        │
│ tasks   │  │ evidences    │  │ (LGPD)          │
└─────────┘  └──────────────┘  └─────────────────┘

Tabelas de conformidade (independentes):
  robots_cache (150 linhas) · scrape_logs (301 linhas)

Tabelas auxiliares (preparadas, ainda não populadas):
  search_runs · search_queries · contacts · settings · sources · execution_history
```

### Tabela `leads` (a principal)

Possui **~80 colunas**, agrupadas em famílias:
- **Identidade**: companyName, normalizedCompanyName, domain, rootDomain
- **Contato**: phone, whatsapp, email, instagram, linkedin, site + versões `normalized_*`
- **Local**: city, region, country, address
- **Origem & LGPD**: sourceProvider, sourceUrl, sourceQuery, dataOrigin, legalBasis, dataConfidence
- **Score**: score, finalScore, fitScore, urgencyScore, accessScore, temperature, commercialPriority + scoreEvidences (JSON)
- **Prospecção consultiva**: websiteDiagnostic (JSON), commercialHook, outreachMessage, roiEstimate (JSON), opportunities (JSON)
- **CRM**: stage, dealValue, owner, nextAction, lastContactAt, commercialStatus, optOutAt
- **Datas**: firstSeenAt, lastSeenAt, lastCheckedAt, collectedAt

Migrações são **idempotentes** (`ALTER TABLE ADD COLUMN` via `PRAGMA table_info` para detectar colunas faltando). Roda com `npm run db:migrate` em qualquer ambiente.

---

## 6. Conformidade & LGPD

- **Base legal por lead** (`legalBasis`): legítimo interesse comercial / dados públicos comerciais / consentimento / importado pelo usuário.
- **Origem do dado** registrada (`dataOrigin`, `sourceProvider`, `sourceUrl`, `sourceQuery`).
- **Confiança do dado** (`dataConfidence` 0-100) com heurística por origem do canal.
- **robots.txt**: respeitado quando `RESPECT_ROBOTS_TXT=true`; cache em `robots_cache` com TTL configurável.
- **Logs de scraping**: cada acesso (status, sucesso, duração, allowed) gravado em `scrape_logs` para auditoria.
- **Opt-out**: `POST /api/leads/:id/opt-out` → marca `optOutAt`. **Exportação ignora opt-out por padrão** (`EXPORT_INCLUDE_OPT_OUT=false`).
- **Rate limit + UA identificado** (`USER_AGENT=LeadHunterIA/1.0 ...`).
- **Não coletamos dados sensíveis** — só contatos comerciais públicos.

---

## 7. Como rodar

```bash
# Setup (1ª vez)
npm install
cp .env.example .env
# Edite o .env: SEARCH_PROVIDER=multi, SERPAPI_KEY=..., SERPER_API_KEY=...
npm run db:migrate

# CLI (modo terminal)
npm start

# Painel web
npm run web         # http://localhost:3000

# Atalho Windows
duplo-clique em INICIAR-PAINEL.bat

# Testes
npm test            # 24 testes Vitest, todos passando
npm run typecheck   # tsc --noEmit, 0 erros
```

---

## 8. Estado da entrega

| Item | Estado |
|---|---|
| Backend | ✅ Pronto (24/24 testes verdes) |
| Frontend Gravity | ✅ Pronto, API-driven, 7 seções |
| Multi-robô SerpAPI + Serper | ✅ Validado com chamadas reais |
| CRM persistido no banco | ✅ Drag-and-drop salva |
| Paginação server-side + deep link | ✅ Validada, anti race-condition |
| Conformidade LGPD (opt-out, robots, logs) | ✅ Implementada |
| 157 leads reais no banco | ✅ Coletados ao longo do desenvolvimento |
| Automações reais (cron + ações) | 🟡 UI pronta, lógica é cosmética |
| Provider de importação CSV | 🟡 Roadmap |
| Google Places API (oficial) | 🟡 Roadmap (placeholder no `.env`) |
| Dashboard com gráficos temporais | 🟡 Sugestão para próxima sprint |

---

## 9. Próximos passos sugeridos para discussão com a equipe

1. **Subir para um servidor compartilhado** (Render/Fly.io/EC2) com SQLite local + backup S3 → primeiro passo de squad.
2. **Trocar SQLite por Postgres** se múltiplos vendedores forem editar ao mesmo tempo. Drizzle suporta troca.
3. **Implementar as Automações de verdade**: cron noturno + webhook WhatsApp.
4. **Paginação na aba Tarefas** (mesmo padrão da tela de Leads).
5. **Export do filtro atual**: hoje exporta tudo; expor `?search=...&niche=...` no `/api/export`.
6. **Gráficos temporais** no Dashboard (leads/dia, conversão por semana).
7. **Multi-usuário**: auth + escopo por agência.
8. **Discutir base legal** com jurídico (LGPD) — temos a estrutura técnica, falta o policy.

---

Para o detalhamento técnico de endpoints, módulos, schema e regras de score, consultar **`docs/TECNICO-DETALHADO.md`**.
