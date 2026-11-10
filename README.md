# O que muda? — frontend modular

Plataforma Civic Tech em **HTML, CSS e JavaScript ES Modules**, publicada no GitHub Pages, que apresenta proposições legislativas da Câmara dos Deputados em linguagem acessível.

## Arquitetura

| Arquivo | Responsabilidade |
| --- | --- |
| `index.html` | HTML sem CSS/JS embutidos; layout e regiões acessíveis |
| `styles/base.css` | Base de identidade visual preservada |
| `styles/components.css` | Cards, skeleton, comparação, status, paginação e responsividade |
| `src/app.js` | Controlador de rotas, filtros, eventos, acessibilidade e paginação |
| `src/data/api.js` | Cliente da API da Câmara, normalização de registros, autoria e cache |
| `src/lib/text.js` | Sanitização, perguntas editoriais e classificação auxiliar |
| `src/lib/status.js` | Normalização conservadora da situação legislativa |
| `src/lib/storage.js` | Salvos no LocalStorage com migração dos registros antigos |
| `src/ui/components.js` | Templates HTML escapados, skeletons, fichas e paginação |
| `dados/editorial.js` | Banco de títulos/impactos revisados vinculado ao ID oficial |
| `dados/catalogo.js` | Cópia de reserva **parcial**, atualizada por GitHub Actions |
| `dados/deputados-partidos.js` | Cache auxiliar de filiação recente para fichas |
| `tests/*.test.mjs` | Testes unitários (Node 22), sem dependências externas |
| `legacy/index-antes-modularizacao.html` | Cópia da versão anterior para eventual restauração |

## Execução

Não há bundler ou etapa de compilação. Abra com um servidor HTTP estático, ou publique diretamente via GitHub Pages (branch `main`, pasta raiz). Para testes: `npm test`.

Os módulos usam `import/export` nativos, portanto abrir `index.html` por `file://` pode não funcionar devido à política CORS do navegador.

## Dados e paginação

- A API principal é `https://dadosabertos.camara.leg.br/api/v2/proposicoes`, sempre com `itens=30` e `pagina=N`.
- O número de páginas é derivado do link `rel=last` retornado pela API. Se não houver informação confiável, o frontend não inventa a última página.
- Ano, espécie e `siglaPartidoAutor` são filtros da própria API. O tema usa palavras-chave indicativas: é um filtro aproximado, não uma indexação jurídica exaustiva.
- O catálogo local é um fallback parcial quando a API falha. Não é apresentado como totalidade da legislação.
- As situações são carregadas sob demanda nos cards visíveis, com até três consultas simultâneas; há cache temporário em SessionStorage.
- Dados da autoria e filiação recente vêm da API e de um cache atualizado. A sigla atual pode ser diferente da filiação no momento da apresentação.

## Critérios editoriais e limitações

- A função `questionTitle` procura usar uma pergunta curta e inteligível, com regras determinísticas. Ela não é um sistema de inteligência artificial capaz de compreender perfeitamente todas as ementas. Casos complexos exigem revisão em `dados/editorial.js`.
- Os quatro status solicitados são exibidos **somente quando sustentados pela fase oficial**. `Apresentada` é uma situação adicional neutra, pois apresentar uma proposta não equivale a tê-la em discussão.
- **Como é hoje**: sem uma apuração de normas vigentes, o sistema informa a falta da verificação em vez de criar um contexto jurídico fictício. É possível preencher `comoHoje` por proposta após revisão editorial.
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
