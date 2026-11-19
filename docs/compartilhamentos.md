# Compartilhamentos

Cada card tem um ícone de compartilhar ao lado de "+ Salvar", e a ficha tem o botão **Compartilhar** ao lado de "Salvar para depois".

- **No celular** (tela de toque com a folha de compartilhamento do sistema), o botão abre a folha nativa: WhatsApp, Instagram Direct, Telegram etc.
- **No desktop** (ou em navegador sem a folha nativa), abre um menu com WhatsApp, Telegram, X, Facebook, E-mail e Copiar link. Abaixo de 640px de largura o menu vira uma folha presa embaixo da tela.

A mensagem é sempre neutra: `{Título} — entenda o que muda: {link}`. Ela não traz a situação da proposta nem o resultado do termômetro.

O título é o que o leitor está vendo na tela. Se a IA trocou o título do card, vai o título da IA.

## O link compartilhado

O link é `https://igortarcizio.github.io/oquemuda/p/{id}.html`, e não `#/tema/{id}`. WhatsApp, X e Facebook não leem o que vem depois do `#` nem rodam JavaScript, então sem essa página toda mensagem mostraria a mesma prévia genérica do site.

A página `/p/{id}.html` tem o título e o resumo da proposta nas tags de prévia (`og:*`) e leva o leitor na hora para a ficha. Ela é gerada no deploy (ver abaixo) e não fica no repositório.

A prévia usa só título e resumo, nunca a situação. O WhatsApp guarda a prévia em cache por dias, e um "Em discussão" antigo continuaria aparecendo depois que a proposta andasse.

## Páginas de prévia e deploy

- `scripts/gerar_previas.mjs` gera uma página por proposta. Lê o Supabase (`proposicoes` + `resumos_ia` publicados) e, se o banco falhar, usa `dados/catalogo.js`.
- Título: o mesmo de `displayTitle` (redação > título revisado > automático). O título da IA entra quando a proposta não tem título da redação nem revisado.
- Resumo, nesta ordem: síntese da redação, resumo da IA, resumo automático da ementa. Cortado em cerca de 160 caracteres.
- `.github/workflows/deploy-pages.yml` monta o site em `_site/`, gera as prévias em `_site/p/` e publica pelo GitHub Pages.
- Ele roda em todo push na main, depois de cada workflow que atualiza dados (`workflow_run`, porque commits feitos pelo `GITHUB_TOKEN` não disparam push), uma vez por dia e manualmente.

### Ativar (uma vez, precisa de admin do repositório)

1. Faça o merge do PR. Até o passo 2, o site continua sendo publicado pela branch e nada muda.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. Em **Actions → Publicar site (GitHub Pages) → Run workflow**, rode na main.
4. Abra `https://igortarcizio.github.io/oquemuda/p/{id}.html` de alguma proposta: deve abrir a ficha.
5. Cole o link no [depurador do Facebook](https://developers.facebook.com/tools/debug/) ou numa conversa do WhatsApp Web e confira título, resumo e imagem.

Para voltar ao modelo antigo, troque a Source de novo para **Deploy from a branch** (main, `/`). O botão continua funcionando, mas a prévia volta a ser genérica, e os links `/p/` passam a dar 404.

## Contador

Cada clique concluído é gravado pela função `registrar_compartilhamento`, no mesmo modelo do termômetro e dos reportes. O envio é "dispara e esquece": se a rede ou o banco falharem, o compartilhamento acontece do mesmo jeito.

| Canal | Quando conta |
|---|---|
| `nativo` | O leitor concluiu o envio na folha do celular. Cancelar não conta. |
| `whatsapp`, `telegram`, `x`, `facebook`, `email` | Clique no item do menu. |
| `copiar` | O link foi copiado com sucesso. |

- **Tabela `compartilhamentos`:** proposta, canal, leitor (UUID aleatório do navegador, o mesmo do termômetro) e dia. A chave pública não lê nem escreve a tabela.
- **Um registro por leitor, proposta e canal por dia:** clicar várias vezes conta uma.
- **Freios:** 30 por hora por leitor e 1.000 por hora no site todo.

### Ver os números

No painel do Supabase (Table Editor ou SQL Editor):

```sql
-- Últimos 30 dias, mais compartilhadas primeiro
select * from compartilhamentos_por_proposta limit 50;

-- Evolução por dia e canal
select * from compartilhamentos_por_dia limit 60;
```

Os números contam cliques no botão, não quantas pessoas receberam ou abriram o link.

### Aplicar a migração

1. Supabase → **SQL Editor → New query**.
2. Cole [`supabase/migrations/20261119_compartilhamentos.sql`](../supabase/migrations/20261119_compartilhamentos.sql) e clique em **Run**.

O script é idempotente. Antes de ele ser aplicado, o botão funciona normalmente e só não conta.

### Parar de contar

```sql
revoke execute on function public.registrar_compartilhamento(bigint, text, uuid) from anon, authenticated;
```

O botão continua funcionando. Para voltar a contar, use `grant execute … to anon, authenticated`.
