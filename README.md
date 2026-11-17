# CampusReserva

[![Deploy automático](https://github.com/diogofcpereira/CampusReserva/actions/workflows/firebase-hosting-merge.yml/badge.svg)](https://github.com/diogofcpereira/CampusReserva/actions/workflows/firebase-hosting-merge.yml)
![Firebase](https://img.shields.io/badge/Firebase-plano%20Spark%20(0%20%E2%82%AC)-FFCA28?logo=firebase&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-24-339933?logo=node.js&logoColor=white)

Aplicação web para reservar salas e equipamentos do ISLA Gaia, sem servidor próprio e sem custos. Projeto prático de Computação em Nuvem (Mestrado em Engenharia Informática, 2026/27).

**Produção:** https://campusreservage.web.app · **Projeto Firebase:** `campusreservage` (plano Spark, gratuito)

---

## Índice

- [Capturas de ecrã](#capturas-de-ecrã)
- [Arquitetura](#arquitetura)
- [Perfis](#perfis)
- [Modelo de dados (Cloud Firestore)](#modelo-de-dados-cloud-firestore)
- [Regras principais](#regras-principais)
- [Ambientes](#ambientes)
- [Testes das Security Rules](#testes-das-security-rules)
- [CI/CD (GitHub Actions)](#cicd-github-actions)
- [Custo zero e quotas (plano Spark)](#custo-zero-e-quotas-plano-spark)
- [Scripts](#scripts)
- [Feedback do docente e como foi resolvido](#feedback-do-docente-e-como-foi-resolvido)
- [Resolução de problemas](#resolução-de-problemas)
- [Limitações conhecidas](#limitações-conhecidas)
- [Equipa](#equipa)

---

## Capturas de ecrã

Aplicação publicada em https://campusreservage.web.app. Todas as imagens estão em [`capturas/`](capturas/).

| Utilizador | Gestor |
|---|---|
| ![Painel do utilizador](capturas/01-utilizador-painel.png) | ![Painel de gestão](capturas/05-gestor-painel.png) |
| Visão geral | Painel de gestão |
| ![Salas e equipamentos](capturas/02-utilizador-salas-e-equipamentos.png) | ![Gerir reservas](capturas/06-gestor-gerir-reservas.png) |
| Salas e equipamentos | Gerir reservas de todos os utilizadores |
| ![Grelha de horários com um intervalo escolhido](capturas/03-utilizador-grelha-com-intervalo.png) | ![Gestão de salas e equipamentos](capturas/07-gestor-salas-e-equipamentos.png) |
| Grelha de horários com um intervalo escolhido | Criar, editar, ativar e desativar recursos |
| ![As minhas reservas](capturas/04-utilizador-as-minhas-reservas.png) | ![Gestão de utilizadores](capturas/08-gestor-utilizadores.png) |
| As minhas reservas | Promover e despromover utilizadores |

<details>
<summary>Desativar um recurso com reservas por realizar</summary>

![Diálogo com as reservas que vão ser canceladas](capturas/12-desativar-dialogo.png)

![Aviso depois de desativar](capturas/13-desativar-aviso.png)

![O que o utilizador vê na reserva cancelada](capturas/14-desativar-vista-utilizador.png)

</details>

<details>
<summary>Security Rules a recusar um pedido (permission-denied)</summary>

![Utilizador tenta promover-se a gestor na consola do browser](capturas/15-deny-consola.png)

![Pedido recusado no separador Requests da Emulator UI](capturas/16-deny-requests.png)

![69 testes das regras a passar](capturas/11-testes-regras-69-pass.png)

</details>

<details>
<summary>Pipeline de CI/CD (GitHub Actions)</summary>

![Execuções dos workflows](capturas/09-pipeline-execucoes.png)

![Última execução](capturas/10-pipeline-ultima-execucao.png)

![Log do job de testes](capturas/18-pipeline-log-testes.png)

![Log do job que publica as regras](capturas/19-pipeline-log-regras.png)

![Log do job que publica o Hosting](capturas/20-pipeline-log-hosting.png)

![Histórico de versões no Firebase Hosting](capturas/17-hosting-historico.png)

</details>

<details>
<summary>Uso das quotas na consola do Firebase</summary>

![Firestore: uso nas últimas 24 horas](capturas/21-logs-uso24h.png)

![Firestore: uso nos últimos 30 dias](capturas/21b-logs-uso30dias.png)

![Firestore: dia de maior uso nos últimos 30 dias](capturas/21b-logs-uso30dias-pico.png)

![Hosting: armazenamento nas últimas 24 horas](capturas/22-hosting-armazenamento-24h.png)

![Hosting: armazenamento nos últimos 30 dias](capturas/22-hosting-armazenamento-30dias.png)

![Hosting: downloads nas últimas 24 horas](capturas/23-hosting-downloads-24h.png)

![Hosting: downloads nos últimos 30 dias](capturas/23-hosting-downloads-30dias.png)

</details>

---

## Arquitetura

Modelo **BaaS** sobre Firebase, sem servidor próprio: a lógica corre no browser e a segurança é imposta pelas **Firestore Security Rules**.

![Arquitetura da solução](docs/imagens/arquitetura.svg)

1. O browser carrega a aplicação a partir do Firebase Hosting; o SDK do Firebase (10.4.0) vem de `www.gstatic.com`.
2. O utilizador inicia sessão no Firebase Authentication, que devolve um ID token (JWT) com o seu UID.
3. O SDK envia cada leitura e escrita diretamente ao Cloud Firestore, acompanhada desse token.
4. O Firestore valida o token (`request.auth`) e avalia as Security Rules: devolve os documentos ou `permission-denied`.

| Componente | Função |
|---|---|
| Firebase Hosting | Serve a pasta `public/` |
| Canal de pré-visualização | URL temporário do Hosting para cada pull request |
| `www.gstatic.com` | Serve o SDK do Firebase (JavaScript 10.4.0) |
| Firebase Authentication | Criar conta, iniciar sessão e recuperar a palavra-passe (email e palavra-passe) |
| Cloud Firestore | Perfis, recursos, reservas e bloqueios de horário |
| Security Rules (`firestore.rules`) | Quem pode ler e escrever o quê; garantem que não há sobreposições |
| GitHub Actions | Testes das regras; deploy a cada push para `main`; pré-visualização em cada pull request |

Front-end em HTML, CSS e JavaScript (módulos ES), com o SDK Firebase 10.4.0 importado por CDN.

| Caminho | Conteúdo |
|---|---|
| `public/index.html`, `public/js/index.js` | Iniciar sessão, criar conta, recuperar a palavra-passe |
| `public/dashboard.html`, `public/js/dashboard.js` | Área reservada: recursos, reservas, gestão |
| `public/js/firebase.js` | Configuração Firebase e ligação automática aos emuladores |
| `firestore.rules`, `tests/firestore.rules.test.js` | Security Rules e os seus testes |
| `.github/workflows/` | Pipelines de CI/CD |
| `firebase.json`, `.firebaserc` | Hosting, Firestore e emuladores |
| `Dockerfile`, `docker-compose.yaml` | Emuladores em contentor (alternativa) |
| `scripts/` | Capturas de ecrã e estimativa de quotas ([instruções](#scripts)) |
| `docs/diagramas/`, `docs/imagens/` | Diagramas (fontes PlantUML e SVG) |
| `capturas/` | Capturas de ecrã da aplicação, do pipeline e da consola do Firebase |
| `docs/quotas/` | Estimativa e uso real das quotas |

---

## Perfis

| Perfil | Pode |
|---|---|
| **Utilizador** | Ver recursos ativos, reservar, ver as suas reservas e cancelar as que ainda não começaram |
| **Gestor** | Reservar; criar, editar, ativar e desativar recursos; ver e cancelar qualquer reserva; promover e despromover outros utilizadores (nunca a si próprio) |

Uma conta criada na aplicação recebe o perfil `users/{uid}` com `role: "utilizador"`; as regras não deixam criar um perfil de gestor. O **primeiro gestor** define-se à mão: na consola Firebase (ou na Emulator UI), mudar `role` para `"gestor"` no documento `users/{uid}`. A partir daí, um gestor promove outros na aplicação. Uma conta sem documento em `users` é tratada como utilizador.

<details>
<summary>Diagrama de casos de uso</summary>

![Casos de uso por perfil](docs/imagens/casos-de-uso.svg)

</details>

---

## Modelo de dados (Cloud Firestore)

![Modelo de dados](docs/imagens/modelo-dados.svg)

| Coleção | Campos |
|---|---|
| `users/{uid}` | `uid`, `email`, `displayName`, `role`, `createdAt`, `updatedAt` |
| `resources/{autoId}` | `name`, `type`, `location`, `capacity`, `description`, `active`, `createdAt`, `updatedAt` |
| `reservations/{autoId}` | `userId`, `resourceId`, `resourceName`, `resourceType`, `date`, `startTime`, `endTime`, `durationMinutes`, `unitNumber`, `slotId`, `slotIds`, `status`, `createdAt`; ao cancelar, `cancelledAt`, `cancelledBy`, `cancelReason` |
| `reservationSlots/{id}` | `reservationId`, `resourceId`, `date`, `startTime`, `unitNumber` |

- `capacity`: numa sala, lugares (opcional); num equipamento, número de unidades, cada uma reservável em separado.
- Um bloqueio (`reservationSlots`) por cada meia hora de uma reserva ativa, com ID determinístico: `{resourceId}_{date}_{HH:MM}` numa sala, mais `_unit_{n}` num equipamento.
- Nada se apaga: os recursos desativam-se e as reservas cancelam-se (`status: "cancelada"`).
- Grelha de 30 minutos: início entre 08:00 e 21:30, fim até às 22:00, duração de 30 a 180 minutos.

<details>
<summary>Diagrama de estados de uma reserva</summary>

![Estados de uma reserva](docs/imagens/estados-reserva.svg)

</details>

---

## Regras principais

- **Sem sobreposições:** a reserva e os seus bloqueios gravam-se numa só transação. Um bloqueio nunca pode ser atualizado, por isso escrever sobre um que já existe é recusado e a transação falha por inteiro. Uma reserva de N meias horas tem de ter exatamente N bloqueios que apontam para ela.
- **Reservar:** só em nome próprio, num recurso ativo, numa data real de hoje ou futura (dia em UTC).
- **Cancelar:** o dono ou um gestor; muda só `status`, `cancelledAt`, `cancelledBy` (o UID de quem cancela) e `cancelReason` (`utilizador`, `gestor` ou `recurso_desativado`), e apaga todos os bloqueios na mesma operação.
- **Desativar um recurso:** o browser do gestor cancela as reservas que ainda não terminaram, em transações de até 16 documentos, com o motivo `recurso_desativado`.
- O painel do gestor lê só as reservas dos últimos 30 dias e as futuras.

![Dois pedidos para o mesmo horário](docs/imagens/sequencia-concorrencia.svg)

<details>
<summary>Outros diagramas de sequência (criar, cancelar, desativar, autenticação)</summary>

![Criar uma reserva](docs/imagens/sequencia-reserva.svg)

![Cancelar uma reserva](docs/imagens/sequencia-cancelamento.svg)

![Desativar um recurso com reservas por realizar](docs/imagens/sequencia-desativacao.svg)

![Criar conta, iniciar sessão e carregar o perfil](docs/imagens/sequencia-autenticacao.svg)

</details>

---

## Ambientes

`public/js/firebase.js` escolhe o destino automaticamente: em `localhost` ou `127.0.0.1` liga-se aos emuladores; em qualquer outro endereço, incluindo as pré-visualizações dos pull requests, usa os serviços reais. Contas e dados dos dois ambientes nunca se cruzam.

![Desenvolvimento local e produção](docs/imagens/ambientes.svg)

**Requisitos:** Node.js 24, Java 21 (para o emulador do Firestore), npm.

```bash
npm install
npm run emuladores
```

| Script | Faz |
|---|---|
| `npm run emuladores` | Arranca os emuladores; ao parar (Ctrl+C), guarda os dados em `dados-emulador/` (fora do repositório) |
| `npm run emuladores:continuar` | Arranca os emuladores com os dados guardados |
| `npm run test:regras` | Corre os testes das Security Rules |

Aplicação em http://localhost:5000; Emulator UI em http://localhost:4000. Os emuladores começam vazios: criar uma conta na aplicação ou na Emulator UI. Na recuperação da palavra-passe não sai nenhum email; a ligação aparece no terminal dos emuladores.

**Alternativa com Docker** (os dados perdem-se ao parar o contentor):

```bash
docker build -t campusreserva-emuladores .
docker compose up
```

Não correr Docker e `npm run emuladores` ao mesmo tempo: as portas entram em conflito. No fim, desligar o contentor com `docker compose down`.

---

## Testes das Security Rules

`npm run test:regras` arranca um emulador temporário do Firestore com o projeto `demo-campusreserva` (o prefixo `demo-` garante que nunca se toca no projeto real).

**69 testes em 4 grupos:** Perfis (10), Recursos (10), Reservas (40) e Desativar recurso (9). Ferramentas: `@firebase/rules-unit-testing` e o test runner nativo do Node (`node:test`). As datas dos testes são calculadas a partir do dia de execução (`emDias(n)`), por isso os testes não deixam de funcionar com o passar do tempo.

---

## CI/CD (GitHub Actions)

![Deploy automático com GitHub Actions](docs/imagens/pipeline.svg)

| Workflow | Quando | Faz |
|---|---|---|
| `firebase-hosting-merge.yml` | Push para `main` | Testes → publica `firestore.rules` → publica o Hosting (canal live) |
| `firebase-hosting-pull-request.yml` | Pull request | Testes → pré-visualização num URL temporário, comentado no PR (só para PR do próprio repositório) |

As regras são publicadas antes do Hosting, para que uma versão nova da aplicação nunca corra contra regras antigas. Se uma fase falha, as seguintes não correm. As pré-visualizações usam os dados reais e as regras já publicadas.

**Credenciais:** secret `FIREBASE_SERVICE_ACCOUNT_CAMPUSRESERVAGE` (service account `github-action-…@campusreservage.iam.gserviceaccount.com`), com os papéis Administrador do Firebase Hosting, Administrador de regras do Firebase e Consumidor do Service Usage.

---

## Custo zero e quotas (plano Spark)

Nunca fazer upgrade para o plano Blaze nem associar uma conta de faturação. Cloud Functions e Cloud Storage não estão disponíveis. Os emuladores e os testes não consomem quota.

| Serviço | Limite gratuito |
|---|---|
| Hosting | 10 GB armazenados; 360 MB/dia de transferência |
| Firestore | 1 GiB; 50 000 leituras, 20 000 escritas e 20 000 eliminações por dia |
| Authentication | 50 000 utilizadores ativos por mês |

**As leituras são o primeiro limite.** Resumo da monitorização (valores completos em [docs/quotas/](docs/quotas/)):

| Indicador | Valor |
|---|---|
| Dia de maior uso real (28/10/2026) | 719 leituras, **1,4%** da quota diária |
| Total dos últimos 30 dias (15/10 a 14/11) | 2 700 leituras e menos de 1 MB transferido pelo Hosting |
| Leituras por cada abertura do painel (36 recursos) | 107 |
| Capacidade estimada | cerca de **42** utilizadores intensivos por dia, ou cerca de **129** num perfil de turma |
| Otimização do painel do gestor (só 30 dias) | de 2 597 para 997 leituras por abertura |

O plano Spark não tem alertas de orçamento: a monitorização faz-se na consola do Firebase (Firestore → Uso e Hosting → Uso), e os valores ficam registados em [docs/quotas/uso-real.md](docs/quotas/uso-real.md).

---

## Scripts

### `scripts/estimativa-quotas.mjs`

Conta as leituras, escritas e eliminações de cada ação do `dashboard.js` e estima o uso diário face às quotas do plano Spark. Escreve tabelas em Markdown.

```bash
node scripts/estimativa-quotas.mjs                                    # cenário por omissão (200 utilizadores)
node scripts/estimativa-quotas.mjs --utilizadores=30 --gestores=2     # outro cenário
```

Qualquer parâmetro do cenário (`recursosAtivos`, `reservasPorUtilizador`, `aberturasPainel`…) pode ser mudado com `--nome=valor`. O tamanho do Hosting é medido na pasta `public/`; para obter o valor exato do site publicado, correr numa cópia com quebras de linha do Linux (no Windows, os ficheiros com `\r\n` são ligeiramente maiores).

### `scripts/capturas.mjs`

Tira 10 capturas de ecrã da aplicação publicada (perfil utilizador, perfil gestor e pipeline) para a pasta `capturas/` (as restantes capturas foram tiradas à mão). Não cria, altera nem cancela nada.

```bash
npm install --no-save playwright              # não altera o package.json
npx playwright install --with-deps chromium   # uma vez só

read -p "Email do utilizador: " USER_EMAIL
read -s -p "Palavra-passe do utilizador: " USER_PASSWORD; echo
read -p "Email do gestor: " GESTOR_EMAIL
read -s -p "Palavra-passe do gestor: " GESTOR_PASSWORD; echo
export USER_EMAIL USER_PASSWORD GESTOR_EMAIL GESTOR_PASSWORD
node scripts/capturas.mjs
unset USER_PASSWORD GESTOR_PASSWORD
```

As palavras-passe ficam só no terminal: nunca as escrever em ficheiros nem no GitHub.

---

## Feedback do docente e como foi resolvido

| Feedback (28/10/2026) | Solução | Onde está |
|---|---|---|
| O que acontece às reservas futuras de um recurso desativado? | O gestor vê a lista das reservas por realizar e confirma; são canceladas com o motivo `recurso_desativado`, os bloqueios são apagados e o utilizador vê "Cancelada pelo gestor: o recurso foi desativado" | `public/js/dashboard.js` (`confirmResourceDeactivation`), `firestore.rules` (`validCancellation`), 9 testes no grupo "Desativar recurso" |
| Usar datas relativas nos testes, em vez de 2026-11-20 | As datas são calculadas a partir do dia de execução | `tests/firestore.rules.test.js` (`emDias(n)`) |
| Capturas de ecrã da aplicação publicada, com os dois perfis, e do pipeline | Script de capturas automáticas e anexos do relatório | `scripts/capturas.mjs`, [capturas de ecrã](#capturas-de-ecrã), anexos A e B do relatório |

---

## Resolução de problemas

| Sintoma | Causa | Solução |
|---|---|---|
| `Port 8080 is not open … port taken` | Ficou um emulador a correr, ou o contentor Docker está ligado | `pgrep -a java` e `kill <PID>`; ou `docker compose down` |
| Alterei o `firestore.rules`, mas os emuladores continuam com as regras antigas | No WSL, com o projeto numa pasta do Windows (`/mnt/c/…`), os emuladores não detetam alterações aos ficheiros | Parar os emuladores (Ctrl+C) e arrancá-los de novo |
| `The command 'docker' could not be found in this WSL 2 distro` | O Docker Desktop está fechado, ou a integração com o WSL está desligada | Abrir o Docker Desktop e esperar por "Engine running"; se continuar, ativar Settings → Resources → WSL integration → Ubuntu |
| `EACCES … firestore-debug.log` | O log foi criado pelo Docker como root | `sudo rm firestore-debug.log` |
| `You have divergent branches` ao fazer `git pull` | Há commits locais e remotos ao mesmo tempo | `git pull --rebase`; para não voltar a acontecer, `git config pull.rebase true` |
| A conta real não entra em `localhost:5000` | O emulador não conhece as contas de produção | Criar uma conta local |
| A conta aparece como "Utilizador" em vez de "Gestor" | O ID do documento em `users` não é o UID | Criar um documento com o ID igual ao UID |
| "Bloqueado pelas regras do Firestore" em produção | As regras publicadas estão desatualizadas | Confirmar no separador Actions que o job "Publicar Security Rules" passou |

---

## Limitações conhecidas

- `resourceName` é copiado para a reserva: renomear um recurso não altera as reservas antigas.
- A data de uma reserva é validada nas regras por dia, em UTC; a hora só é validada no browser.
- O limite "o utilizador só cancela reservas que ainda não começaram" existe só na interface.
- Uma reserva criada enquanto o gestor desativa o recurso (entre a leitura da lista e o primeiro lote) pode ficar ativa.
- Uma reserva que já passou mantém o estado `ativa` (não existe o estado "concluída").
- Sem verificação de email: qualquer endereço pode criar conta.
- Dependência do fornecedor: regras, autenticação e base de dados não são portáveis diretamente para outra plataforma.

---

## Equipa

**Grupo E** · Computação em Nuvem · Mestrado em Engenharia Informática · ISLA Gaia, 2026/27 · Docente: José Augusto Monteiro

| Nome | Número | GitHub |
|---|---|---|
| Diogo Cruz Pereira | a22604547 | [@diogofcpereira](https://github.com/diogofcpereira) |
| Filipe Alexandre Ferreira Cardoso | a22601943 | [@FilipeafCardoso](https://github.com/FilipeafCardoso) |
| Rúben Alves Afonso | a22605044 | [@RubenAfonso08](https://github.com/RubenAfonso08) |

Projeto académico, sem licença de reutilização. O desenvolvimento contou com o apoio de ferramentas de IA generativa, conforme a declaração no relatório técnico.
