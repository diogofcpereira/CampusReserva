# Uso real do plano Spark (R7)

Valores lidos na consola do Firebase a 14/11/2026 (Firestore → Uso; Hosting → Uso → Downloads;
Authentication → Usuários). São estimativas da própria consola, atualizadas a cada 24 horas,
e incluem o uso da consola do Firebase.

| Data | Leituras | Escritas | Eliminações | Hosting (MB) | Contas |
| --- | ---: | ---: | ---: | ---: | ---: |
| 14/11/2026 (últimas 24 h) | 561 | 14 | 5 | 0,46 | 4 |
| 28/10/2026 (dia de maior uso no Firestore) | 719 | 20 | 9 | 0,07 | 4 |
| Total dos últimos 30 dias (15/10 a 14/11) | 2 700 | 127 | 39 | 0,97 | — |
| **Limite Spark (por dia)** | **50 000** | **20 000** | **20 000** | **360** | **50 000** |

- Dia de maior uso no Firestore (28/10): 719 leituras, 1,4% do limite diário.
- Dia de maior transferência no Hosting (25/10): cerca de 0,3 MB, 0,1% do limite diário.
- Nos últimos 30 dias, menos de 1 MB transferido, menos do que o limite de um único dia.

## Comparação com a estimativa

- [cenario-200-utilizadores.md](cenario-200-utilizadores.md): 111 360 leituras por dia (222,7%);
  o limite chega para cerca de 49 utilizadores por dia.
- [cenario-turma.md](cenario-turma.md): 11 287 leituras por dia (22,6%) para 30 utilizadores.
- O uso real atual está muito abaixo de ambos os cenários, porque só o grupo usa a aplicação.

Para atualizar: repetir a leitura na consola e acrescentar uma linha à tabela.
