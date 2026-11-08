# Lifeathlete: casca Android com Health Connect (fase 2)

Data: 2026-11-08

## 1. Objetivo e contexto

Permitir que o Lifeathlete recolha automaticamente passos, minutos de treino, horas de sono e minutos de meditação do telemóvel, sem registo manual. Esta fase entrega a **casca Android** que lê o Health Connect e entrega os dados ao código web e ao servidor já existentes (fase 1b, em produção).

Utilizador-alvo e dispositivos: um Samsung Galaxy S25 (Android 15, Health Connect já no sistema) com um Huawei Watch GT 2. O Huawei Health não escreve diretamente no Health Connect (informação de terceiros, não confirmada pela Huawei); o caminho previsto é Relógio → Huawei Health → app intermédia (Health Sync) → Health Connect → Lifeathlete. A app intermédia é escolha e responsabilidade do utilizador; a casca só lê o Health Connect.

Sucesso: o APK instala-se à mão no S25, o utilizador liga os dados do telemóvel em Integrações, concede as permissões, sincroniza e vê os hábitos de valor com `auto_source` preenchidos com origem "Health Connect".

### Decisões já tomadas
| Tema | Decisão |
|---|---|
| Distribuição | Instalação manual do APK; sem lojas |
| Abordagem | Capacitor a abrir o site em produção (`https://lifeathlete.vercel.app`), não site embutido |
| Plugin | Plugin nativo Kotlin próprio, só leitura, dentro do repositório |
| Sincronização | Ao abrir a app e no botão "Sincronizar agora"; sem segundo plano |
| Build | GitHub Actions compila e assina o APK; ficheiro descarregável |
| Assinatura | Chave estável (keystore) guardada nos segredos do repositório |
| appId | `app.lifeathlete.android` (permanente depois de instalada) |

### Fora desta fase
Sincronização em segundo plano; lojas, ícones e ecrã de arranque novos (usa os ícones existentes); Apple Saúde; Huawei Health Kit na nuvem; escrita no Health Connect; política de privacidade (responsabilidade do dono do produto, a casca só aponta para a página).

### Limites do ambiente
O Android SDK não está disponível no ambiente de desenvolvimento (`dl.google.com` bloqueado), por isso o código Kotlin e o manifesto **não podem ser compilados nem executados aqui**. A primeira compilação real é a do GitHub Actions; é previsível precisar de uma ou duas correções.

## 2. Arquitetura

```
Casca Android (Capacitor, pasta android/)
 ├─ WebView ──► https://lifeathlete.vercel.app   (único código de interface)
 └─ Plugin HealthConnectBridge (Kotlin)
        ▲  registerPlugin('HealthConnectBridge')
Adaptador web  src/lib/health/capacitor.ts
        │  registerHealthBridge(...)   (contrato HealthBridge inalterado)
Ecrã Integrações / sync.ts ──► função health-sync (já em produção)
```

Unidades:
1. **App Android (Capacitor):** projeto nativo; o ecrã é um WebView sem interface própria; `appId` `app.lifeathlete.android`.
2. **Plugin `HealthConnectBridge` (Kotlin):** quatro métodos: disponibilidade, pedido de permissão das categorias escolhidas, leitura de métricas diárias dos últimos 7 dias, permissões concedidas.
3. **Adaptador web (`src/lib/health/capacitor.ts`):** deteta a casca, pergunta ao plugin se o Health Connect está disponível (uma vez, no arranque) e só então chama `registerHealthBridge` com uma implementação sobre o plugin. O contrato `HealthBridge` (`isAvailable()` síncrono) **não muda**; a verificação assíncrona acontece antes do registo. No browser e na PWA não há Capacitor, nada se regista e o ecrã mostra o aviso atual.
4. **Workflow `android.yml`:** compila, assina e publica o APK como artefacto.

### Segurança
- A navegação do WebView fica restrita ao domínio da app (`allowNavigation` só `lifeathlete.vercel.app`); links externos abrem no browser do telemóvel; sem tráfego em claro (`cleartext` desligado).
- O plugin só lê, nunca escreve. Os dados só saem para a conta do utilizador através da função `health-sync`, que já valida consentimento, limites e prioridade.
- O manifesto declara apenas quatro permissões de leitura (passos, exercício, sono, mindfulness); sem escrita e sem leitura em segundo plano.

