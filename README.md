# O que muda? — frontend modular

Plataforma Civic Tech em **HTML, CSS e JavaScript ES Modules**, publicada no GitHub Pages, que apresenta proposições legislativas da Câmara dos Deputados em linguagem acessível.

## Arquitetura

| Arquivo | Responsabilidade |
| --- | --- |
| `index.html` | HTML sem CSS/JS embutidos; layout e regiões acessíveis |
| `styles/base.css` | Base de identidade visual preservada |
| `styles/components.css` | Cards, skeleton, bloco O que muda, status, paginação e responsividade |
| `src/app.js` | Controlador de rotas, filtros, eventos, acessibilidade e paginação |
| `src/data/api.js` | Cliente da API da Câmara, normalização de registros, autoria e cache |
| `src/lib/text.js` | Sanitização, perguntas editoriais e classificação auxiliar |
| `src/lib/themes.js` | 13 temas (sem "Outros") e a regra única que dá tema a cada proposta; usada pelo site e pelo protótipo |
| `src/lib/status.js` | Normalização conservadora da situação legislativa |
| `src/lib/storage.js` | Salvos no LocalStorage com migração dos registros antigos |
| `src/ui/components.js` | Cards de resumo sem bloco Como é hoje, skeletons, fichas e paginação |
| `dados/editorial.js` | Banco de títulos/impactos revisados vinculado ao ID oficial |
| `dados/catalogo.js` | Cópia de reserva **parcial**, atualizada por GitHub Actions |
| `dados/deputados-partidos.js` | Cache auxiliar de filiação recente para fichas |
| `tests/*.test.mjs` | Testes unitários (Node 22), sem dependências externas |
| `legacy/index-antes-modularizacao.html` | Cópia da versão anterior para eventual restauração |

## Execução

Não há bundler ou etapa de compilação. Abra com um servidor HTTP estático, ou publique diretamente via GitHub Pages (branch `main`, pasta raiz). Para testes: `npm test`.

Os módulos usam `import/export` nativos, portanto abrir `index.html` por `file://` pode não funcionar devido à política CORS do navegador.

## Dados e paginação

- A fonte de verdade continua sendo a Câmara dos Deputados. A plataforma consulta normalmente o **Supabase**, abastecido com os arquivos anuais CSV e complementações pontuais pela API oficial.
- O importador de arquivos anuais indexa propostas dos tipos **PL, PLP, PEC, MPV, PDL e PRC** dos dois anos mais recentes. O acervo histórico anterior a esse período ainda não é integral.
- Os atalhos **De olho na Câmara** aplicam os códigos de situação no banco **antes** da paginação. São consultados todos os registros indexados que atendem ao critério, em páginas de 30 resultados; não apenas os primeiros 30 retornados pela Câmara.
- Os atalhos não restringem automaticamente ano ou tipo. O código **924** significa *Pronta para Pauta*, sem garantir votação agendada. O grupo de encaminhamento ao Senado/sanção usa códigos oficiais selecionados, sujeito a revisão jurídica.
- Quando o banco está indisponível nos atalhos, a interface informa a falha em vez de simular uma pesquisa exaustiva com apenas uma página da API.
- O filtro temático consulta no banco as propostas com ao menos um assunto (tag) do tema, antes da paginação; o rótulo do card usa a regra completa de `src/lib/themes.js`. Até existir uma coluna `area` no banco, os dois podem divergir em casos de fronteira. O filtro partidário ainda pode exigir consultas da API.
- A cópia `dados/catalogo.js` é uma reserva parcial, não representa o total da Câmara.

## Critérios editoriais e limitações

- A função `questionTitle` procura usar uma pergunta curta e inteligível, com regras determinísticas. Ela não é um sistema de inteligência artificial capaz de compreender perfeitamente todas as ementas. Casos complexos exigem revisão em `dados/editorial.js`.
- Os quatro status solicitados são exibidos **somente quando sustentados pela fase oficial**. `Apresentada` é uma situação adicional neutra, pois apresentar uma proposta não equivale a tê-la em discussão.
- **O que muda** aparece sozinho no card, com síntese de até quatro linhas, sem emoji. Não presumimos que a regra vigente já tenha sido modificada.
- **O que muda**: descreve o que a proposição *pretende* alterar, não uma mudança em vigor. O status e o andamento podem mudar a qualquer momento.
- A sigla e o número permanecem como referência documental; os títulos são perguntas para as pessoas.
- HTML de dados externos sempre passa por escape textual antes de entrar no DOM.

## Acessibilidade

`aria-current="page"` na paginação, `aria-pressed` em filtro/salvamento, `aria-live="polite"` independente dos cards, `aria-busy` durante carregamento, alvos de toque ≥44 px e animação desabilitada por `prefers-reduced-motion`.

## Testes e manutenção

- `npm test` executa testes de sanitização, siglas, perguntas, status, skeletons, HTML seguro, paginação numérica e parâmetros oficiais (`itens=30`, `pagina` e `siglaPartidoAutor`).
- Workflow `.github/workflows/validacao.yml`: CI dos módulos.
- Workflow `.github/workflows/atualizar.yml`: atualização da cópia parcial de reserva e cache partidário.
- Para evoluir os textos, revise fichas editorialmente com `id` estável em `dados/editorial.js`, adicionando `titulo`, `impacto`, `comoHoje`, `publicos` e `area` somente quando houver fonte e conferência.

## Links

