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

- A API principal é `https://dadosabertos.camara.leg.br/api/v2/proposicoes`, sempre com `itens=30` e `pagina=N`.
- O número de páginas é derivado do link `rel=last` retornado pela API. Se não houver informação confiável, o frontend não inventa a última página.
- Ano, espécie e `siglaPartidoAutor` são filtros da própria API. O tema usa palavras-chave indicativas: é um filtro aproximado, não uma indexação jurídica exaustiva.
- O catálogo local é um fallback parcial quando a API falha. Não é apresentado como totalidade da legislação.
- As situações são carregadas sob demanda nos cards visíveis, com até três consultas simultâneas; há cache temporário em SessionStorage.
- Dados da autoria e filiação recente vêm da API e de um cache atualizado. A sigla atual pode ser diferente da filiação no momento da apresentação.

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

## Resiliência e limites atuais

- Requisições simultâneas idênticas compartilham uma única chamada HTTP; abandonar uma tela não cancela a consulta que outra tela ainda utiliza.
- Erros HTTP definitivos (como 400) não são repetidos. Erros transitórios são tentados no máximo duas vezes.
- A situação legislativa desconhecida ou indisponível não fica armazenada como se fosse confirmada. Situações confirmadas têm cache temporário.
- A reserva automática percorre a página recente e uma página histórica rotativa para cada combinação de tipo/ano; acumula até **3.000 registros** e preserva o catálogo anterior quando a API falha.
- **Importante:** a reserva é parcial. Não representa todas as proposições e não deve ser usada para contagens totais, filtros de situação ou inferência de inexistência de propostas.
- A consulta ao vivo continua sujeita à disponibilidade da API da Câmara. A filtragem de situações ainda é feita em lotes de até 30 registros, com confirmação individual, e **não** substitui uma busca indexada no universo completo.
- Próxima etapa estrutural: base persistente e sincronização completa por lotes, com API própria de leitura e classificação legislativa auditável.

## Banco de dados Supabase — primeira fase

O projeto **O que muda?** está criado na organização ITS, região `sa-east-1`. A base inicial possui 883 registros do catálogo parcial (2025–2026). A interface pública **continua consultando a API da Câmara** até que a cobertura, os filtros e as situações sejam validados.

A sincronização foi implementada em `scripts/sincronizar_supabase.py` e agendada em `.github/workflows/sincronizar_supabase.yml`. Ela faz upsert por ID, em lotes de 100, preservando dados existentes. A sincronização só é ativada depois de configurar, em **Settings → Secrets and variables → Actions**, os seguintes *repository secrets*:

- `SUPABASE_URL`: `https://ltihbrlamevhmjjlsphc.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY`: chave de serviço do projeto, obtida **diretamente no painel do Supabase**. Nunca incluir no frontend, código, issues ou documentação.

O GitHub conectado não disponibiliza uma ação para configurar secrets; por isso a execução agendada ainda depende dessa configuração manual. Não utilize uma chave pública para executar importações. A rotina atual importa apenas o catálogo parcial; ela **não** fornece histórico completo de tramitação nem valida situações legislativas. O frontend não deve ser migrado até que a indexação seja ampliada e auditada.

Consultas de verificação no SQL Editor do Supabase:

```sql
select count(*) from public.proposicoes;
select sigla_tipo, ano, count(*) from public.proposicoes group by 1,2 order by 2 desc,1;
select id, sigla_tipo, numero, ano, ementa from public.proposicoes where ano=2026 and sigla_tipo='PL' order by id desc limit 30;
```
