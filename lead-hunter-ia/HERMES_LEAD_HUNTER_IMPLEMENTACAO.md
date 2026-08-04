# HERMES — Implementação Lead Hunter / CRM Gravity

> **Instrução para o agente Hermes:** Este documento é uma especificação executável.
> Leia integralmente antes de escrever qualquer código. Execute as fases em ordem.
> Use suas skills de leitura de código, edição de arquivos e execução de comandos.
> Ao final de cada fase, valide os critérios de aceite antes de avançar.

---

## 0. Contexto

Existe um sistema de referência funcionando em produção:
**https://gravity-leadforge.lovable.app/** (projeto Lovable `86dc8352-432a-479f-a30e-5547621284a8`).

Sua missão é **replicar/adaptar a lógica de negócio desse sistema no projeto local do Pedro**,
que é semelhante (Lead Hunter IA). Antes de implementar, inspecione o projeto local
existente e faça o merge inteligente: **não sobrescreva funcionalidades que já existem
e funcionam** — apenas adicione o que falta e alinhe o modelo de dados.

### Arquitetura do sistema de referência

- Frontend: arquivo único `lead-hunter.html` (HTML + CSS + vanilla JS, zero deps)
- Servido dentro de um shell React (TanStack Start) via iframe — irrelevante para a lógica
- Persistência: `localStorage` com chave `gravity_lead_hunter_v3`
- Estado global: `{ leads[], tasks[], settings{}, currentDorks[], currentResults[] }`
- Dados mockados gerados no primeiro load

---

## 1. Modelo de Dados (contrato — replicar exatamente)

### 1.1 Lead

```js
{
  id: string,              // 'l' + random base36 (7 chars)
  name: string,            // razão/nome fantasia
  niche: string,           // nicho (ver lista §3.1)
  city: string,
  uf: string,              // sigla estado
  phone: string,           // formato "+55 XX 9XXXX-XXXX"
  whatsapp: string,        // somente dígitos, com DDI: "5511999998888"
  instagram: string,       // "@handle"
  site: string,            // URL completa
  email: string,
  stage: string,           // uma das 7 etapas (§1.4)
  value: number,           // valor estimado do contrato em R$ (inteiro)
  note: string,
  lastContact: string|null,  // ISO datetime
  nextAction: string,        // próxima ação sugerida
  history: [{ at: ISOstring, text: string }],  // unshift() — mais recente primeiro
  // Flags de sinal (alimentam o score)
  hasWhatsapp: bool, hasSite: bool, hasInsta: bool, hasBudget: bool,
  // Campos derivados (calculados por scoreLead, nunca gravados manualmente)
  score: number,           // 0–100
  temp: string,            // 'Quente' | 'Morno' | 'Frio'
  reasons: string[],       // justificativas do score
  pain: string,            // dor digital do nicho
  offer: string            // oferta recomendada da agência
}
```

### 1.2 Task

```js
{
  id: string,              // 't' + random base36
  title: string,
  leadId: string,          // FK para lead
  due: string,             // "YYYY-MM-DD"
  priority: 'Alta' | 'Média' | 'Baixa',
  done: bool,
  note: string,
  createdAt: ISOstring
}
```

### 1.3 Settings

```js
{
  name: string,            // nome da agência (default 'Gravity')
  message: string,         // template WhatsApp com placeholders (§3.3)
  niches: string,          // nichos favoritos, CSV
  apiUrl: string, apiKey: string,   // integração futura
  theme: 'dark' | 'light'
}
```

### 1.4 Etapas do funil (ordem fixa)

```js
const STAGES = ['Novo','Qualificado','Em contato','Reunião','Proposta','Cliente','Perdido'];
```

---

## 2. Lógica de Negócio Central

### 2.1 Scoring (função `scoreLead(lead)`) — REGRA EXATA

