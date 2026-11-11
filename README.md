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
- O filtro temático usa aproximações textuais na implementação atual, e o filtro partidário ainda pode exigir consultas da API. Ambos demandam indexação adicional.
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

## Seleção diária — Assuntos para começar

O estado dos três destaques fica em `public.destaques_diarios` no Supabase e é lido pelo frontend independentemente da primeira página de resultados. A rotina `scripts/selecionar_destaques.py` roda **após a importação diária bem-sucedida** de arquivos oficiais no workflow `.github/workflows/sync-bulk.yml`.

- Seleciona proposições **novas após a última seleção** segundo critérios determinísticos de impacto direto no cotidiano (saúde, trabalho, educação, consumo, mobilidade, tecnologia, moradia, segurança e meio ambiente).
- Considera linguagem de efeitos concretos e públicos afetados; evita atos meramente simbólicos, honrarias e textos sem elementos suficientes.
- **Não avalia partido, parlamentar, posição política ou apoio ao mérito da proposta.** A classificação é uma priorização temática aproximada, não um juízo de valor.
- Prioriza diversidade de assuntos, pode trocar um, dois ou três itens e preserva o restante. **Sem novidades elegíveis, os três destaques permanecem inalterados.**
- O texto dos registros não revisados é obtido da ementa oficial e de regras automáticas; não recebe selo de revisão humana por engano.
- O processo usa somente `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` nos secrets do GitHub. A chave administrativa jamais fica no frontend.

## Sincronização e limites atuais

- `scripts/sync_bulk.py` lê arquivos anuais oficiais e importa todos os registros dos tipos cobertos nos dois anos mais recentes, em lotes com `upsert`. O processo registra divergências entre ID e identificação legislativa, sem sobrescrever silenciosamente registros conflitantes.
- `scripts/sync_supabase.py` faz verificações individuais incrementais e tolera respostas HTTP transitórias com tentativas limitadas.
- O frontend usa a chave **publicável** com RLS e leitura somente pública na tabela dos destaques; alterações usam credenciais de serviço restritas ao GitHub Actions.
- A situação `Pronta para Pauta` **não** é uma votação oficialmente agendada. Nenhuma etapa deve ser inferida somente pela existência de uma proposta.
- O acervo cobre por enquanto os tipos e anos importados. **“Todos os resultados” significa todos os registros indexados do recorte**, não a totalidade histórica da Câmara.
- Documentação e critérios adicionais: `CRITERIOS_EDITORIAIS.md`.

## Validação

Rode `npm test` e `python -m unittest discover -s tests -p 'test_*.py' -v` para testar buscas, seleção diária, preservação dos destaques, importação e sincronização sem credenciais reais.
