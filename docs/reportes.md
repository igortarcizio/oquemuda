# Reportes de leitores

Na ficha de cada proposta, logo abaixo de "O que a proposta quer mudar?", aparece o link **"Encontrou um erro neste texto? Reportar"**. O leitor escolhe onde está o problema e qual é o problema. Se escolher "Outro", descreve em até 100 caracteres.

## Situação

⏳ **Ainda não ativo.** O botão fica escondido até a migração ser aplicada no Supabase.

## Ativar (uma vez, no painel do Supabase)

1. Abra o projeto no Supabase e vá em **SQL Editor → New query**.
2. Cole todo o conteúdo de [`supabase/migrations/20261119_reportes.sql`](../supabase/migrations/20261119_reportes.sql).
3. Clique em **Run**. O esperado é "Success. No rows returned".
4. Abra qualquer proposta no site e recarregue a página. O link deve aparecer embaixo de "O que a proposta quer mudar?".

O script pode ser rodado de novo sem problema. A migração depende de `proposicoes`, `resumos_ia` e `votos_leitores`, que já existem em produção.

Para conferir pelo terminal sem gravar nada:

```bash
curl -s -X POST 'https://ltihbrlamevhmjjlsphc.supabase.co/rest/v1/rpc/reportes_ativos' \
  -H 'apikey: sb_publishable_SoAeylRxXXv38jw34drQFA_nbgItFPE' -H 'Content-Type: application/json' -d '{}'
# true

curl -s 'https://ltihbrlamevhmjjlsphc.supabase.co/rest/v1/reportes?select=id' \
  -H 'apikey: sb_publishable_SoAeylRxXXv38jw34drQFA_nbgItFPE'
# deve dar erro de permissão (42501): a chave pública não lê a tabela
```

## O que o leitor pode reportar

| Onde | Quando aparece |
|---|---|
| Título | Sempre |
| Resumo | Sempre (da redação, da IA ou automático) |
| "Como é hoje", "Como ficaria" e "O que muda na prática" | Só quando a ficha tem esse texto (redação ou IA) |

Motivos: **Informação errada**, **Desatualizado**, **Confuso ou difícil de entender** e **Outro**. O campo de texto só aparece em "Outro" e lá é obrigatório.

Tags e temas ficam de fora porque são classificação automática e são corrigidos por regra, não caso a caso.

## Como funciona

- **Tabela `reportes`.** Cada linha é um reporte, com:
  - `parte`: `titulo`, `resumo` ou `editorial`;
  - `fonte`: `redacao`, `ia` ou `automatico`;
  - `motivo` e `detalhe`;
  - a versão do texto que o leitor viu;
  - `status`: `novo` → `em_analise` → `corrigido` ou `descartado`.
- **Só a equipe vê.** A chave pública não lê nem altera a tabela. O site só chama duas funções:
  - `reportes_ativos()`, que liga o botão;
  - `registrar_reporte(...)`, que valida, aplica os limites e grava.
- **Um reporte por pessoa e trecho.** Se o mesmo leitor reportar o mesmo trecho de novo, o reporte dele é atualizado em vez de duplicado. Depois que a equipe fecha o caso, ele pode reportar a versão nova.
- **O "leitor".** É o mesmo código aleatório do termômetro, guardado no navegador. Não há nome, e-mail nem IP.
- **Limites.** No máximo 10 reportes novos por hora por leitor e 300 por hora no site todo.
- **Texto da IA guardado.** Quando o reporte é sobre texto da IA, o banco copia o texto daquele momento em `trecho`, porque o `resumir_propostas.py` pode reescrever o resumo depois. Textos da redação e automáticos estão no Git.
- **Dados pessoais.** O formulário avisa para não escrever dados pessoais. Mesmo assim, o banco troca e-mails e sequências de 8 ou mais dígitos (CPF, telefone, CEP) por `[removido]` antes de gravar. Números de lei ("Lei 13.709/2018") e de proposta não são afetados.

## Nada sai do ar sozinho

Reportes **não ocultam** nenhum texto, por mais que se acumulem. Em tema político, um grupo organizado conseguiria derrubar um resumo correto. O volume só muda a **ordem da fila**. Tirar do ar ou corrigir é sempre decisão de uma pessoa da equipe.

## Trabalhar a fila (equipe)

A view `fila_reportes` junta os reportes abertos por proposta e trecho, já na ordem de prioridade:

1. mais leitores;
2. mais "informação errada";
3. o reporte mais antigo.

Ela aparece no **Table Editor** junto das tabelas, ou pode ser consultada no SQL Editor:

```sql
select * from fila_reportes limit 30;
```

Colunas que ajudam a decidir:

- `leitores`, `errada`, `desatualizado`, `confuso`, `outro`: quantos e por quê.
- `votaram_contra` / `votaram_a_favor`: quantos de quem reportou votaram contra ou a favor da proposta no termômetro. Se quase todos votaram contra e o motivo é "informação errada", pode ser discordância com a proposta, não erro no texto.
- `texto_mudou`: a IA já reescreveu o resumo depois do reporte. Confira se o problema continua antes de agir.
- `detalhes`: os textos de "Outro", do mais recente para o mais antigo.
- `link`: abre a ficha no site.

Para ver o texto exato que foi reportado (só IA):

```sql
select criado_em, motivo, detalhe, trecho
from reportes
where proposicao_id = 2650489 and parte = 'resumo' and status in ('novo', 'em_analise')
order by criado_em desc;
```

Para mudar o status de todos os reportes de um trecho de uma vez:

```sql
select resolver_reportes(2650489, 'resumo', 'em_analise');
select resolver_reportes(2650489, 'resumo', 'corrigido', 'IA regerada com o texto novo');
select resolver_reportes(2650489, 'titulo', 'descartado', 'título está correto');
```

Também dá para mudar o `status` linha a linha no Table Editor. O banco preenche `resolvido_em` sozinho.

### Como corrigir cada tipo de texto

| Fonte | Como corrigir |
|---|---|
| IA | Tirar do ar na hora: `update resumos_ia set status = 'oculto' where proposicao_id = …;`. Ou gerar de novo, ou escrever a versão da redação, que substitui a da IA. |
| Redação | Editar `dados/editorial.js` e atualizar `validado`. |
| Automático | Ajustar a regra em `src/lib/titles.js` ou `src/lib/changes.js`. Costuma corrigir várias propostas de uma vez. |

## Desligar

Para esconder o botão sem apagar reportes:

```sql
revoke execute on function public.reportes_ativos() from anon, authenticated;
```

O botão some na próxima visita. Para religar, use `grant execute` em vez de `revoke`.

## Próximos passos possíveis

- **Aviso para a equipe.** Hoje alguém precisa abrir a fila. Um resumo diário por e-mail (GitHub Actions lendo `fila_reportes` com a chave service role) evita que reporte fique parado.
- **Apagar textos antigos.** Para guardar só o necessário: limpar `detalhe` de reportes fechados há mais de 6 meses, com `pg_cron` ou um job no Actions.
- **Endurecer contra robôs.** Se aparecer volume artificial, exigir o Cloudflare Turnstile no envio, como previsto para o termômetro.
