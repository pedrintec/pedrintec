# LEAD HUNTER IA — Guia Completo

## O que é

Lead Hunter IA é uma ferramenta de linha de comando (e painel web local) que **busca automaticamente empresas locais** em um nicho e cidade definidos por você, extrai os dados de contato públicos (telefone, WhatsApp, e-mail, Instagram, LinkedIn) e **pontua cada lead** de acordo com o potencial de venda de agentes de IA.

O objetivo central é: você informa "clínicas odontológicas em Curitiba" → a ferramenta devolve uma lista priorizada de empresas sem chatbot, com WhatsApp público e formulário de contato manual — exatamente quem mais precisa (e tende a pagar por) um agente de IA.

---

## Como funciona por dentro

O fluxo em 4 etapas acontece automaticamente a cada busca:

```
1. DORKS  →  gera consultas avançadas do Google (Google Dorks) a partir de cidade + nicho
2. BUSCA  →  envia as consultas para SerpAPI, Google CSE ou exibe as URLs manualmente
3. SCRAPING  →  visita cada site encontrado, extrai contatos e sinais de oportunidade
4. SCORE  →  pontua 0-100, classifica Quente/Morno/Frio e detecta tipos de agente IA
```

Todos os leads são salvos num banco SQLite local (`./data/lead-hunter.db`) com deduplicação automática.

---

## Modos de busca

| Modo | Descrição | Quando usar |
|---|---|---|
| `completa` | Máximas queries, inclui Instagram e "fale conosco" | Primeira prospecção ampla |
| `rapida` | Apenas 3 queries de alto sinal (WhatsApp, contato, agendamento) | Validação rápida de nicho |
| `somente-sites` | Foca em domínios `.com.br` com formulário | Quando quer sites institucionais |

---

## Como rodar

### Pré-requisitos

- Node.js 20 ou superior
- Dependências instaladas: `npm install`
- Banco criado: `npm run db:migrate`

### Interface interativa (padrão)

```bash
npm start
```

A ferramenta pergunta cidade, estado, nicho, quantidade de leads e tipo de busca. Ao final, pergunta se quer exportar.

### Linha de comando sem perguntas (modo --yes)

```bash
npm start -- --city "São Paulo" --region "SP" --niche "clínica odontológica" --max 30 --type completa --export csv,xlsx --yes
```

### Painel web local

```bash
npm run web
```

Abre em `http://localhost:3000` — interface gráfica com progresso ao vivo (Server-Sent Events), histórico de buscas e download direto dos arquivos.

---

## Provedores de busca

O provedor é definido no arquivo `.env`. Copie `.env.example` para `.env` antes de começar.

### Manual (padrão — sem custo)

```
SEARCH_PROVIDER=manual
```

Não consulta nenhuma API. A ferramenta apenas **gera as queries e exibe as URLs do Google** para você abrir manualmente no navegador. Útil para testar sem gastar créditos.

### SerpAPI (recomendado para automação)

```
SEARCH_PROVIDER=serpapi
SERPAPI_KEY=sua_chave_aqui
```

Tem free tier. Cadastre em https://serpapi.com. Com esta chave o scraping acontece totalmente automático.

### Google Custom Search (alternativa)

```
SEARCH_PROVIDER=google_cse
GOOGLE_CSE_KEY=sua_chave_aqui
GOOGLE_CSE_CX=seu_cx_aqui
```

Configure a engine em https://programmablesearchengine.google.com e a chave em https://console.cloud.google.com.

---

## Sistema de pontuação (Score 0–100)

Cada lead é avaliado automaticamente. Veja como os pontos são somados:

| Critério | Pontos |
|---|---|
| WhatsApp público detectado | +25 |
| Sem chatbot/automação aparente | +20 |
| Nicho de alta demanda (clínica, salão, delivery, academia...) | +15 |
| Site simples / desatualizado | +15 |
| Sinais de intenção (agendamento, orçamento, atendimento...) | +até 15 |
| Presença em Instagram ou LinkedIn | +10 |
| Formulário de contato manual | +10 |
| Múltiplos canais (telefone + e-mail) | +5 |
| Já possui chatbot | -10 |

**Temperatura:**
- 🔥 **Quente** — score ≥ 70: máxima prioridade, aborde primeiro
- 🌤️ **Morno** — score 40–69: bom potencial, vale abordar
- ❄️ **Frio** — score < 40: baixa oportunidade imediata

---

## Tipos de oportunidade detectados

A ferramenta identifica automaticamente qual tipo de agente faz sentido para cada lead:

- **Agente para WhatsApp** — empresa com WhatsApp público
- **Agente de atendimento 24h** — sem chatbot detectado
- **Agente de suporte** — sem automação + sinais de atendimento
- **Agente de agendamento** — palavras como "agendamento", "reserva", "horário"
- **Agente de vendas** — sinais de orçamento, delivery, pedido
- **Agente de qualificação de leads** — formulário de contato ou sinais de venda
- **Agente de recuperação de clientes** — nichos de saúde, beleza, academia, pet

