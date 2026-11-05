# Lifeathlete: Design

Data: 2026-11-05

## 1. Objetivo e contexto

Tracker individual com gamificação, baseado no diagrama "O Atleta da Vida" (The Pilates Studio by Maria Larsen). É um **produto para publicar**, com contas de utilizador e privacidade, e não uma app de uso pessoal.

### Os 10 pilares
1. Exercício regular
2. Alimentação saudável
3. Carregar baterias na natureza
4. Viver com gratidão
5. Ecrãs em doses moderadas
6. Viver leve como uma libelinha
7. Meditação
8. Estilo de vida saudável e ativo
9. Ler mais
10. Família e valores

### Decisões já tomadas
| Tema | Decisão |
|---|---|
| Plataforma | Web app / PWA instalável |
| Registo | Check-in diário rápido por toques, mais dados importados de fornecedores externos |
| Hábitos | 2-4 sugeridos por pilar; o utilizador pode ativar, ajustar metas ou criar os seus |
| Gamificação | XP, níveis, streaks, conquistas, roda de equilíbrio dos 10 pilares, mascote libelinha |
| Social | Apenas partilha opcional de imagem (sem feed, sem perfis públicos) |
| Negócio | Gratuita na v1, arquitetura preparada para planos futuros |
| Idiomas | Português (PT) e inglês, com i18n desde o início |
| Stack | Next.js + TypeScript, Supabase (Auth, Postgres com RLS, Edge Functions, Storage), alojamento na Vercel |

### Limitações assumidas (v1)
Uma PWA não lê HealthKit, Health Connect nem tempo de ecrã. Por isso, na v1:
- Não há integração com Apple Watch, Samsung nem Hume Band 2.0 (ver secção 7).
- O pilar "Ecrãs em doses moderadas" depende de toque manual.

## 2. Arquitetura

```
PWA (Next.js + TypeScript, i18n PT/EN)
   │  supabase-js (sessão do utilizador)
   ▼
Supabase
 ├─ Auth            (email + Google/Apple)
 ├─ Postgres + RLS  (cada utilizador só acede aos seus dados)
 ├─ Edge Functions
 │    ├─ award-xp / check-achievements   (regras de gamificação)
 │    ├─ oauth-callback / sync-provider  (integrações)
 │    └─ weekly-summary                  (resumo + imagem de partilha)
 └─ Storage         (imagens de partilha)
```

Unidades e responsabilidades:
- **UI:** ecrãs e componentes; sem regras de negócio.
- **Camada de dados:** funções tipadas (`getToday`, `logHabit`, `getWheel`) que escondem o Supabase.
- **Motor de gamificação (servidor):** funções puras que, a partir dos registos, calculam XP, nível, streaks, conquistas e pontuação por pilar. O cliente só pede recálculo.
- **Integrações:** um adaptador por fornecedor com a mesma interface (`connect`, `sync`, `disconnect`), que traduz dados externos em registos de hábitos.
- **PWA:** manifesto, service worker e cache offline do check-in do dia. Notificações push só onde o browser as suportar (limitado no iOS).

### Privacidade
Dados de saúde são sensíveis (RGPD): tokens de fornecedores cifrados no servidor, exportação e eliminação de conta, e imagens de partilha sem dados identificáveis nem detalhe de saúde.

## 3. Modelo de dados

Todas as tabelas de utilizador têm `user_id` e Row Level Security (RLS). O catálogo é público e só de leitura.

**Catálogo**
- `pillars` (`slug`, `icon`, `color`, `sort`) + `pillar_i18n(pillar_id, locale, name, description)`
- `habit_templates` (`pillar_id`, `kind` = `check`|`value`, `default_target`, `unit`, `provider_source`) + `_i18n`
- `achievements` (`code`, `pillar_id` ou global, `rule` JSON, `xp_reward`) + `_i18n`

**Utilizador**
- `profiles` (`locale`, `timezone`, `display_name`, `onboarded_at`)
- `user_habits` (`template_id` nulo se criado à mão, `pillar_id`, `title`, `kind`, `target`, `active`)
- `habit_logs` (`user_habit_id`, `date`, `value`, `source` = `manual`|fornecedor), único em `(user_habit_id, date)`
- `user_stats` (`xp_total`, `level`, `current_streak`, `best_streak`, `last_active_date`)
- `pillar_scores` (pontuação por pilar, janela de 30 dias)
- `user_achievements` (conquista, data de desbloqueio)
- `mascot_state` (estágio e variante visual)

**Integrações**
- `provider_connections` (`provider`, tokens cifrados, `status`, `last_synced_at`)
- `provider_activity` (dados brutos importados, para reprocessar sem novo pedido)

Regras de desenho:
1. `user_stats`, `pillar_scores` e `user_achievements` só são escritas pelas Edge Functions (RLS bloqueia o cliente), para impedir batota com XP.
2. As datas usam o fuso do utilizador (`profiles.timezone`), para os streaks não quebrarem à meia-noite UTC.

## 4. Gamificação

Valores iniciais guardados numa tabela de configuração, ajustáveis sem alterar código.

