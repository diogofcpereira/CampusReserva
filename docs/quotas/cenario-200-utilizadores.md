## Estimativa de uso diário (cenário: 200 utilizadores, 3 gestores)

| Ação | Leituras | Escritas | Eliminações |
| --- | ---: | ---: | ---: |
| Abrir o painel (utilizador) | 107 | 0 | 0 |
| Abrir o painel (gestor) | 997 | 0 | 0 |
| Abrir o painel (gestor), versão antiga que lia todas as reservas | 2597 | 0 | 0 |
| Ver horários de um recurso num dia | 4 | 0 | 0 |
| Criar reserva de 3 meias horas | 117 | 4 | 0 |
| Cancelar reserva de 3 meias horas | 111 | 1 | 3 |

| Quota (por dia) | Uso estimado | Limite Spark | Percentagem |
| --- | ---: | ---: | ---: |
| Leituras Firestore | 125 130 | 50 000 | 250,3% |
| Escritas Firestore | 840 | 20 000 | 4,2% |
| Eliminações Firestore | 120 | 20 000 | 0,6% |
| Transferência Hosting (MB) | 30,3 | 360 | 8,4% |

- Cada utilizador gasta cerca de 476 leituras por dia; os 3 gestores, 29 910 no total.
- Com este perfil de uso, as 50 000 leituras diárias chegam para cerca de 42 utilizadores por dia.
- Antes da otimização, os painéis dos gestores gastavam 77 910 leituras por dia (155,8% do limite), porque cada abertura lia as 2000 reservas de sempre.
- A primeira visita descarrega cerca de 153 KB do Hosting (sem compressão; as visitas seguintes usam a cache do browser). O SDK do Firebase vem de www.gstatic.com e não conta.
