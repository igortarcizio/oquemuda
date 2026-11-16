# Termômetro dos leitores

Na ficha de cada proposta aparecem três botões: **A favor**, **Neutro** e **Contra**. Com eles dá para ver se uma medida é bem ou mal recebida por quem lê o site.

## Ativar (uma vez, no painel do Supabase)

A seção fica **escondida** até o banco ter as funções de voto. Para ativar:

1. Abra o projeto no Supabase e vá em **SQL Editor → New query**.
2. Cole todo o conteúdo de [`supabase/migrations/20261116_termometro_leitores.sql`](../supabase/migrations/20261116_termometro_leitores.sql).
3. Clique em **Run**. O esperado é "Success. No rows returned".
4. Abra qualquer proposta no site e recarregue a página. A caixa "Termômetro dos leitores" deve aparecer entre "O que a proposta quer mudar?" e "Em que etapa está?".

O script pode ser rodado de novo sem problema: ele não duplica nada nem apaga votos.

Para conferir pelo terminal, sem votar:

```bash
curl -s -X POST 'https://ltihbrlamevhmjjlsphc.supabase.co/rest/v1/rpc/contar_votos' \
  -H 'apikey: sb_publishable_SoAeylRxXXv38jw34drQFA_nbgItFPE' \
  -H 'Content-Type: application/json' -d '{"p_proposicao": 2650489}'
# [{"a_favor":0,"neutro":0,"contra":0}]
```

## Como funciona

- **Tabela `votos_leitores`.** Guarda uma linha por proposta e leitor, com o voto valendo 1 (a favor), 0 (neutro) ou -1 (contra). Trocar de voto atualiza a mesma linha.
- **O "leitor".** É um código aleatório (UUID) criado no navegador e guardado no `localStorage`. Não há nome, e-mail nem IP.
- **Acesso pela chave pública.** A chave usada no site não lê nem escreve a tabela. O acesso passa só por duas funções:
  - `contar_votos(p_proposicao)` devolve os três totais;
  - `registrar_voto(p_proposicao, p_leitor, p_voto)` valida o voto, confere se a proposta existe em `proposicoes`, limita a 60 votos por hora por leitor e devolve os totais atualizados.
- **O que o leitor vê.**
  - O resultado aparece depois que a pessoa vota, para não influenciar o voto. Também dá para clicar em "Ver resultado sem votar".
  - Com menos de 5 votos, o site mostra só "Poucos votos até agora".

## Ver os números (equipe)

No SQL Editor:

```sql
-- Propostas mais rejeitadas (mínimo de 20 votos)
select v.proposicao_id, p.sigla_tipo, p.numero, p.ano,
       count(*) filter (where voto = 1)  as a_favor,
       count(*) filter (where voto = 0)  as neutro,
       count(*) filter (where voto = -1) as contra,
       round(100.0 * count(*) filter (where voto = -1) / count(*), 1) as pct_contra
from votos_leitores v join proposicoes p on p.id = v.proposicao_id
group by 1,2,3,4
having count(*) >= 20
order by pct_contra desc
limit 20;
```

## Limites que precisam ficar claros

- **Não é pesquisa de opinião.** Só vota quem visita o site, e o público do site não representa a população. O texto da ficha e a página "Como funciona" dizem isso.
- **Dá para votar de novo.** Quem limpa o navegador ou troca de aparelho consegue votar outra vez. O limite de 60 votos por hora dificulta automação, mas não impede.
- **Se for preciso endurecer,** os próximos passos são:
  - exigir o Cloudflare Turnstile antes de votar;
  - ou passar a contar só votos de contas logadas.

## Desligar

Para esconder a seção sem apagar votos:

```sql
revoke execute on function public.contar_votos(bigint) from anon;
```

O site deixa de mostrar a caixa na próxima visita.
