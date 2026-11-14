## Estimativa de uso diário (cenário: 200 utilizadores, 3 gestores)

| Ação | Leituras | Escritas | Eliminações |
| --- | ---: | ---: | ---: |
| Abrir o painel (utilizador) | 91 | 0 | 0 |
| Abrir o painel (gestor) | 986 | 0 | 0 |
| Abrir o painel (gestor), versão antiga que lia todas as reservas | 2586 | 0 | 0 |
| Ver horários de um recurso num dia | 4 | 0 | 0 |
| Criar reserva de 3 meias horas | 101 | 4 | 0 |
| Cancelar reserva de 3 meias horas | 95 | 1 | 3 |

| Quota (por dia) | Uso estimado | Limite Spark | Percentagem |
| --- | ---: | ---: | ---: |
| Leituras Firestore | 111 360 | 50 000 | 222,7% |
| Escritas Firestore | 840 | 20 000 | 4,2% |
| Eliminações Firestore | 120 | 20 000 | 0,6% |
| Transferência Hosting (MB) | 30,3 | 360 | 8,4% |

- Cada utilizador gasta cerca de 409 leituras por dia; os 3 gestores, 29 580 no total.
- Com este perfil de uso, as 50 000 leituras diárias chegam para cerca de 49 utilizadores por dia.
- Antes da otimização, os painéis dos gestores gastavam 77 580 leituras por dia (155,2% do limite), porque cada abertura lia as 2000 reservas de sempre.
- A primeira visita descarrega cerca de 153 KB do Hosting (sem compressão; as visitas seguintes usam a cache do browser). O SDK do Firebase vem de www.gstatic.com e não conta.
