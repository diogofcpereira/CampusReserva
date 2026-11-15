# CampusReserva

Aplicação web para reservar salas e equipamentos do ISLA Gaia. Projeto prático de Computação em Nuvem (Mestrado em Engenharia Informática, 2026/27).

**Produção:** https://campusreservage.web.app · **Projeto Firebase:** `campusreservage` (plano Spark, gratuito)

A descrição completa está no relatório técnico. Os diagramas estão em `docs/diagramas/` (fontes PlantUML) e `docs/imagens/` (SVG), e as contas das quotas em `docs/quotas/`.

---

## Arquitetura

Modelo **BaaS** sobre Firebase, sem servidor próprio: a lógica corre no browser e a segurança é imposta pelas **Firestore Security Rules**.

| Componente | Função |
|---|---|
| Firebase Hosting | Serve a pasta `public/` |
| Firebase Authentication | Criar conta, iniciar sessão e recuperar a palavra-passe (email e palavra-passe) |
| Cloud Firestore | Perfis, recursos, reservas e bloqueios de horário |
| Security Rules (`firestore.rules`) | Quem pode ler e escrever o quê; garantem que não há sobreposições |
| GitHub Actions | Testes das regras e deploy automático a cada push para `main` |

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
| `scripts/` | Capturas de ecrã e estimativa de quotas |

---

## Perfis

| Perfil | Pode |
|---|---|
| **Utilizador** | Ver recursos ativos, reservar, ver as suas reservas e cancelar as que ainda não começaram |
| **Gestor** | Reservar; criar, editar, ativar e desativar recursos; ver e cancelar qualquer reserva; promover e despromover outros utilizadores (nunca a si próprio) |

Uma conta criada na aplicação recebe o perfil `users/{uid}` com `role: "utilizador"`; as regras não deixam criar um perfil de gestor. O **primeiro gestor** define-se à mão: na consola Firebase (ou na Emulator UI), mudar `role` para `"gestor"` no documento `users/{uid}`. A partir daí, um gestor promove outros na aplicação. Uma conta sem documento em `users` é tratada como utilizador.

---

## Modelo de dados (Cloud Firestore)

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

---

## Regras principais

- **Sem sobreposições:** a reserva e os seus bloqueios gravam-se numa só transação. Um bloqueio nunca pode ser atualizado, por isso escrever sobre um que já existe é recusado e a transação falha por inteiro. Uma reserva de N meias horas tem de ter exatamente N bloqueios que apontam para ela.
- **Reservar:** só em nome próprio, num recurso ativo, numa data real de hoje ou futura (dia em UTC).
- **Cancelar:** o dono ou um gestor; muda só `status`, `cancelledAt`, `cancelledBy` (o UID de quem cancela) e `cancelReason` (`utilizador`, `gestor` ou `recurso_desativado`), e apaga todos os bloqueios na mesma operação.
- **Desativar um recurso:** o browser do gestor cancela as reservas que ainda não terminaram, em transações de até 16 documentos, com o motivo `recurso_desativado`.
- O painel do gestor lê só as reservas dos últimos 30 dias e as futuras.

---

## Ambientes

`public/js/firebase.js` escolhe o destino automaticamente: em `localhost` ou `127.0.0.1` liga-se aos emuladores; em qualquer outro endereço, incluindo as pré-visualizações dos pull requests, usa os serviços reais. Contas e dados dos dois ambientes nunca se cruzam.

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

Não correr Docker e `npm run emuladores` ao mesmo tempo: as portas entram em conflito.

---

## Testes das Security Rules

`npm run test:regras` arranca um emulador temporário do Firestore com o projeto `demo-campusreserva` (o prefixo `demo-` garante que nunca se toca no projeto real).

**69 testes em 4 grupos:** Perfis, Recursos, Reservas e Desativar recurso. Ferramentas: `@firebase/rules-unit-testing` e o test runner nativo do Node (`node:test`).

---

## CI/CD (GitHub Actions)

| Workflow | Quando | Faz |
|---|---|---|
| `firebase-hosting-merge.yml` | Push para `main` | Testes → publica `firestore.rules` → publica o Hosting (canal live) |
| `firebase-hosting-pull-request.yml` | Pull request | Testes → pré-visualização num URL temporário, comentado no PR (só para PR do próprio repositório) |

As regras são publicadas antes do Hosting, para que uma versão nova da aplicação nunca corra contra regras antigas. As pré-visualizações usam os dados reais e as regras já publicadas.

**Credenciais:** secret `FIREBASE_SERVICE_ACCOUNT_CAMPUSRESERVAGE` (service account `github-action-…@campusreservage.iam.gserviceaccount.com`), com os papéis Administrador do Firebase Hosting, Administrador de regras do Firebase e Consumidor do Service Usage.

---

## Custo zero (plano Spark)

Nunca fazer upgrade para o plano Blaze nem associar uma conta de faturação. Cloud Functions e Cloud Storage não estão disponíveis. Os emuladores não consomem quota.

| Serviço | Limite gratuito |
|---|---|
| Hosting | 10 GB armazenados; 360 MB/dia de transferência |
| Firestore | 1 GiB; 50 000 leituras, 20 000 escritas e 20 000 eliminações por dia |
| Authentication | 50 000 utilizadores ativos por mês |

---

## Resolução de problemas

| Sintoma | Causa | Solução |
|---|---|---|
| `Port 8080 is not open … port taken` | Ficou um emulador a correr | `pgrep -a java` e `kill <PID>`; ou `docker compose down` |
| `EACCES … firestore-debug.log` | O log foi criado pelo Docker como root | `sudo rm firestore-debug.log` |
| A conta real não entra em `localhost:5000` | O emulador não conhece as contas de produção | Criar uma conta local |
| A conta aparece como "Utilizador" em vez de "Gestor" | O ID do documento em `users` não é o UID | Criar um documento com o ID igual ao UID |
| "Bloqueado pelas regras do Firestore" em produção | As regras publicadas estão desatualizadas | Confirmar no separador Actions que o job "Publicar Security Rules" passou |

---

## Limitações conhecidas

- `resourceName` é copiado para a reserva: renomear um recurso não altera as reservas antigas.
- A data de uma reserva é validada nas regras por dia, em UTC; a hora só é validada no browser.
- O limite "o utilizador só cancela reservas que ainda não começaram" existe só na interface.
- Uma reserva criada enquanto o gestor desativa o recurso (entre a leitura da lista e o primeiro lote) pode ficar ativa.
- Dependência do fornecedor: regras, autenticação e base de dados não são portáveis diretamente para outra plataforma.

---

## Equipa

Diogo Pereira · Rúben Afonso · Filipe Cardoso