- [Plataforma pública](https://igortarcizio.github.io/oquemuda/#/explorar)
- [API oficial](https://dadosabertos.camara.leg.br/api/v2/)

## Ordem da lista — apresentadas e mudanças de etapa juntas

"Explore as propostas" é uma lista só, sem filtro de ordem: a proposta recém-apresentada aparece ao lado da que acabou de mudar de etapa, pela data mais recente. Cada card diz o que aconteceu: "apresentada em…", "em discussão desde…", "pronta para pauta desde…", "aprovada na Câmara em…", "virou lei em…" ou "saiu de tramitação em…".

- A data fica na coluna `situacao_desde`, preenchida por um gatilho do banco. Desde a migration `20261127_situacao_desde_etapa.sql`, só conta mudança de **etapa** (mesmos grupos de `src/lib/status.js`): troca de sub-situação dentro da comissão ("aguardando relator" → "aguardando parecer") não sobe a proposta. O primeiro código "apresentada" de uma proposta nova também não.
- Carga inicial: apresentadas e sem situação registrada pela data da apresentação; em discussão pela primeira distribuição às comissões (tramitação 110); as demais etapas pela data da última situação. Correção em lotes: `select public.situacao_desde_corrigir(0);` e repetir com o id devolvido até voltar vazio.
- Com palavras buscadas, aparece "Ordenar por: Mais recentes / Mais relevantes". O atalho "Novas propostas" continua pela apresentação.
- Sem a coluna no banco, a lista volta à ordem por apresentação. Não ordenar pela data dentro de `dados_oficiais`: a consulta estoura o tempo limite da chave pública.

## Seleção diária — Propostas em foco

O estado dos três destaques fica em `public.destaques_diarios` no Supabase e é lido pelo frontend independentemente da primeira página de resultados. A rotina `scripts/selecionar_destaques.py` roda **após a importação diária bem-sucedida** de arquivos oficiais no workflow `.github/workflows/sync-bulk.yml`.

Desde 27/11/2026 cada posição é de uma etapa (campo `criterio`):

| Posição | Etapa | Critério | Origem |
| --- | --- | --- | --- |
| 1 (card grande) | Pronta para pauta | `etapa_pauta_v2` | situação 924, com movimentação nos últimos 21 dias (reserva: 60) |
| 2 | Aprovada na Câmara ou virou lei | `etapa_aprovada_v2` | mesmos códigos do atalho "Aprovadas na Câmara", mesma janela |
| 3 | Proposta nova | `etapa_nova_v2` | apresentadas nos últimos 12 dias, inéditas desde a última seleção |

- A data da etapa é a `dataHora` da situação oficial (`dados_oficiais.statusProposicao`). Pronta para pauta **não** é votação agendada.
- Nas etapas, ficam de fora homenagens, datas comemorativas, concessões de rádio, tratados, créditos extraordinários e atos sem efeito descrito na ementa (`stage_relevance`). A ordem considera tema, públicos afetados e efeito; depois, tema diferente dos outros destaques; depois, a movimentação mais recente.
- A proposta nova segue a regra anterior: só troca quando há novidade qualificada (`relevance`), com diversidade de temas.
- **Sem candidata numa etapa** (por exemplo, no recesso), a posição recebe outra proposta nova qualificada, gravada como `etapa_nova_v2`; sem nenhuma, um destaque anterior. As três posições nunca ficam vazias nem repetidas.
- No site, a etiqueta de situação dos destaques é o rótulo principal do card e sempre mostra a situação real ("Apresentada" aparece como "Nova proposta").
- **Não avalia partido, parlamentar, posição política ou apoio ao mérito da proposta.** A classificação é uma priorização temática aproximada, não um juízo de valor.
- O texto dos registros não revisados é obtido da ementa oficial e de regras automáticas; não recebe selo de revisão humana por engano.
- O processo usa somente `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` nos secrets do GitHub. A chave administrativa jamais fica no frontend.

## Sincronização e limites atuais

- `scripts/sync_bulk.py` lê arquivos anuais oficiais e importa todos os registros dos tipos cobertos nos dois anos mais recentes, em lotes com `upsert`. O processo registra divergências entre ID e identificação legislativa, sem sobrescrever silenciosamente registros conflitantes.
- `scripts/sync_supabase.py` (a cada 30 min) é o único robô que cria fichas novas: lê as listagens mais recentes de cada tipo até achar uma página só com propostas já conhecidas, faz verificações individuais incrementais (situação, autores, histórico de tramitação e texto atual após substitutivo) e tolera respostas HTTP transitórias com tentativas limitadas.
- Cada execução fica registrada em `public.sync_runs`. Para ver a saúde da base no painel do Supabase: `select * from public.saude_da_base;` (última sincronização válida, falhas em 24 h, fichas com histórico, resumos de texto antigo etc.). Nada disso é exposto à chave pública.
- O frontend usa a chave **publicável** com RLS e leitura somente pública na tabela dos destaques; alterações usam credenciais de serviço restritas ao GitHub Actions.
- A situação `Pronta para Pauta` **não** é uma votação oficialmente agendada. Nenhuma etapa deve ser inferida somente pela existência de uma proposta.
- O acervo cobre por enquanto os tipos e anos importados. **“Todos os resultados” significa todos os registros indexados do recorte**, não a totalidade histórica da Câmara.
- Documentação e critérios adicionais: `CRITERIOS_EDITORIAIS.md`.

## Validação

Rode `npm test` e `python -m unittest discover -s tests -p 'test_*.py' -v` para testar buscas, seleção diária, preservação dos destaques, importação e sincronização sem credenciais reais.
