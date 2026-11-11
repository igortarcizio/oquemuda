# Revisão do comitê — "O que muda?" (11/11/2026)

Repositório `igortarcizio/oquemuda` (commit `3b07ffb`) + site publicado em igortarcizio.github.io/oquemuda, testado em 1440px e 500px. Testes rodados localmente: 35 (Node) + 12 (Python), todos passando.

## Atualização — protótipo funcional v2 (11/11/2026)

Depois desta revisão foi feito um protótipo funcional, em `prototipo/oquemuda-funcional.html`, para validar as correções antes de mexer no site. Ele é gerado por `node prototipo/build/build.mjs` a partir do acervo do próprio repositório. A coluna "Status em 11/11" do plano de ação (seção 5) diz o que já está resolvido nele.

Decisões tomadas após a revisão:

- **"Outros" foi eliminado (decisão do Lucas).** São 13 temas: Saúde, Educação, Trabalho, Consumo, Economia, Segurança, Direitos e cidadania, Mobilidade, Moradia, Meio ambiente, Comunicação e tecnologia, Cultura e esporte, Política e governo. O tema sai dos assuntos (tags) e das palavras da ementa, por uma regra única em `prototipo/build/classify.js`, usada tanto no card quanto no filtro. Das 2.999 propostas do acervo, só 12 não têm pista nenhuma e entram por padrão em "Política e governo" (ou "Economia", se forem MPV).
- **Títulos:** a pergunta fica só nas propostas revisadas, com o selo "Explicado pela redação". As demais ganham um título descritivo gerado por regra a partir da ementa, mais a linha "Altera: <lei>". É a recomendação da discordância 1, que ainda aguarda aprovação final.
- **Filtro "Partido do autor":** saiu do protótipo porque o acervo não tem a autoria de cada proposta. Volta quando a autoria estiver na base.
- **Anos anteriores:** o filtro de ano mostra só os anos presentes no acervo. Para incluir anos anteriores, o importador (`scripts/sync_bulk.py`, `YEARS`) precisa de uma carga do passado; a sugestão é começar em 2023.

**Etapa 1 no site (11/11/2026):** correções rápidas aplicadas em `src/` e `styles/` (itens marcados "✅ Site" na seção 5), com a regra de temas movida para `src/lib/themes.js` e compartilhada com o protótipo.

**Etapa 2 no site (11/11/2026):** visual novo — títulos descritivos com selo "Explicado pela redação" (regra em `src/lib/titles.js`, compartilhada com o protótipo), card inteiro clicável, destaque com "Quem pode ser afetado", ficha com linha do tempo, filtros ativos removíveis, filtros recolhidos no celular e busca por palavras soltas.

O que ainda falta levar para o site: a coluna `area` e a busca sem acento no banco, o gate de qualidade no sync (C8), a remoção do código morto (C5) e o schema/RLS versionado (C7). A parte ao vivo do protótipo (situação, autoria e atalhos por etapa, via Supabase e API da Câmara) foi testada no GitHub Pages em 11/11/2026.

## 1. Resumo executivo

O produto tem uma postura editorial rara e certa (proposta ≠ lei, "pronta para pauta" ≠ votação marcada) e uma base técnica cuidadosa em escape de HTML, cancelamento de requisições e testes. O problema é que os filtros principais mentem para o usuário e a promessa central — explicar "o que muda" em linguagem simples — só se cumpre em 34 de ~6.700 registros. Os três problemas mais críticos: (1) o filtro de ano oferece 81 anos, mas só 2025–2026 existem no banco, então 79 opções devolvem "nenhuma proposta"; (2) filtros que não fazem o que dizem (chip "Outros" não filtra nada, atalhos "De olho na Câmara" travados no ano corrente, rótulo de tema do card divergente do chip); (3) para ~99% dos cards, o título é uma pergunta robótica ("O que PL 5817/2026 propõe sobre Licitações, Transparência?") e o resumo é a ementa jurídica crua.

## 2. Notas

| Área | Nota | Justificativa |
|---|---|---|
| Código | 5/10 | Boa disciplina de segurança e concorrência, mas bugs de lógica nos filtros, gargalo de ~0,5 s por render e muito código duplicado/morto. |
| Visual | 6,5/10 | Identidade editorial bonita e coerente (serif + creme), enfraquecida por títulos automáticos e um sistema de cor em que 2/3 dos cards são "Outros" cinza. |
| UX/Acessibilidade | 5/10 | Semântica e ARIA acima da média, mas foco perdido em toda navegação, filtros que retornam vazio sem explicação e conteúdo a duas telas de distância no celular. |

