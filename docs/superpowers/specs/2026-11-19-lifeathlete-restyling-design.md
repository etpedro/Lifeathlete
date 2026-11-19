# Lifeathlete: restyling visual completo ("Crepúsculo vivo")

Data: 2026-11-19

## 1. Intenção

O dono do produto acha a app pouco atrativa à vista. Os problemas que nomeou: **layout e hierarquia** dos ecrãs, **falta de elementos gráficos** e um aspeto **sóbrio demais**. Querem uma app mais apelativa, sem perder a calma que a caracteriza.

Diagnóstico (capturas atuais): Hoje é uma pilha de cartões iguais, verde-escuro sobre verde-escuro, sem nada que diga o que importa agora; nível, XP e sequência são três pílulas pequenas; a cor é um verde único; quase não há ilustração nem ícones; a libelinha, a única peça com personalidade, está rodeada de caixas planas.

Direção aprovada: **"Crepúsculo vivo"**, mostrada em maqueta descartável (`docs/superpowers/specs/assets/restyling-maqueta.png`, fonte `restyling-maqueta.html`; dados de exemplo, só escuro, os valores exatos são do construtor).

## 2. Objetivos, não-objetivos, anti-objetivos

**Objetivos**
- Hierarquia clara em cada ecrã: o que importa agora é o maior e o mais colorido.
- Identidade gráfica por pilar: cada um dos 10 pilares tem uma cor e um ícone.
- Gamificação que se sente como recompensa: anel de progresso do dia, XP, sequência, medalhas e libelinha com presença.
- Escuro por defeito e claro automático, ambos redesenhados e ambos acessíveis.
- Redesenhar todos os ecrãs, por fases entregáveis.

**Não-objetivos**
- Nenhuma alteração de comportamento, dados, regras de gamificação, rotas, base de dados ou funções.
- Sem novas fontes (mantém-se a letra do sistema), sem novas dependências (ícones e ilustrações em SVG inline), sem novos separadores.
- A casca Android (plano à parte) não muda.

**Anti-objetivos (falha mesmo que "funcione")**
- Baixar o contraste abaixo dos testes WCAG AA atuais em qualquer tema.
- Movimento sem `prefers-reduced-motion`; mudanças de layout (CLS) ao carregar.
- Efeito de vidro (`backdrop-filter`) em todos os cartões (pesado em telemóveis fracos).
- Estragar o modo offline do Hoje, a PWA ou as regras de cache do service worker.
- Um aspeto "festivo" que contradiga o tom calmo: a cor orienta, não grita.

## 3. Restrições

- Os tokens ficam em `src/styles/tokens.css`, **só com cores hexadecimais de 6 dígitos** (o teste `src/styles/contrast.test.ts` lê-as; `scripts/build-pwa.mjs` copia-as para as páginas offline). Gradientes e brilhos usam tokens hexadecimais como paragens.
- `contrast.test.ts` passa a cobrir as cores novas (pilares e paragens) nos dois temas: texto ≥ 4,5:1, componentes de interface ≥ 3:1.
- CSS Modules e tokens existentes; alvos de toque ≥ 44 px; foco visível em todos os controlos.
- Os 1077+ testes existentes continuam a passar; o `hidden` mantém-se a vencer o `display` (regra em `base.css`).
- O modo claro tem de ter o mesmo carácter (mesmos matizes escurecidos), não ser um "tema esquecido".
- i18n: PT e EN; strings novas nos dois ficheiros.

## 4. Abordagens consideradas

1. **Tokens primeiro e depois ecrã a ecrã, por fases (escolhida).** Atualiza-se o sistema de cores e os componentes base (cartão, anel de progresso, medalhão, ícones, navegação) e aplica-se ecrã a ecrã. Cada fase é entregável e revisível. Custo: várias fases.
2. **Reescrever os componentes com uma biblioteca de UI.** Visual consistente à partida, mas acrescenta dependências, obriga a reescrever os testes e foge ao "sem novas dependências". Rejeitada.
3. **Só trocar os tokens.** Barato e seguro, mas não resolve o layout nem a hierarquia, que são o primeiro problema apontado. Rejeitada como solução única; é a Fase A da escolhida.

## 5. O desenho