| Sinal | Pontos | Justificativa registrada |
|---|---|---|
| `hasWhatsapp \|\| whatsapp` | +25 | "WhatsApp ativo (+25)" |
| `hasSite \|\| site` | +20 | "Site profissional (+20)" |
| `hasInsta \|\| instagram` | +15 | "Instagram público (+15)" |
| `hasBudget` (sinal de orçamento/agendamento) | +20 | "Sinal de orçamento/agendamento (+20)" |
| `city` preenchida | +10 | "Cidade definida (+10)" |
| `niche` preenchido | +10 | "Nicho aderente (+10)" |

- Score máximo: `Math.min(100, soma)`
- Temperatura: `score >= 80 → 'Quente'`, `score >= 50 → 'Morno'`, senão `'Frio'`
- A função também injeta `pain` e `offer` a partir dos mapas por nicho (§3.2)
- **Recalcular o score sempre que um lead for editado** (`Object.assign(lead, scoreLead(lead))`)

### 2.2 Auto-tarefas ao mudar etapa (função `autoTaskOnStageChange`)

Ao mover um lead para uma dessas etapas, criar tarefa automaticamente:

| Etapa destino | Tarefa | Prazo | Prioridade |
|---|---|---|---|
| Qualificado | "Fazer primeiro contato: {nome}" | +1 dia | Alta |
| Em contato | "Follow-up em 24h: {nome}" | +1 dia | Alta |
| Reunião | "Confirmar reunião: {nome}" | +1 dia | Alta |
| Proposta | "Acompanhar proposta: {nome}" | +3 dias | Média |

Regras adicionais na mudança de etapa:
- Registrar em `history`: `"Movido de {old} para {new}"`
- Se a nova etapa ∈ {Em contato, Reunião, Proposta}: atualizar `lastContact = now`
- **Ponto de webhook futuro:** disparar webhook n8n aqui (marcar com comentário `// WEBHOOK`)

### 2.3 Saúde comercial (dashboard)

```js
health = Math.round((hot*100 + warm*60 + cold*20) / max(1, totalLeads));
// >= 70 saudável (verde) | >= 45 estável (amarelo) | < 45 em atenção (vermelho)
```

### 2.4 Estatísticas do dashboard

Total de leads, quentes, mornos, frios, **pipeline** (soma de `value` excluindo etapas
Cliente e Perdido), tarefas pendentes, reuniões, conversão estimada
(`clientes / total * 100`). Funil = contagem por etapa com barras proporcionais ao máximo.

---

## 3. Conteúdo de Domínio (copiar verbatim)

### 3.1 Nichos suportados

Clínica Odontológica, Estética, Energia Solar, Advocacia, Academia, Barbearia,
Escola, Imobiliária, Clínica Médica, Restaurante, Pet Shop, Construtora.

### 3.2 Mapa dor → oferta por nicho

| Nicho | Dor digital | Oferta recomendada |
|---|---|---|
| Clínica Odontológica | Pouca captação digital, agenda com horários ociosos | Funil de captação + automação de agendamento |
| Estética | Baixa recompra e ausência de funil de retorno | Programa de recompra e nutrição via WhatsApp |
| Energia Solar | Leads desqualificados e ciclo de venda longo | Qualificação por SDR + CRM Gravity |
| Advocacia | Pouca presença digital e site sem conversão | Site institucional + landing pages especializadas |
| Academia | Alto churn e baixa retenção de alunos | CRM de retenção e campanhas de winback |
| Barbearia | Agenda manual e baixo ticket médio | Agenda automatizada + upsell de produtos |
| Escola | Captação sazonal e jornada de matrícula confusa | Funil de matrícula sazonal multicanal |
| Imobiliária | Lentidão no atendimento e perda de leads quentes | Speed-to-lead em <5min com automação |
| Clínica Médica | Falta de follow-up e agenda fragmentada | CRM médico + lembretes automáticos |
| Restaurante | Pouco delivery direto e dependência de marketplaces | Delivery direto e fidelidade via WhatsApp |
| Pet Shop | Baixa recorrência e sem CRM de clientes | Clube de assinatura e recompra automática |
| Construtora | Funil longo sem nutrição comercial | Nutrição comercial longa via e-mail + WhatsApp |

Fallbacks: dor = "Operação comercial sem automação"; oferta = "CRM Gravity + automação comercial".

