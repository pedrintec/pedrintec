# 🎯 Lead Hunter IA

Sistema **local** (roda no seu PC) para buscar **leads comerciais** com potencial
interesse em **agentes de IA humanizados** para atendimento, vendas, suporte,
agendamento ou automação interna.

Você informa **cidade + nicho**, ele gera buscas profissionais (Google Dorks),
coleta dados de contato **públicos**, calcula um **score de oportunidade**,
remove duplicados, salva em **SQLite** e exporta para **CSV/JSON/XLSX**.

> ⚖️ **Ética e conformidade são parte do design.** O sistema **não** raspa o
> Google Search nem o Google Maps diretamente (isso violaria os Termos de Uso).
> Ele usa **APIs oficiais** (SerpAPI / Google Custom Search) e faz scraping
> **leve e respeitoso** apenas de páginas públicas de empresas, com rate limit,
> User-Agent identificado, timeout, retry e respeito a `robots.txt`.

---

## 🧠 Prospecção consultiva (motor)

Mais do que coletar contatos, o sistema age como um **motor de prospecção consultiva**:

### Modos de busca
- **manual** (padrão) — gera os dorks/URLs para você abrir.
- **serpapi** — RECOMENDADO para escala (API oficial).
- **google_cse** — Google Custom Search. **Pode ter limitações comerciais**; use
  apenas se já tiver chave ativa. Não é o provedor principal.
- *(roadmap)* **google_places** (API oficial do Maps) e **imported_csv** (importar lista própria).

### Lead Scoring (3 blocos + evidências)
Cada lead recebe três notas (0–100), combinadas no **Score Final**:

| Bloco | Mede | Peso |
|-------|------|-----:|
| **Fit Comercial** | o nicho tem dor real para IA? | 0.40 |
| **Urgência Digital** | sinais de baixa automação (sem chatbot, site simples…) | 0.35 |
| **Acesso Comercial** | facilidade de abordagem (WhatsApp, telefone, e-mail…) | 0.25 |

`finalScore = round(fit*0.4 + urgência*0.35 + acesso*0.25)`

**Temperatura:** 🔥 Quente (≥70) · 🌤️ Morno (≥40) · ❄️ Frio (<40).
**Prioridade Comercial:** `atacar_hoje` (≥80) · `validar_manual` (≥60) · `nutrir` (≥40) · `descartar` (<40).
Cada ponto é registrado como **evidência** (tabela `score_evidences`).

### Argumentos comerciais automáticos
Para cada lead o sistema gera, a partir das evidências:
- **Diagnóstico do site** (achados, riscos, oportunidades de IA);
- **Gancho comercial** (frase consultiva, sem promessas);
- **Mensagem de abordagem** adaptada ao nicho + opção de **opt-out**;
- **Estimativa de ROI** (com disclaimer — premissas genéricas).

### Mini-CRM
Cada lead tem **status comercial** (`novo → validado → contatado → respondeu →
reuniao_marcada → cliente | sem_interesse | descartado`) e um **histórico de
atividades** (`lead_activities`). Altere o status pelo painel (modal do lead).

### Conformidade & LGPD
- Campos de origem em todo lead: `dataOrigin`, `legalBasis`, `sourceProvider`,
  `sourceUrl`, `firstSeenAt`, `lastSeenAt`.
- **Opt-out**: registrado em `opt_outs` + `optOutAt`; leads com opt-out **não são
  exportados** por padrão (`EXPORT_INCLUDE_OPT_OUT=false`).
- **robots.txt** respeitado (cache em `robots_cache`) e todo acesso é logado em `scrape_logs`.
- **Confiança do dado** (`dataConfidence`, 0–100) por origem do contato.
- Foco em **dados comerciais públicos**; não coletar dados sensíveis; não usar para spam.

---

## 📦 Stack

Node.js + TypeScript · SQLite (Drizzle ORM + better-sqlite3) · Axios · Cheerio ·
Playwright (opcional) · Zod · Commander + Inquirer · ExcelJS.

## 🗂️ Estrutura

```
src/
  cli/         Interface interativa (entrada do usuário, tabela, exportação)
  config/      Carregamento/validação do .env (Zod)
  database/    Schema Drizzle, conexão, migração, repositório + dedup
  search/      Geração de dorks + provedores (SerpAPI, Google CSE, manual)
  scrapers/    Fetch HTTP, extração com Cheerio, fallback Playwright
  scoring/     Lead scoring (0-100) + detecção de oportunidades de IA
  exporters/   CSV, JSON, XLSX
  utils/       logger, rate limit, http, robots.txt, texto/regex/dedup
  types/       Tipos compartilhados
  pipeline.ts  Orquestra busca -> análise -> score -> dedup -> persistência
```

---

## 🚀 Instalação

```bash
cd lead-hunter-ia
npm install
cp .env.example .env      # no Windows (PowerShell): copy .env.example .env
npm run db:migrate
npm start
```

> **Observação sobre `better-sqlite3`:** é um módulo nativo. No Node 24 normalmente
> baixa um binário pré-compilado. Se a instalação reclamar de compilação no Windows,
> instale os *Build Tools*: `npm i -g windows-build-tools` ou o "Desktop development
> with C++" do Visual Studio.

---

## ⚙️ Configuração do `.env`