**Fundo e superfícies.** Gradiente de verde-petróleo para índigo (em vez de verde chapado) com dois brilhos suaves nos cantos; cartões translúcidos com borda fina. O vidro (`backdrop-filter`) só na barra de navegação e no cartão de destaque, com alternativa sem ele (`@supports not`).

**Cor por pilar.** Dez cores por pilar (tokens `--pillar-<slug>` com variante escura e clara), usadas no ícone, na barra lateral dos hábitos, nas barras de progresso e nos visto. Os ícones dos pilares reaproveitam `src/components/landing/PillarIcon.tsx`, movido para um sítio partilhado.

**Papéis fixos de cor.** Dourado para XP, nível e medalhas; laranja para a sequência; índigo para ações secundárias (partilhar); verde-água para o estado ativo e a confirmação.

**Hoje.**
- Cabeçalho com saudação por hora do dia ("Bom dia / Boa tarde / Boa noite") e a data; mini-avatar da libelinha.
- Cartão de destaque: anel de progresso com os hábitos feitos hoje sobre o total, nível com nome e barra de XP até ao seguinte, sequência.
- Seletor de dia em pílulas, o dia ativo preenchido.
- Pilares como cartões com ícone colorido, contagem de feitos em pontos, e hábitos com barra lateral da cor do pilar, visto preenchido e barra de progresso nos hábitos de valor.
- A saudação **não usa o nome** (o app nunca preenche `display_name`; a maqueta mostrava um nome só como exemplo).
- Decisões minhas, a confirmar na leitura: o anel e a contagem referem-se ao **dia selecionado** no seletor (com "Ontem" mostra os de ontem, e a legenda passa a dizer "de 10 ontem"); a hora do dia da saudação usa o fuso do perfil e, para evitar diferenças entre servidor e cliente, é calculada no cliente depois de carregar (antes disso mostra só a data).

**Conquistas.** A libelinha como figura central com brilho e as faíscas; nível e categoria; barra de XP; duas estatísticas com ícone; botão de partilhar em destaque; medalhas em grelha de duas colunas (desbloqueadas em medalhão dourado, por desbloquear a cinzento com o progresso).

**Roda.** Radar com preenchimento em gradiente, pontos e rótulos na cor de cada pilar; pilar mais forte e mais fraco em cartões com a cor deles; sugestão com ícone.

**Navegação.** Barra inferior flutuante, com ícones, o separador ativo num realce.

**Restantes ecrãs (fases seguintes).** Perfil, Gerir hábitos, Integrações, onboarding, login, páginas de recuperação de palavra-passe, landing, páginas offline e cartão de partilha: mesmos tokens e componentes, adaptados.

**Movimento.** Transições curtas (anel que preenche, barra de XP, visto que aparece); tudo desligado com `prefers-reduced-motion`.

## 6. Entrega por fases

1. **A. Fundações:** tokens novos (cores, pilares, gradientes, elevações), `contrast.test.ts` alargado, componentes base (`ProgressRing`, cartão, medalhão, `PillarIcon` partilhado), navegação.
2. **B. Hoje.**
3. **C. Conquistas** (inclui a libelinha).
4. **D. Roda** (radar e cartões).
5. **E. Perfil, Gerir hábitos, Integrações e formulários.**
6. **F. Onboarding, login, recuperação, landing, páginas offline, cartão de partilha.**

Cada fase termina com as verificações do projeto (testes, tsc, lint, build) e capturas de ecrã reais (escuro e claro, 390 px, mais desktop) para o dono do produto ver antes de a fase seguinte.

## 7. Verificação

- Testes existentes e novos (contraste dos tokens; componentes novos; `prefers-reduced-motion`).
- Capturas Playwright (Chromium) das páginas reais, em escuro e claro, nas larguras 390 px e desktop, comparadas com a maqueta.
- Revisão independente por fase ou no fim, atenta a contraste, foco, layouts partidos e regressões do modo offline.
- Medição simples de desempenho (build e tamanho do CSS) para garantir que não se degrada.

## 8. O que fica para o construtor

Os valores exatos de cada cor (desde que passem nos testes), tamanhos, espaçamentos e tempos de animação; o desenho final dos ícones e do anel; como mostrar em cada ecrã o estado vazio e de carregamento; o redesenho do tema claro, partindo da maqueta escura.