### 3.3 Template de abordagem WhatsApp

Placeholders suportados: `{agencia}`, `{empresa}`, `{cidade}`, `{nicho}`, `{dor}`, `{oferta}`.

Template default:

```
Olá, tudo bem? Aqui é da {agencia}. Vi a {empresa} em {cidade} e percebi uma oportunidade real de melhorar a captação e o acompanhamento de contatos comerciais no segmento de {nicho}.

Muitos negócios recebem interessados mas perdem vendas por falta de processo, follow-up e organização. Quero te convidar para um diagnóstico gratuito — em poucos minutos identificamos gargalos de atendimento, oportunidades de automação e próximos passos para vender mais com clareza.

Posso te enviar duas opções de horário?
```

Envio: abrir `https://wa.me/{whatsapp}?text={encodeURIComponent(msg)}` e registrar no
history + atualizar `lastContact`.

### 3.4 Gerador de dorks (100% comerciais e seguros)

**Restrição obrigatória:** nenhum dork pode apontar para login, senha, admin, backup,
filetypes sensíveis ou vazamentos. Apenas descoberta comercial pública.

Com `n` = nicho, `loc` = `"{cidade}" "{uf}"`:

```
Base (sempre):
1. "{n}" {loc} site:instagram.com                          → Perfis públicos no Instagram
2. "{n}" {loc} "whatsapp" -site:olx.com.br                 → Negócios com WhatsApp público
3. "{n}" {loc} "fale conosco" OR "contato"                 → Páginas de contato comercial
4. "{n}" {loc} "orçamento" OR "solicitar orçamento"        → Intenção de compra
5. "{n}" {loc} "agendamento" OR "agendar"                  → Páginas de agendamento
6. "{n}" {loc} (site:.com.br OR site:.com)                 → Sites oficiais
7. "{n}" {loc} -inurl:vagas -inurl:carreiras               → Negócios locais (sem vagas)
8. intitle:"{n}" {loc}                                     → Nicho no título da página

Profundidade "Média" adiciona:
9. "{n}" {loc} "endereço"                                  → Negócios com endereço físico

Profundidade "Profunda" adiciona:
9. "{n}" {loc} "atendimento" "horário"                     → Info comercial completa
10. "{n}" {loc} "blog" OR "novidades"                      → Presença editorial
```

Ações da UI: copiar dork individual, copiar todos, abrir no Google, exportar .txt,
importar URLs manualmente (uma por linha → cria leads `stage: 'Novo'` com score calculado).

---

## 4. Módulos da Interface (paridade funcional)

1. **Dashboard** — 8 stat cards, funil visual por etapa, top 6 oportunidades (por score),
   "próxima melhor ação" (lead de maior score + CTA), círculo de saúde comercial, 6 insight cards.
2. **Lead Hunter IA** — formulário (nicho, cidade, UF, oferta, tipo de busca, profundidade,
   score mínimo, máx. leads), lista de dorks agrupados por categoria, área de resultados
   com cards (dor, oferta, razões do score, botões +CRM / Site / WhatsApp), salvar todos no CRM.
3. **CRM Kanban** — 7 colunas com drag-and-drop nativo (HTML5 DnD), total R$ por coluna,
   badge de temperatura, ações rápidas por card (abrir, WhatsApp, +tarefa).
4. **Leads (tabela)** — busca full-text (nome/nicho/cidade/site/telefone), filtros por
   nicho/cidade/temperatura/etapa, 4 ordenações, paginação de 10, exportação CSV
   (separador `;`, BOM UTF-8, aspas escapadas).
5. **Tarefas** — 4 colunas (Hoje / Atrasadas / Próximas / Concluídas), criação com
   lead vinculado, prioridade colorida na borda esquerda, concluir/excluir.
6. **Modal de lead** — edição completa, círculo de score (conic-gradient), inteligência
   comercial (dor/oferta), histórico, tarefas vinculadas, mensagem WhatsApp editável,
   botões Marcar como Cliente 🏆 / Perdido (com motivo via prompt) / Salvar.