| Variável | Para quê |
|----------|----------|
| `SEARCH_PROVIDER` | `manual` (padrão), `serpapi` ou `google_cse` |
| `SERPAPI_KEY` | chave da [SerpAPI](https://serpapi.com) (tem free tier) |
| `GOOGLE_CSE_KEY` / `GOOGLE_CSE_CX` | API key + ID da [Programmable Search](https://programmablesearchengine.google.com) |
| `USER_AGENT` | identifica seu bot (ética) |
| `REQUEST_DELAY_MS` / `MAX_CONCURRENCY` | rate limit |
| `REQUEST_TIMEOUT_MS` / `MAX_RETRIES` | robustez de rede |
| `RESPECT_ROBOTS_TXT` | respeitar `robots.txt` (recomendado: `true`) |
| `USE_PLAYWRIGHT_FALLBACK` | renderizar páginas JS (requer Playwright) |

### Modos de busca

- **`manual`** (padrão, sem chave): gera os dorks e as URLs de busca do Google
  para você abrir no navegador. **Não coleta automaticamente** — é o modo 100%
  dentro dos Termos de Uso para começar sem custo.
- **`serpapi`**: coleta automática via API oficial da SerpAPI.
- **`google_cse`**: coleta automática via Google Custom Search JSON API
  (100 queries/dia grátis).

---

## 🖥️ Painel web (recomendado)

Interface visual local com busca ao vivo, tabela elegante, filtros e exportação:

```bash
npm run web
```

Depois abra **http://localhost:3000** no navegador. O painel tem:
- Formulário de busca (cidade, estado, nicho, máx., tipo)
- **Progresso ao vivo** (cada lead aparece em tempo real via Server-Sent Events)
- Cards de estatística (total / quentes / mornos / frios)
- Tabela com WhatsApp, telefone, e-mail, redes, oportunidades de IA e score
- Filtro por texto e por temperatura
- Botões de exportar CSV / XLSX / JSON

> O painel reaproveita exatamente o mesmo pipeline da CLI.

## ▶️ Como rodar (CLI)

Interativo:

```bash
npm start
```

Ele pergunta: **cidade**, **estado/país**, **nicho**, **máx. de leads**, **tipo de busca**.
Depois mostra os dorks, coleta, exibe uma **tabela** no terminal e pergunta se quer exportar.

Não-interativo (automação):

```bash
npm start -- --city "Goiânia" --region "GO" --niche "clínica odontológica" --max 30 --type completa --export csv,xlsx --yes
```

---

## 💾 Como exportar leads

No fim da execução o sistema pergunta o formato (CSV / JSON / XLSX) ou use
`--export csv,json,xlsx`. Os arquivos vão para a pasta `./exports`.

Colunas: Empresa, Site, Cidade, Estado/País, Nicho, Telefone, WhatsApp, E-mail,
Instagram, LinkedIn, Endereço, Score, Temperatura, Oportunidades IA, Evidências,
Fonte (URL), Coletado em.

---

## 🧮 Como funciona o Lead Scoring (0–100)

Cada ponto vem com uma **evidência** (campo `Evidências`):

| Sinal | Pontos |
|-------|-------:|
| WhatsApp público | +25 |
| Sem chatbot/automação aparente | +20 |
| Nicho de alta demanda por atendimento | +15 |
| Site simples/desatualizado | +15 |
| Sinais de intenção (agendamento, orçamento, suporte…) | até +15 |
| Formulário de contato | +10 |
| Redes sociais ativas | +10 |
| Múltiplos canais (telefone + e-mail) | +5 |
| Já possui chatbot | −10 |

Classificação: **🔥 Quente** (≥70) · **🌤️ Morno** (≥40) · **❄️ Frio** (<40).

Oportunidades detectadas: agente de atendimento 24h, qualificação de leads,
agendamento, vendas, suporte, WhatsApp, recuperação de clientes.

---

## ➕ Como adicionar novas fontes

1. Crie `src/search/providers/minhaFonte.ts` implementando a interface
   `SearchProvider` (`{ name, search(query, limit) }`) — veja
   `googleCustomSearch.ts` como modelo.
2. Registre no `switch` de `src/search/index.ts` (`getProvider`).
3. Adicione a opção em `SEARCH_PROVIDER` (config/Zod) e no `.env.example`.

Para um **novo extrator** (ex.: capturar CNPJ): edite `src/scrapers/extract.ts`
(adicione um regex/seletor) e o tipo `ExtractedData` em `src/types`.

Novos **dorks por nicho**: ajuste `NICHE_EXTRA` / `guessNicheFamily` em
`src/search/dorks.ts`.

---

## 📈 Como evoluir

- **Google Places API / Maps**: criar `PlacesProvider` que chama a Places API
  oficial (`textsearch`/`details`) e mapeia para `SearchResult`/`Lead`. Lembre-se
  da política de cache de até 30 dias do Google.
- **SerpAPI avançado**: usar engines de Maps/Local da própria SerpAPI para pegar
  telefone/endereço já estruturados (menos scraping).
- **CRM**: criar `src/integrations/crm.ts` com push para HubSpot/Pipedrive/RD
  Station via API; chamar após `saveLeads` no `pipeline.ts`.
- **Dashboard web**: trocar a CLI por Express/Next.js reaproveitando `runPipeline`.
- **Enriquecimento**: integrar e-mail finder/validador, checagem de WhatsApp Business.
- **Agendamento**: rodar buscas recorrentes (cron) e diffar leads novos.

---

## ⚖️ Limites legais e éticos (leia)

- Colete **apenas dados comerciais públicos** (telefone/e-mail de negócio, redes).
  **Não** colete dados pessoais sensíveis.
- Respeite `robots.txt`, ToS dos sites e a **LGPD** (base legal, finalidade,
  opt-out). Mensagens de prospecção devem permitir descadastro.
- Não use para spam em massa. Rate limit existe para não sobrecarregar terceiros.
- Este projeto é um **MVP educacional/comercial responsável**; a responsabilidade
  pelo uso é de quem opera.