---

## Exportação

Ao final de qualquer busca a ferramenta pergunta se quer exportar. Formatos disponíveis:

| Formato | Uso |
|---|---|
| **CSV** | Excel, Google Sheets, qualquer planilha |
| **JSON** | Integração com outros sistemas ou APIs |
| **XLSX** | Excel com formatação (cabeçalho em negrito, colunas ajustadas) |

Os arquivos vão para a pasta `./exports/` com timestamp no nome.

**Campos exportados:** Empresa, Site, Cidade, Estado, Nicho, Telefone, WhatsApp, E-mail, Instagram, LinkedIn, Endereço, Score, Temperatura, Oportunidades IA, Evidências, URL Fonte, Data de coleta.

---

## Configurações avançadas no .env

| Variável | Padrão | O que controla |
|---|---|---|
| `REQUEST_DELAY_MS` | 1500 | Pausa entre requisições ao mesmo host (ms) |
| `MAX_CONCURRENCY` | 3 | Requisições simultâneas máximas |
| `REQUEST_TIMEOUT_MS` | 15000 | Timeout por página (ms) |
| `MAX_RETRIES` | 2 | Tentativas extras em falha de rede |
| `RESPECT_ROBOTS_TXT` | true | Respeita robots.txt antes de raspar |
| `USE_PLAYWRIGHT_FALLBACK` | false | Usa Chrome headless para sites em JS pesado* |
| `LOG_LEVEL` | info | Verbosidade: debug / info / warn / error |

*Para ativar Playwright: `npm i playwright && npx playwright install chromium`, depois `USE_PLAYWRIGHT_FALLBACK=true`

---

## Nichos com melhor resultado

A ferramenta tem heurísticas específicas para estas famílias de nicho:

- **Saúde:** clínicas, odontologia, fisioterapia, psicologia — detecta agendamento/convênio
- **Beleza:** salões, barbearias, estéticas — detecta horário e agendamento
- **Alimentação:** restaurantes, delivery, cafés — detecta cardápio e pedidos
- **Jurídico:** advogados, escritórios — detecta consulta e atendimento
- **Educação:** cursos, escolas, faculdades — detecta matrícula e inscrição
- **Imobiliário:** imobiliárias, corretores — detecta visita e aluguel
- **Serviços gerais:** qualquer outro — usa termos genéricos de atendimento

---

## Dicas para tirar o melhor proveito

1. **Comece pelo modo manual** para validar que as queries estão encontrando o que você quer, sem gastar crédito de API.

2. **Configure SerpAPI** (tem plano gratuito com 100 buscas/mês) para coleta totalmente automática.

3. **Rode `completa` com 50 leads** na primeira vez num nicho, depois use `rapida` para top-ups periódicos.

4. **Filtre pelo score** após exportar para CSV: ordene pela coluna "Score" e foque nos leads ≥ 60.

5. **Nicho específico bate nicho genérico:** "clínica odontológica" devolve resultados mais precisos que apenas "odontologia".

6. **Use o painel web (`npm run web`)** se você preferir interface visual — tem barra de progresso em tempo real e exportação com um clique.

7. **Banco acumulativo:** cada busca adiciona leads novos sem duplicar. Você pode rodar várias cidades do mesmo nicho e exportar tudo de uma vez via `GET /api/export/csv`.

8. **Ative o Playwright** apenas se perceber que muitos sites retornam vazios — ele é mais lento mas consegue raspar páginas que dependem de JavaScript.

---

## Estrutura de pastas relevante

```
lead-hunter-ia/
├── src/
│   ├── cli/index.ts        ← Ponto de entrada CLI
│   ├── server/index.ts     ← Painel web (Express)
│   ├── pipeline.ts         ← Orquestrador busca→scraping→score
│   ├── search/dorks.ts     ← Gerador de Google Dorks
│   ├── scrapers/           ← Extração de dados das páginas
│   ├── scoring/index.ts    ← Sistema de pontuação 0-100
│   ├── exporters/          ← CSV, JSON, XLSX
│   ├── database/           ← SQLite via Drizzle ORM
│   └── config/index.ts     ← Leitura e validação do .env
├── data/                   ← Banco SQLite (gerado no primeiro uso)
├── exports/                ← Arquivos exportados
├── .env.example            ← Modelo de configuração
└── .env                    ← Sua configuração (não vai para o git)
```

---

## Comandos npm resumidos

| Comando | O que faz |
|---|---|
| `npm start` | Inicia a CLI interativa |
| `npm run web` | Inicia o painel web em localhost:3000 |
| `npm run db:migrate` | Cria/atualiza o banco SQLite |
| `npm run db:studio` | Abre o Drizzle Studio (explorador visual do banco) |
| `npm run typecheck` | Verifica erros de TypeScript sem compilar |

---

*Gerado em 2026-06-23 — Lead Hunter IA v0.1.0*