7. **Configurações** — identidade da agência, template de mensagem, tema dark/light,
   export/import JSON da base, reset com confirmação.

---

## 5. Fases de Execução

### FASE 1 — Diagnóstico do projeto local
1. Mapeie a estrutura do projeto existente do Davi (Lead Hunter IA).
2. Produza um relatório curto: o que já existe vs. o que este spec exige (gap analysis).
3. **PARE e apresente o relatório antes de editar qualquer arquivo.**

### FASE 2 — Alinhamento do modelo de dados
1. Alinhe o schema de lead/task/settings ao contrato do §1 (migração se necessário).
2. Implemente/ajuste `scoreLead()` com a regra exata do §2.1.
3. Critério de aceite: lead com WhatsApp + site + Instagram + orçamento + cidade + nicho = score 100, Quente.

### FASE 3 — Lógica de funil e automações locais
1. STAGES fixos, drag-and-drop (ou equivalente), `autoTaskOnStageChange` (§2.2).
2. History imutável com unshift (mais recente primeiro).
3. Critério de aceite: mover lead p/ "Proposta" cria tarefa "Acompanhar proposta" +3 dias, prioridade Média.

### FASE 4 — Lead Hunter (dorks + import)
1. Gerador de dorks exatamente como §3.4, com trava de segurança (rejeitar qualquer
   template contendo: `password`, `login`, `admin`, `filetype:sql`, `filetype:env`, `index of`).
2. Import de URLs → leads Novo com score.
3. Critério de aceite: nenhum dork gerado contém termos da blocklist.

### FASE 5 — Dashboard e relatórios
1. Stats, funil, saúde, próxima melhor ação, insights (§2.3, §2.4).
2. Exportação CSV com separador `;` e BOM.

### FASE 6 — Integrações reais (somente se o projeto local já tiver backend)
> Se o projeto for localStorage-only, apenas deixe os pontos de integração comentados.

**6a. Supabase (persistência real):**

```sql
create table leads (
  id uuid primary key default gen_random_uuid(),
  name text not null, niche text, city text, uf text,
  phone text, whatsapp text, instagram text, site text, email text,
  stage text not null default 'Novo'
    check (stage in ('Novo','Qualificado','Em contato','Reunião','Proposta','Cliente','Perdido')),
  value integer default 0, note text,
  last_contact timestamptz, next_action text,
  has_whatsapp bool default false, has_site bool default false,
  has_insta bool default false, has_budget bool default false,
  score int, temp text, pain text, offer text,
  created_at timestamptz default now()
);

create table lead_history (
  id bigint generated always as identity primary key,
  lead_id uuid references leads(id) on delete cascade,
  at timestamptz default now(), text text not null
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade,
  title text not null, due date, priority text default 'Média',
  done bool default false, note text, created_at timestamptz default now()
);
```

- Paginação da tabela de leads: `.range(start, start+9)`.
- Score pode ser calculado no client e gravado, ou via trigger — decidir na Fase 1.

**6b. SerpAPI (dorks reais):** rodar as queries do §3.4 server-side (edge function),
parsear resultados orgânicos, extrair domínio/título, criar leads `Novo`.
Nunca expor a API key no client.

**6c. Webhook n8n:** POST em mudança de etapa com payload
`{ lead_id, name, old_stage, new_stage, score, temp, at }`.

### FASE 7 — Validação final
Checklist completo dos critérios de aceite das fases 2–5 + smoke test manual dos 7 módulos.

---

## 6. Regras Gerais para o Hermes

1. **Nunca sobrescrever dados reais** do projeto do Davi. Backup antes de migração.
2. Commits/edições pequenas e nomeadas por fase.
3. Todo texto de UI em **pt-BR**.
4. Manter a identidade visual do projeto local (não impor o tema gold da referência,
   a menos que o projeto local não tenha design system).
5. Dorks: a blocklist de segurança do §Fase 4 é inegociável.
6. Em caso de conflito entre este doc e o código local funcional, **perguntar ao Davi**
   antes de decidir — listar o conflito no relatório da Fase 1.

— Fim da especificação —
