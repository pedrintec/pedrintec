# 📖 Guia de Uso — Lead Hunter IA

Guia prático, passo a passo, para usar o sistema do zero ao primeiro lote de leads.
Leitura recomendada na ordem. Tempo até o primeiro uso: **~5 minutos**.

> 📍 Pasta do projeto: `C:\Users\Pedro\Desktop\lead-hunter-ia`
> Todos os comandos abaixo são rodados **dentro dessa pasta** no PowerShell.

> 🖥️ **Quer a forma mais fácil e visual?** Depois de instalar (seção 1), rode
> **`npm run web`** e abra **http://localhost:3000**. Você terá um painel bonito
> com busca ao vivo, tabela, filtros e botões de exportar — sem usar o terminal.
> O guia abaixo cobre tanto o painel quanto a versão de linha de comando (`npm start`).

---

## 🧭 Índice

1. [Instalação (só na primeira vez)](#1-instalação-só-na-primeira-vez)
2. [Os 3 modos de busca — qual escolher](#2-os-3-modos-de-busca--qual-escolher)
3. [Uso rápido (modo manual, sem chave)](#3-uso-rápido-modo-manual-sem-chave)
4. [Uso automático (com chave de API)](#4-uso-automático-com-chave-de-api)
   - [4A. SerpAPI](#4a-configurar-serpapi-mais-simples)
   - [4B. Google Custom Search](#4b-configurar-google-custom-search-100-buscasdia-grátis)
5. [Entendendo a tela de resultados](#5-entendendo-a-tela-de-resultados)
6. [Exportando os leads](#6-exportando-os-leads-csv--json--xlsx)
7. [O que significa o Score e a Temperatura](#7-o-que-significa-o-score-e-a-temperatura)
8. [Receitas prontas por nicho](#8-receitas-prontas-por-nicho-copiar-e-colar)
9. [Modo automação (sem perguntas)](#9-modo-automação-sem-perguntas)
10. [Onde os dados ficam salvos](#10-onde-os-dados-ficam-salvos)
11. [Solução de problemas](#11-solução-de-problemas)
12. [Boas práticas e limites legais](#12-boas-práticas-e-limites-legais-leia)

---

## 1. Instalação (só na primeira vez)

Abra o PowerShell e rode, **uma linha por vez**:

```powershell
cd C:\Users\Pedro\Desktop\lead-hunter-ia
npm install
copy .env.example .env
npm run db:migrate
```

O que cada comando faz:

| Comando | Para quê |
|---------|----------|
| `cd ...` | Entra na pasta do projeto |
| `npm install` | Baixa as dependências (só 1ª vez) |
| `copy .env.example .env` | Cria seu arquivo de configuração |
| `npm run db:migrate` | Cria o banco de dados local (SQLite) |

✅ Se aparecer **"✅ Migração concluída. Tabelas prontas."**, está tudo pronto.

> ⚠️ **Já está instalado neste computador.** Você só precisa repetir isso se trocar de PC ou apagar a pasta `node_modules`.

---

## 2. Os 3 modos de busca — qual escolher

O sistema busca leads de 3 formas. Você escolhe no arquivo `.env`, na linha `SEARCH_PROVIDER`.

| Modo | Precisa de chave? | Coleta sozinho? | Quando usar |
|------|:---:|:---:|------|
| **`manual`** | ❌ Não | ❌ Não — só gera as buscas | Para testar e começar **hoje, de graça** |
| **`serpapi`** | ✅ Sim (free tier) | ✅ Sim, automático | O mais fácil de automatizar |
| **`google_cse`** | ✅ Sim (grátis até 100/dia) | ✅ Sim, automático | 100% gratuito com limite diário |

**Resumo da decisão:**
- Quer testar **agora, sem cadastro**? → use `manual` (já é o padrão).
- Quer que ele **colete os contatos sozinho**? → configure `serpapi` ou `google_cse`.

---

## 3. Uso rápido (modo manual, sem chave)

Este é o jeito de começar sem configurar nada.

```powershell
npm start
```

O sistema vai perguntar:
1. **Cidade** → ex.: `Goiânia`
2. **Estado ou país** → ex.: `GO`
3. **Nicho** → ex.: `clínica odontológica`
4. **Quantidade máxima de leads** → ex.: `20`
5. **Tipo de busca** → escolha com as setas: *Completa*, *Rápida* ou *Somente sites*

Ele então mostra uma **lista de buscas prontas** (Google Dorks) com os links:

```
1. "clínica odontológica" "Goiânia" "WhatsApp"
   ↳ https://www.google.com/search?q=...
2. "clínica odontológica" "Goiânia" "agendamento"
   ↳ https://www.google.com/search?q=...
```

👉 **No modo manual, seu trabalho é:** abrir esses links no navegador, ver as empresas que aparecem e anotar/contatar. O sistema **não preenche a tabela sozinho** nesse modo (isso é proposital — respeita os Termos de Uso do Google).

Para o sistema **preencher tudo sozinho**, vá para a próxima seção.

---

## 4. Uso automático (com chave de API)

Aqui o sistema faz tudo: busca, abre os sites das empresas, extrai telefone/WhatsApp/e-mail, pontua e salva. Você só precisa de **uma** das duas opções abaixo.

### 4A. Configurar SerpAPI (mais simples)

1. Crie conta grátis em **https://serpapi.com/users/sign_up**
2. Acesse **https://serpapi.com/manage-api-key** e copie sua *API Key*
3. Abra o arquivo `.env` (na pasta do projeto) num editor de texto e ajuste:

```ini
SEARCH_PROVIDER=serpapi
SERPAPI_KEY=cole_sua_chave_aqui
```

4. Salve e rode:

```powershell
npm start
```

> 💡 O plano grátis da SerpAPI dá ~100 buscas/mês. Cada execução usa várias buscas (uma por dork), então comece com `Tipo de busca: Rápida` para economizar.

### 4B. Configurar Google Custom Search (100 buscas/dia grátis)

1. **Crie o mecanismo de busca:** acesse https://programmablesearchengine.google.com/controlpanel/create
   - Em "O que pesquisar", marque **"Pesquisar em toda a Web"**
   - Crie e copie o **ID do mecanismo (cx)**
2. **Crie a API Key:** acesse https://console.cloud.google.com/apis/credentials
   - Crie um projeto (se não tiver) → "Criar credenciais" → "Chave de API"
   - Ative a **"Custom Search API"** em https://console.cloud.google.com/apis/library/customsearch.googleapis.com
3. No `.env`:

```ini
SEARCH_PROVIDER=google_cse
GOOGLE_CSE_KEY=cole_sua_api_key
GOOGLE_CSE_CX=cole_seu_id_do_mecanismo
```

4. Salve e rode `npm start`.

> 💡 Limite gratuito: **100 buscas por dia**. Use `Tipo de busca: Rápida` (3 buscas) ou `Completa` (até ~16 buscas) conforme seu saldo do dia.

---

## 5. Entendendo a tela de resultados

Ao final, no modo automático, aparece uma tabela assim:

```
┌───┬──────────────────────────┬──────────────────┬────────────┬───────┬───────────┬──────────────┐
│ # │ Empresa                  │ Tel/WhatsApp     │ E-mail     │ Score │ Temp.     │ Oportunidades│
├───┼──────────────────────────┼──────────────────┼────────────┼───────┼───────────┼──────────────┤
│ 1 │ Clínica Sorriso          │ 5562999887766    │ contato@.. │ 100   │ 🔥 Quente │ Agente p/ Wha│
│ 2 │ Odonto Center            │ (62) 3000-1234   │ -          │ 65    │ 🌤️ Morno  │ Agendamento  │
└───┴──────────────────────────┴──────────────────┴────────────┴───────┴───────────┴──────────────┘

📊 Resumo: 16 queries | 42 URLs | 30 analisadas | 12 leads novos salvos | 48.3s (search #3)
```

- **#** — posição (ordenado do maior para o menor score)
- **Score** — nota de oportunidade (0–100, ver seção 7)
- **Temp.** — 🔥 Quente / 🌤️ Morno / ❄️ Frio
- **Oportunidades** — tipos de agente de IA que fazem sentido para aquele lead
- **Resumo** — quantas buscas, URLs visitadas e leads **novos** salvos

---

## 6. Exportando os leads (CSV / JSON / XLSX)

Após mostrar a tabela, o sistema pergunta:

```
? Deseja exportar os resultados? (Y/n)
? Formatos: (use espaço para marcar)
  ◉ CSV
  ◯ JSON
  ◯ XLSX
```

Marque com **espaço**, confirme com **Enter**. Os arquivos vão para a pasta:

```
C:\Users\Pedro\Desktop\lead-hunter-ia\exports\
```

Com nome tipo `leads-2026-06-23T21-46-43.csv`.

| Formato | Melhor para |
|---------|-------------|
| **CSV** | Abrir no Excel / importar em CRM (já vem com acentos corrigidos) |
| **XLSX** | Planilha pronta do Excel, com cabeçalho em negrito |
| **JSON** | Integrações / programação |

**Colunas exportadas:** Empresa, Site, Cidade, Estado/País, Nicho, Telefone, WhatsApp, E-mail, Instagram, LinkedIn, Endereço, Score, Temperatura, Oportunidades IA, Evidências, Fonte (URL), Coletado em.

---

## 7. O que significa o Score e a Temperatura

O **Score (0–100)** mede o quão promissor o lead é **para vender um agente de IA**. Quanto mais sinais de atendimento manual e menos automação, **maior** a nota.

| Sinal encontrado | Pontos |
|------------------|-------:|
| Tem WhatsApp público | +25 |
| **Não** tem chatbot/automação aparente | +20 |
| Nicho de alta demanda por atendimento | +15 |
| Site simples/desatualizado | +15 |
| Sinais de intenção (agendamento, orçamento, suporte…) | até +15 |
| Tem formulário de contato | +10 |
| Redes sociais ativas | +10 |
| Telefone **e** e-mail | +5 |
| Já tem chatbot | −10 |

**Classificação:**
- 🔥 **Quente** (70–100) → priorize o contato. Forte candidato.
- 🌤️ **Morno** (40–69) → bom potencial, vale abordar.
- ❄️ **Frio** (0–39) → baixa prioridade.

A coluna **Evidências** explica exatamente por que cada lead recebeu aquela nota.

---

## 8. Receitas prontas por nicho (copiar e colar)

Rode no PowerShell trocando cidade/estado. (Requer modo automático configurado.)

**Clínicas e saúde:**
```powershell
npm start -- --city "Goiânia" --region "GO" --niche "clínica odontológica" --max 30 --type completa --export xlsx --yes
```

**Estética / salão / barbearia:**
```powershell
npm start -- --city "Anápolis" --region "GO" --niche "salão de beleza" --max 25 --type completa --export csv --yes
```

**Restaurantes / delivery:**
```powershell
npm start -- --city "Goiânia" --region "GO" --niche "restaurante delivery" --max 30 --type completa --export xlsx --yes
```

**Advocacia:**
```powershell
npm start -- --city "Brasília" --region "DF" --niche "escritório de advocacia" --max 20 --type rapida --export csv --yes
```

**Imobiliárias:**
```powershell
npm start -- --city "Goiânia" --region "GO" --niche "imobiliária" --max 30 --type completa --export xlsx --yes
```

> Troque `--type completa` por `--type rapida` para gastar menos buscas de API.

---

## 9. Modo automação (sem perguntas)

Use as flags para rodar sem responder nada (ideal para repetir buscas):

```powershell
npm start -- --city "CIDADE" --region "UF" --niche "NICHO" --max 30 --type completa --export csv,xlsx --yes
```

| Flag | O que faz | Exemplo |
|------|-----------|---------|
| `--city` | Cidade | `--city "Goiânia"` |
| `--region` | Estado/país | `--region "GO"` |
| `--niche` | Nicho | `--niche "pet shop"` |
| `--max` | Máx. de leads | `--max 30` |
| `--type` | `completa` \| `rapida` \| `somente-sites` | `--type completa` |
| `--export` | Exporta direto | `--export csv,xlsx` |
| `--yes` | Não faz perguntas | `--yes` |

---

## 10. Onde os dados ficam salvos

| Lugar | Conteúdo |
|-------|----------|
| `data\lead-hunter.db` | Banco SQLite com **todos** os leads, buscas e histórico |
| `exports\` | Arquivos CSV/JSON/XLSX que você gerou |

🔁 **Anti-duplicados:** o sistema nunca salva o mesmo lead duas vezes. Ele compara por **domínio do site, telefone, e-mail e nome parecido**. Se você rodar a mesma busca de novo, só entram os **novos**.

---

## 11. Solução de problemas

**"Cidade e nicho são obrigatórios"**
→ No modo `--yes` você precisa passar `--city` e `--niche`. Sem `--yes`, ele pergunta.

**"SERPAPI_KEY não configurada" / "GOOGLE_CSE_KEY... não configurados"**
→ Falta preencher a chave no `.env`, ou você esqueceu de salvar o arquivo. Confira a seção 4.

**Aparece "0 leads" no modo automático**
→ Causas comuns: nicho muito específico (tente mais amplo), cidade pequena, ou as empresas não publicam contato no site. Tente `--type completa` e um nicho mais genérico.

**Aparece "0 analisadas" e um aviso de "Modo MANUAL ativo"**
→ Você está no modo `manual`. Para coleta automática, configure `serpapi` ou `google_cse` (seção 4).

**Mensagens vermelhas tipo `NativeCommandError` no PowerShell**
→ **Normal e inofensivo.** São os logs do sistema (que saem pelo canal de erro padrão); o programa funcionou.

**Erro de instalação mencionando "Python" ou "node-gyp" (só se reinstalar)**
→ É o `better-sqlite3` tentando compilar. Já resolvido neste PC. Se acontecer de novo:
```powershell
npm approve-scripts better-sqlite3
npm approve-scripts esbuild
npm install
```

**Quero coletar páginas que só carregam com JavaScript**
→ Ative o Playwright (opcional):
```powershell
npm install playwright
npx playwright install chromium
```
E no `.env`: `USE_PLAYWRIGHT_FALLBACK=true`

**Quero recomeçar o banco do zero**
→ Apague `data\lead-hunter.db` e rode `npm run db:migrate` de novo.

---

## 12. Boas práticas e limites legais (leia)

- ⚖️ Colete **apenas dados comerciais públicos** (telefone, e-mail e redes que a própria empresa divulga). **Não** colete dados pessoais sensíveis.
- 🤖 O sistema **respeita `robots.txt`**, usa atraso entre requisições e se identifica — mantenha assim (`RESPECT_ROBOTS_TXT=true`).
- 📩 Ao abordar os leads, **respeite a LGPD**: tenha finalidade legítima e ofereça opção de descadastro. Não faça spam em massa.
- 🚫 O sistema **não** raspa o Google Search/Maps diretamente (violaria os Termos de Uso). Por isso o modo `manual` existe e os modos automáticos usam **APIs oficiais**.
- 💸 Fique de olho no seu limite gratuito de API (SerpAPI: ~100/mês · Google CSE: 100/dia). Use `--type rapida` para economizar.

---

### 🚀 Próximos passos sugeridos

- Configure **SerpAPI** ou **Google CSE** (seção 4) para coleta automática.
- Rode uma busca **Rápida** primeiro para validar, depois **Completa**.
- Exporte em **XLSX** e use a coluna **Score** para priorizar quem contatar.

Dúvida ou quer evoluir (Google Places API, integração com CRM, dashboard web)?
Veja a seção *"Como evoluir"* no `README.md`.