## 3. Diagnóstico detalhado

### A) Código (Eng. de software)

**C1 · Crítico — Filtro de ano oferece anos que não existem no acervo.** `index.html:35` lista 2026→1946 fixo; o README diz que o importador cobre só os dois anos mais recentes e o catálogo tem 1.229 itens de 2025 e 1.771 de 2026. Testado ao vivo: ano 2024 e 2010 → "0 propostas nesta página". Em 1º de janeiro de 2027, `state.year` vira "2027", que não existe no `<select>`, e o campo aparece em branco. Correção: gerar as opções a partir dos anos cobertos.

```js
// app.js, em start()
const anos=[...new Set((window.OBM_DATA?.items||[]).map(p=>Number(p.ano)))].sort((a,b)=>b-a);
$('yearSelect').innerHTML='<option value="Todos">Todos os anos</option>'+anos.map(a=>`<option value="${a}">${a}</option>`).join('');
// default: ano mais recente coberto, não new Date().getFullYear()
```

**C2 · Alto — Atalhos "De olho na Câmara" travados no ano corrente.** `app.js:322-329` reescreve o `href` dos três atalhos para `ano=2026`, contrariando o próprio HTML (`ano=Todos`) e o README ("os atalhos não restringem automaticamente ano"). Efeito: "Aprovadas na Câmara" ignora tudo apresentado em 2025; "Novas propostas" em janeiro perde os itens de dezembro. Correção: apagar esse loop e, em `readHash`, usar `state.year=q.get('ano')||(q.get('modo')?'Todos':anoPadrao)`.

**C3 · Alto — Taxonomia de tema quebrada em três pontos.** (a) Chip "Outros": `TOPIC_API` não tem chave "Outros", então `keywords=''` e o resultado é idêntico a "Todos" (verificado: mesmas 223 páginas, com cards de Saúde e Educação). (b) O chip filtra por `ilike '*saúde*'` na ementa, enquanto o rótulo do card vem de `classifyTheme` (regex diferente) — o PL 5813/2026 (tag Câncer) aparece como "Outros" e o PLP 293/2026 (Fiscal, Eventos) como "Saúde". (c) Busca + tema: `state.query||TOPIC_API[topic]` faz a busca vencer e o tema ser ignorado em silêncio. Correção: calcular `area` uma vez no sync (Python), gravar coluna no Supabase e filtrar com `area=eq.Saúde`. **Atualização:** no protótipo, "Outros" foi eliminado e todo card recebe um dos 13 temas pela mesma regra (`prototipo/build/classify.js`), que deve ser portada para o sync.

**C4 · Alto — Gargalo de performance no render.** `fromSnapshot` normaliza os 3.000 itens do catálogo e roda `classifyTags` (~250 regex) em cada um a cada `showList()` — nenhum item do catálogo vem com tags pré-calculadas. Medido: ~485 ms por chamada em CPU de servidor; num Android médio, espere 1–2 s de thread travada a cada troca de filtro ou página. Somado a isso, `dados/catalogo.js` (1,2 MB; 222 KB gzip) é script síncrono que atrasa a execução do módulo. Correção imediata:

```js
// api.js
let snapshotCache=null;
const snapshotItems=()=>snapshotCache??=(window.OBM_DATA?.items||[]).map(p=>normalizeProposal(p,getEditorial(p.id)));
```

E no `atualizar_catalogo.py`, gravar `tags` e `area` já calculados.

**C5 · Médio — Código morto e duplicado.** Publicados e sem uso: `O_Que_Muda_GitHub_Pages/` (versão antiga inteira, acessível na URL pública), `legacy/`, `refatorado.html`, `src/data/indice.js` (só importado por teste). CSS sem uso: `.indexlist`, `.comparison*`, `.card.featured`, `.readtime`, `.source-line`, `.watch-disclaimer`, e `.chip-row` redefinido três vezes. Dois sincronizadores sobrepostos (`sync_supabase.py` a cada 30 min e `sincronizar_supabase.py` 2×/dia) com grupos de `concurrency` diferentes, ou seja, podem gravar no banco ao mesmo tempo. O vocabulário de tags existe em quatro cópias (`tag-rules.json`, inline em `tags.js`, duas migrations SQL). Correção: apagar (o Git guarda), manter um único sincronizador incremental e gerar `tags.js`/SQL a partir de `tag-rules.json`.