## 3. Plugin e métricas

Todas as métricas são por dia, na data local do telemóvel, dos últimos 7 dias (`SYNC_DAYS`), apenas para as categorias pedidas.

| Métrica | Origem no Health Connect |
|---|---|
| `steps` | agregação do total de passos do dia |
| `workout_minutes` | agregação da duração total das sessões de exercício do dia, em minutos |
| `sleep_hours` | soma das sessões de sono que **terminam** nesse dia local, em horas, sem as fases "acordado" (a agregação por dia atribuiria a noite ao dia errado) |
| `mindful_minutes` | duração das sessões de mindfulness do dia, em minutos |

Regras do contrato (`bridge.ts`): uma métrica sem dados num dia **não é enviada**; nunca se envia 0 para significar "sem registos".

Requisitos do Health Connect:
- Atividade de justificação das permissões (rationale) que abre uma página da app com o texto de privacidade. A política de privacidade em si é responsabilidade do dono do produto.
- `queries` para o pacote do Health Connect no manifesto, quando aplicável.

Riscos conhecidos:
1. **Mindfulness** depende de uma versão alfa da biblioteca do Health Connect e pode não estar disponível no dispositivo: nesse caso a categoria fica **indisponível** (reportada como tal), sem afetar as outras três.
2. **Fonte dos dados:** se o Health Sync não escrever uma métrica do Huawei no Health Connect (por exemplo meditação), essa métrica fica sem dados. Não é um erro da app; só verificável no telemóvel.

## 4. Build, assinatura e entrega

- **Workflow `.github/workflows/android.yml`:** corre manualmente (`workflow_dispatch`) e quando muda algo em `android/`; Java 17; `./gradlew assembleRelease`; assina com os segredos; publica o APK (`lifeathlete.apk`) como artefacto com retenção de 30 dias.
- **Segredos do repositório:** `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
- **Chave:** gerada com `keytool` no ambiente de desenvolvimento, entregue ao utilizador pelo canal de ficheiros da sessão (a palavra-passe em separado), e depois apagada do ambiente; nunca entra no repositório. A chave passou pelo ambiente de desenvolvimento; serve só para a instalação manual do utilizador. Se o utilizador preferir gerá-la ele próprio, o workflow é igual.
- **Atualizações:** com a chave estável, cada APK novo instala-se por cima do anterior sem perder dados.
- **Atualização do conteúdo:** como a casca abre o site em produção, alterações à interface chegam sem novo APK; só mudanças em `android/` exigem novo APK.

## 5. Erros e estados (PT e EN, sem detalhe técnico)

- Health Connect indisponível ou desatualizado: mensagem a dizer que precisa de ser instalado ou atualizado.
- Permissão negada ou parcial: fica só com as categorias concedidas; sem nenhuma, a ligação não se faz (fluxo web existente).
- Falha de leitura: `read_failed`, sem enviar nada.
- Sem rede na primeira abertura: página própria de "sem ligação" da casca, com botão de tentar de novo, em vez de ecrã em branco.
- Link externo: abre no browser do telemóvel.

## 6. Testes

- **Adaptador web:** testes de unidade com o plugin simulado (registo só quando disponível, tradução dos dados, erros); entram na suite existente.
- **Kotlin e manifesto:** sem teste local possível; verificação pela compilação no GitHub Actions e pela **checklist do utilizador no telemóvel** (README): instalar o APK, abrir, ligar, conceder permissões, sincronizar, ver os hábitos preenchidos, desligar.
- **Revisão independente** do código nativo e do workflow antes de pedir ao utilizador para instalar.
- Todos os testes e verificações existentes continuam a passar.

## 7. Entrega em passos

1. Adaptador web + testes (verificável aqui).
2. Projeto Capacitor, plugin Kotlin, manifesto, página de privacidade e de "sem ligação" (não verificável aqui).
3. Workflow de build e assinatura; chave entregue ao utilizador.
4. README com instruções de instalação e checklist.
5. Revisão independente; primeira compilação no GitHub Actions; correções até compilar.
6. O utilizador instala e testa no S25.
