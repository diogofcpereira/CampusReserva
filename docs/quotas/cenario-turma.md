## Estimativa de uso diário (cenário: 30 utilizadores, 2 gestores)

| Ação | Leituras | Escritas | Eliminações |
| --- | ---: | ---: | ---: |
| Abrir o painel (utilizador) | 51 | 0 | 0 |
| Abrir o painel (gestor) | 203 | 0 | 0 |
| Abrir o painel (gestor), versão antiga que lia todas as reservas | 383 | 0 | 0 |
| Ver horários de um recurso num dia | 4 | 0 | 0 |
| Criar reserva de 3 meias horas | 61 | 4 | 0 |
| Cancelar reserva de 3 meias horas | 55 | 1 | 3 |

| Quota (por dia) | Uso estimado | Limite Spark | Percentagem |
| --- | ---: | ---: | ---: |
| Leituras Firestore | 11 287 | 50 000 | 22,6% |
| Escritas Firestore | 126 | 20 000 | 0,6% |
| Eliminações Firestore | 18 | 20 000 | 0,1% |
| Transferência Hosting (MB) | 4,8 | 360 | 1,3% |

- Cada utilizador gasta cerca de 241 leituras por dia; os 2 gestores, 4060 no total.
- Com este perfil de uso, as 50 000 leituras diárias chegam para cerca de 190 utilizadores por dia.
- Antes da otimização, os painéis dos gestores gastavam 7660 leituras por dia (15,3% do limite), porque cada abertura lia as 300 reservas de sempre.
- A primeira visita descarrega cerca de 153 KB do Hosting (sem compressão; as visitas seguintes usam a cache do browser). O SDK do Firebase vem de www.gstatic.com e não conta.