**C6 · Médio — Cache-busting manual inconsistente.** `app.js` e `storage.js` importam `./lib/text.js`, e `api.js` e `components.js` importam `text.js?v=quality-20261111`. Para o navegador são dois módulos distintos (baixados e avaliados duas vezes); `storage.js` e `status.js` sem versão podem ficar presos em cache. Correção: tirar todas as query strings dos `import` e versionar só a tag `<script type="module" src="./src/app.js?v=…">` (ou usar import map).

**C7 · Médio — Schema e RLS do Supabase fora do repositório.** Nenhuma migration cria `proposicoes` ou `destaques_diarios`, nem as policies. A chave publicável no front está correta por design, mas a garantia de "somente leitura" não é auditável. Correção: versionar em `supabase/migrations/`:

```sql
alter table public.proposicoes enable row level security;
create policy leitura_publica on public.proposicoes for select to anon using (true);
-- idem para destaques_diarios; nenhuma policy de insert/update/delete para anon
```

**C8 · Médio — Qualidade de dados sem barreira.** `content-quality.js` detecta problemas, mas só gera relatório. Em produção agora: "PL 1/2026 — Teste de Comissão" aparece na home com status "Em discussão"; o card "PL 5818/2026" tem ementa de requerimento ("Requer a inclusão na ordem do dia…"). `normalizeProposal` usa `siglaTipo: raw.siglaTipo||'PL'`, que mascara dado ausente. Correção: o sync deve excluir registros com issue bloqueante (ementa < 20 caracteres, "Teste", ementa de requerimento em tipo PL) e não inventar tipo.

### B) Visual (Designer de produto/UI)

**V1 · Alto — Títulos automáticos derrubam a identidade.** O tratamento editorial (Newsreader 25px, pergunta) funciona nos destaques revisados ("Bancos podem ter novas obrigações contra golpes em idosos?"). Nos demais, a mesma tipografia nobre amplifica frases como "O que PL 5817/2026 propõe sobre Licitações, Transparência?" ou "O que diz o texto do PLP 296/2026?". Há 34 fichas editoriais contra ~6.700 registros. Correção: para não revisados, título descritivo sem pergunta (primeira oração da ementa reescrita por regra, sem "Altera a Lei nº…"), com a sigla no `docref` e as tags acima. Ver discordância 1.

**V2 · Alto — Sistema de cor por tema quase sem sinal.** Na página 1, 20 de 30 cards são "Outros" (banner cinza) e alguns rótulos coloridos estão errados (C3). A faixa de 6 cores no topo promete um código que a lista não entrega. Correção: depois de unificar a taxonomia, ampliar os temas (Segurança, Moradia, Economia, Meio ambiente já existem no seletor Python) ou tirar a cor do banner inteiro e deixá-la só no `topic-dot`. **Atualização:** feito no protótipo — 13 temas, sem "Outros", com a cor só na faixa do topo do card e no marcador do tema.

**V3 · Médio — Header sem margem lateral no celular.** `.header-inner{padding:12px 0}` (base.css) sobrescreve o `padding:0 20px` de `.page` no mesmo elemento; no mobile o logo encosta na borda da tela (visto a 500px). Correção: `.header-inner{padding-block:12px}` e, no `@media(max-width:640px)`, `padding-block:10px 8px`.

**V4 · Médio — Destaque principal com coluna vazia e título contraditório.** O card principal reserva ~35% da largura para uma única tag "SUS", gerando um vazio grande. A seção se chama "O que está em discussão", mas os três destaques têm o selo "Apresentada". Correção: no desktop, coluna lateral com "Quem pode ser afetado" (o campo `publicos` já existe no editorial) ou layout de coluna única; renomear para "Propostas em foco".

**V5 · Médio — Contraste de componentes e textos miúdos.** A borda de input e select (`--line-strong`) tem 1,68:1 contra branco, e WCAG 1.4.11 pede 3:1; o campo de busca quase some no fundo creme. O placeholder `#839098` tem 3,28:1. Há texto de 10–11px no painel "De olho" no mobile e no contador de salvos (branco sobre `--signal`, 3,73:1). Correção: borda `#85806F` (3,95:1 no branco, 3,47:1 no creme), placeholder `#6B7680` (4,64:1), mínimo de 12px e `--signal-ink` no fundo do contador.

