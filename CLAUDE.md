# O Que Muda? (OQM)

Plataforma civic tech que traduz proposições da Câmara dos Deputados para linguagem simples.
Projeto de Igor Tarcizio e Lucas Alves (50/50). Site publicado via GitHub Pages a partir do `main`.

## Regras de trabalho

- Nunca commitar nem dar push direto no `main`: ele publica o site automaticamente.
  Trabalhe sempre em branch (`feat/...`, `fix/...`) e abra Pull Request.
- Antes de qualquer commit, rode os testes e só siga se passarem:
  - `npm test`
  - `python -m unittest discover -s tests -p "test_*.py" -v`
- Commits e PRs em português, mensagens curtas e descritivas.
- Não adicione dependências (npm ou pip) sem perguntar. O frontend é HTML/CSS/JS ES Modules puro, sem bundler.
- Nunca coloque chaves no frontend. `SUPABASE_SERVICE_ROLE_KEY` e `ANTHROPIC_API_KEY` ficam só nos secrets do GitHub Actions; o frontend usa apenas a chave publicável com RLS.
- Mudanças de banco vão como migração nova em `supabase/migrations/` (nunca editar uma migração já aplicada).

## Regras editoriais (resumo de CRITERIOS_EDITORIAIS.md — leia o arquivo completo antes de mexer em textos)

- "O que muda" descreve o que a proposta *pretende* alterar. Nunca afirmar que algo já está em vigor.
- Sigla e número (ex.: PL 123/2026) são metadado, não título. Títulos são perguntas para as pessoas.
- Resumos de IA sempre com o aviso "Resumo gerado por IA · sem revisão humana", nunca com o selo da redação. Texto validado pela redação tem prioridade.
- Conteúdo editorial só aparece com o campo `validado` preenchido em `dados/editorial.js`.
- Não avaliar partido, parlamentar ou mérito político das propostas.
- Todo HTML vindo de dados externos passa por escape antes de entrar no DOM.

## Mapa rápido

- `src/app.js`: rotas, filtros, paginação
- `src/data/api.js`: cliente da API da Câmara e Supabase
- `src/lib/`: títulos, temas, status, mudanças, tags
- `src/ui/`: componentes, resumos IA, termômetro, notícias
- `scripts/`: importação diária, destaques, resumos por IA (Python)
- `.github/workflows/`: CI e rotinas agendadas
- `tests/`: testes JS (`*.test.mjs`) e Python (`test_*.py`)

## Acessibilidade

Manter `aria-*` existentes, alvos de toque >= 44 px e respeitar `prefers-reduced-motion`.
