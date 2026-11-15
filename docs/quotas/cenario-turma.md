## Estimativa de uso diário (cenário: 30 utilizadores, 2 gestores)

| Ação | Leituras | Escritas | Eliminações |
| --- | ---: | ---: | ---: |
| Abrir o painel (utilizador) | 77 | 0 | 0 |
| Abrir o painel (gestor) | 227 | 0 | 0 |
| Abrir o painel (gestor), versão antiga que lia todas as reservas | 407 | 0 | 0 |
| Ver horários de um recurso num dia | 4 | 0 | 0 |
| Criar reserva de 3 meias horas | 87 | 4 | 0 |
| Cancelar reserva de 3 meias horas | 81 | 1 | 3 |

| Quota (por dia) | Uso estimado | Limite Spark | Percentagem |
| --- | ---: | ---: | ---: |
| Leituras Firestore | 15 043 | 50 000 | 30,1% |
| Escritas Firestore | 126 | 20 000 | 0,6% |
| Eliminações Firestore | 18 | 20 000 | 0,1% |
| Transferência Hosting (MB) | 4,8 | 360 | 1,3% |

- Cada utilizador gasta cerca de 350 leituras por dia; os 2 gestores, 4540 no total.
- Com este perfil de uso, as 50 000 leituras diárias chegam para cerca de 129 utilizadores por dia.
- Antes da otimização, os painéis dos gestores gastavam 8140 leituras por dia (16,3% do limite), porque cada abertura lia as 300 reservas de sempre.
- A primeira visita descarrega cerca de 153 KB do Hosting (sem compressão; as visitas seguintes usam a cache do browser). O SDK do Firebase vem de www.gstatic.com e não conta.