### C) Experiência e acessibilidade (UX/WCAG)

**U1 · Alto — Foco perdido em toda navegação.** Ao abrir uma ficha, o foco fica no `body` (verificado). Paginação e chips são re-renderizados via `innerHTML`, então o botão clicado deixa de existir e o foco volta ao topo do documento. Quem navega por teclado ou leitor de tela perde o lugar a cada ação (WCAG 2.4.3).

```js
const focusHeading=el=>{if(!el)return;el.tabIndex=-1;el.focus({preventScroll:true})};
// após detailPage: focusHeading($('detailView').querySelector('h1'))
// em setPage e no clique de chip: focusHeading($('listTitle'))
```

Nos chips, melhor ainda: só alternar `aria-pressed`/`.active` em vez de recriar os botões.

**U2 · Alto — No celular, a primeira proposta está a ~2 telas.** Antes de qualquer card vêm hero, busca, 3 selects empilhados, chips, o painel "De olho" completo e o cabeçalho de destaques. Correção: no mobile, recolher ano/tipo/partido atrás de um botão "Filtros" com contador, e transformar "De olho na Câmara" em três chips horizontais abaixo da busca.

**U3 · Médio — Busca literal e sensível a acento.** `ementa=ilike.*termo*` procura a frase exata: "educacao" não encontra "educação", e o exemplo do placeholder ("compras pela internet") tende a não casar como frase inteira. Correção: coluna `busca tsvector` com `unaccent` + RPC usando `websearch_to_tsquery('portuguese', …)`.

**U4 · Médio — Estados instáveis e rótulos inconsistentes.** Existem quatro textos para "não sei a situação" ("Situação a confirmar", "Consulta pendente", "Não informada", "Situação não verificada"). Na carga, a lista troca do snapshot para o banco: badges mudam de texto e a paginação pula de "60" para "223" páginas. Correção: um rótulo único ("Situação em atualização") e só mostrar o snapshot se o banco não responder em ~1,5 s.

**U5 · Médio — Ficha redundante e "Voltar" que perde contexto.** O mesmo resumo aparece sob o H1 e em "O que a proposta quer mudar?", e o badge de situação aparece duas vezes. "← Voltar às propostas" vai sempre para `#/explorar` cru, perdendo busca, filtros e página. Correção: tirar o parágrafo sob o H1 (ou trocar pela ementa), guardar o último hash de lista e usá-lo no "Voltar".

**U6 · Baixo — Ruído de teclado.** Cada card tem dois links para o mesmo destino (título + "Entender →"), o que dá cerca de 33 paradas de Tab extras por página. "Como os destaques são escolhidos →" leva ao topo de Como funciona, e não à âncora `#selecao-destaques`, porque o roteador por hash não trata âncoras. Correção: `aria-hidden` + `tabindex=-1` no "Entender →" (ou card inteiro clicável), e scroll programático para a âncora.

## 4. Pontos fortes (manter)

- **Honestidade editorial:** "proposta não é lei", "pronta para pauta não confirma votação", aprovação em comissão ≠ aprovação na Câmara. É o diferencial do produto.
- **Segurança:** todo dado externo passa por `safeText` antes do DOM; URLs externas validadas por prefixo; `service_role` só nos secrets do Actions.
- **Requisições:** coalescência, retry com backoff só para 429/5xx, `AbortController` + contador de sequência contra respostas fora de ordem, fallback para snapshot.
- **Base de acessibilidade:** `aria-pressed`, `aria-current`, `aria-live` separado, `aria-busy`, alvos de 44px, `prefers-reduced-motion`, `lang="pt-BR"`, `<noscript>`.
- **Testes:** 47 testes passando, CI em push e PR.
- **Identidade:** par Newsreader + DM Sans, texto principal com 6,6:1 sobre o creme, explicação do tipo de proposta junto aos resultados.

## 5. Plano de ação priorizado

Legenda do status: ✅ Site = já no site principal · ✅ Protótipo = resolvido no protótipo, ainda não aplicado ao site · 🟡 parcial · ⬜ pendente · ➖ não se aplica ao protótipo (continua pendente no site).