- **XP:** 10 XP por hábito cumprido no dia (proporcional ao progresso da meta em hábitos de valor, até 10); +20 XP por dia completo; +30 XP semanais de equilíbrio se todos os pilares ativos tiverem atividade em pelo menos 4 dias. Dados importados valem o mesmo que um toque; cada hábito conta no máximo uma vez por dia.
- **Níveis:** XP necessário = `100 × nível^1.5`. Nomes em escalões de cinco: Iniciante, Curioso, Praticante, Atleta, Atleta da Vida.
- **Streaks:** global (dias seguidos com pelo menos 1 hábito cumprido) e por pilar. Um dia de perdão por semana não quebra a sequência.
- **Conquistas:** regras JSON avaliadas no servidor após cada registo; famílias por pilar, globais e de equilíbrio.
- **Roda de equilíbrio:** radar dos 10 pilares; pontuação = percentagem de hábitos cumpridos nos últimos 30 dias; destaca o pilar mais fraco com uma sugestão.
- **Mascote libelinha:** 5 estágios ligados ao nível; a variante visual reflete o equilíbrio da roda. Com inatividade, a libelinha "descansa", sem morrer nem ficar triste.
- O motor é **idempotente**: recalcular o mesmo dia dá o mesmo resultado.

## 5. Ecrãs e fluxo

Barra inferior com 4 separadores: **Hoje**, **Roda**, **Conquistas**, **Perfil**.

- **Onboarding (~2 min):** conta e idioma; introdução dos 10 pilares com o diagrama original; escolher pilares a ativar (não obrigatório ativar todos) e confirmar hábitos; ligar fornecedores (opcional); conhecer a libelinha e fazer o primeiro check-in.
- **Hoje:** pilares agrupados e recolhíveis; um toque marca cada hábito; hábitos de valor abrem um seletor rápido; hábitos preenchidos por fornecedores aparecem marcados com a origem e são corrigíveis; feedback imediato de XP, conquista ou nível; é possível preencher até 2 dias atrás.
- **Roda:** radar dos 10 pilares, pilar mais forte e mais fraco, histórico semanal e mensal.
- **Conquistas:** grelha de medalhas com progresso, nível, barra de XP e mascote.
- **Perfil:** gerir hábitos, integrações (as da fase 6 aparecem como "em breve"), lembrete diário onde suportado, idioma, exportar dados, apagar conta.
- **Partilha:** gera imagem (nível, streak, roda) sem nome nem dados de saúde detalhados.
- **Estados tratados:** sem rede, integração desligada ou token expirado, primeiro dia sem dados.

## 6. Erros e testes

**Erros**
- Sem rede: check-in guardado localmente e enviado depois; a chave única evita duplicados.
- Integração falhada: aviso discreto no Perfil, nunca bloqueia o Hoje; novas tentativas com intervalos crescentes; token expirado pede nova ligação.
- Conflito toque/sensor: o valor manual prevalece e a origem fica registada.
- Mensagens de erro em PT/EN sem detalhe técnico; erros reais vão para monitorização.

**Testes**
- Motor de gamificação (prioridade máxima): XP, níveis, streaks (congelador, fusos, viragem de dia), conquistas, pontuação da roda.
- Segurança: um utilizador não acede a dados de outro; o cliente não escreve `user_stats`, `pillar_scores` nem `user_achievements`.
- Adaptadores: respostas simuladas de cada fornecedor (normal, vazio, token expirado).
- End to end: onboarding, check-in, subida de nível, offline e depois sincronizar, mudança de idioma.
- PWA: instalação, funcionamento offline e desempenho em telemóvel.

## 7. Integrações

**v1 (PWA, APIs cloud):** Huawei Health Kit (API REST com OAuth; requer aprovação da Huawei, e dados históricos exigem permissão adicional pedida na consola), Strava, Fitbit, Garmin, Oura.

**Fase 6 (nativa, Health Connect / HealthKit):** Samsung (sem API cloud aberta; acesso via Health Connect numa app Android), Hume Band 2.0, Apple Watch, tempo de ecrã.

**Estado da Hume Band 2.0:** sem documentação oficial nem API pública encontrada. Fontes de terceiros indicam que a app da Hume escreve no Apple Health e no Health Connect, o que implica acesso nativo. A ligação ao Strava não está confirmada; se a app da Hume a oferecer, a pulseira poderá ser usada na v1 via Strava. Esta verificação é feita na app da Hume ou junto do suporte deles.

## 8. Entrega em fases

1. **Base:** projeto, autenticação, i18n PT/EN, modelo de dados com RLS, catálogo de pilares e hábitos.
2. **Núcleo:** onboarding, ecrã Hoje, check-in, personalização de hábitos, offline.
3. **Gamificação:** XP, níveis, streaks, conquistas, roda, mascote, partilha de imagem.
4. **Integrações:** Strava primeiro, depois Fitbit, Garmin, Oura e Huawei (pedido de aprovação da Huawei iniciado cedo por demorar).
5. **Publicação:** RGPD (exportar e apagar dados, política de privacidade), monitorização, lembretes push onde possível, lançamento.
6. **Nativa (futura):** Samsung, Hume Band 2.0, Apple Watch, tempo de ecrã.

Cada fase deve produzir algo utilizável por si só.