| Prioridade | Ação | Área | Esforço | Impacto | Status em 11/11 |
|---|---|---|---|---|---|
| 1 | Select de ano só com anos indexados; default = ano mais recente coberto (C1) | Código/UX | P | Crítico | ✅ Site (etapa 1) |
| 2 | Remover reescrita de ano nos atalhos "De olho" (C2) | Código | P | Alto | ✅ Site (etapa 1) |
| 3 | Eliminar "Outros": todo card com tema real, mesma regra no card e no filtro (C3) | UX | P | Alto | 🟡 Site (etapa 1): 13 temas, sem "Outros"; o filtro usa os assuntos até existir a coluna `area` (etapa 3) |
| 4 | Memoizar `fromSnapshot` (C4) | Código | P | Alto | ✅ Site (etapa 1) |
| 5 | Gestão de foco em rota, paginação e chips (U1) | A11y | P | Alto | ✅ Site (etapa 1) |
| 6 | Padding lateral do header no mobile (V3) | Visual | P | Médio | ✅ Site (etapa 1) |
| 7 | Bordas 3:1, placeholder 4,5:1, mínimo de 12px (V5) | Visual/A11y | P | Médio | ✅ Site (etapa 1) |
| 8 | Rótulo único de situação + renomear seção de destaques (U4, V4) | UX | P | Médio | ✅ Site (etapa 1) |
| 9 | Tirar `?v=` dos imports internos (C6) | Código | P | Médio | ✅ Site (etapa 1) |
| 10 | Bloquear registros de teste/ementas suspeitas no sync (C8) | Dados | P | Médio | 🟡 Parcial (filtrado no build do protótipo; falta no sync) |
| 11 | Ficha: remover duplicações e "Voltar" com contexto (U5) | UX | P | Médio | ✅ Site (etapas 1 e 2) |
| 12 | Tags e `area` pré-calculadas no Python + coluna `area` no banco (C3, C4) | Código | M | Alto | 🟡 Parcial (pré-calculado no build do protótipo; falta no sync/banco) |
| 13 | Títulos descritivos para não revisados (V1) | Visual/Conteúdo | M | Alto | ✅ Site (etapa 2) |
| 14 | Filtros recolhíveis e "De olho" em chips no mobile (U2) | UX | M | Alto | ✅ Site (etapa 2) |
| 15 | Apagar código morto e sincronizador duplicado (C5) | Código | M | Médio | ⬜ Pendente |
| 16 | Versionar schema + RLS (C7) | Segurança | M | Médio | ⬜ Pendente |
| 17 | Busca full-text sem acento (U3) | Código/UX | M | Médio | 🟡 Site (etapa 2): palavras soltas em qualquer ordem; sem acento só no banco (etapa 3) |
| 18 | Ampliar/revisar taxonomia de cor (V2) | Visual | M | Médio | ✅ Site (etapa 2): 13 temas, cor na faixa do card |
| 19 | Carregar `catalogo` só sob demanda (fallback com timeout) | Código | G | Médio | ✅ Protótipo (acervo embutido como reserva) |

## 6. Discordâncias do comitê

**Títulos em forma de pergunta.** A designer defende manter a pergunta em todos os cards porque ela é a assinatura do produto. A especialista em UX argumenta que perguntas genéricas ("O que diz o texto do PLP 296/2026?") ensinam o usuário a ignorar os títulos e tiram valor das boas. **Recomendação:** pergunta só em fichas revisadas, com um selo discreto "Explicado pela redação"; os demais cards ganham título descritivo. A pergunta passa a ser recompensa, não ruído.

**Snapshot de 1,2 MB no carregamento.** O engenheiro quer remover o snapshot por causa da performance. UX quer mantê-lo porque é ele que segura a página quando Supabase ou Câmara caem. **Recomendação:** manter como fallback, mas buscá-lo como JSON só depois de erro ou de 1,5 s sem resposta do banco, já com tags calculadas no build.

## Limites desta revisão

Não foi possível auditar as policies RLS reais nem o schema do Supabase (não estão no repo). Também não houve teste com leitor de tela real nem medição em celular físico: os números de performance vêm de benchmark em Node. O projeto não descreve público-alvo nem métricas de uso, então as prioridades consideram um cidadão leigo no celular como usuário principal.
