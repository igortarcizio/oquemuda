# O que muda? — edição independente

Recriação independente da plataforma `oquemuda.lovable.app`, preservando os principais padrões visuais da versão de 10/11/2026: papel quente, tinta azul-noite, fonte Newsreader + DM Sans, faixa de seis cores, navegação simples e cartões editoriais. **Não altera o Lovable**.

## Abrir localmente

Abra `index.html` no navegador. A amostra verificada em 10/11/2026 com 18 proposições reais já está em `dados/base.js`. A pesquisa local não depende de conexão à API; só os links externos requerem internet.

## Publicar no GitHub Pages

1. Crie um repositório **público** no GitHub, como `o-que-muda`.
2. Envie **todos os arquivos e pastas** deste pacote para a raiz do repositório, incluindo `.github/workflows`, `scripts` e `dados`.
3. Em **Settings → Pages**, selecione **Deploy from a branch**, branch `main`, pasta `/(root)` e salve.
4. Em **Actions**, abra **Atualizar propostas da Câmara** e execute `Run workflow` para gerar uma seleção atualizada de cerca de até 135 proposições reais. O fluxo também roda duas vezes ao dia (08h15 e 17h15, horário de Brasília), sujeito aos atrasos normais do GitHub Actions.
5. Verifique se a execução terminou com sucesso e se `dados/base.js` foi alterado. Acesse `https://SEU-USUARIO.github.io/o-que-muda/`.

Não é necessário API key, banco de dados, backend ou Lovable para hospedar. A coleta é executada por **GitHub Actions (servidor)**, que consulta a [API de Dados Abertos da Câmara](https://dadosabertos.camara.leg.br/), e publica um arquivo JavaScript estático no mesmo domínio do site. Isso evita CORS em navegadores e reduz chamadas repetidas à Câmara.

### Importante sobre atualização

- A base do ZIP é um **snapshot oficial de 10/11/2026**, não uma cópia atualizada em tempo real.
- Depois da publicação e da primeira execução do workflow, as consultas são atualizadas na periodicidade configurada.
- Se a API falhar, o workflow termina com erro e não substitui a base anterior por dados vazios.
- É uma **seleção de proposições** (PLs de 2025 e 2026, por pesquisas temáticas), não um índice exaustivo do Congresso.
- A busca é local, limitada às proposições armazenadas no `dados/base.js`; para demais casos, há link para a Câmara.
- As chamadas para detalhamento usam a situação oficial quando disponível. Ausência da situação não é interpretada como aprovação ou tramitação ativa.
- Os resumos editoriais em `dados/editorial.json` correspondem apenas a IDs de proposições específicas da Câmara e devem ser revisados se o texto da proposição mudar. Propostas fora do catálogo editorial exibem a **ementa original abreviada**, sem conclusão jurídica automática.
- O arquivo `.github/workflows/atualizar.yml` usa permissão `contents: write`, e o repositório deve permitir esse acesso ao `GITHUB_TOKEN` no Settings → Actions → General se a etapa de push falhar.

## Estrutura

- `index.html`: layout e navegação com rotas por fragmento (`#/explorar`, `#/salvos`, `#/como-funciona`, `#/tema/ID`).
- `styles.css`: estilo baseado nas cores e tipografia da interface publicada, com cartões simplificados.
- `app.js`: busca responsiva, filtro por área, detalhes, favoritos em `localStorage`, acessibilidade básica.
- `dados/base.js`: dados oficiais iniciais e atualizações geradas pela rotina.
- `dados/editorial.json`: títulos e textos de orientação para proposições já verificadas.
- `scripts/atualizar_dados.py`: coleta oficial por API, sem dependências externas.
- `.github/workflows/atualizar.yml`: atualização automática.

## Segurança editorial

- A ferramenta diferencia **projeto de lei** de **lei em vigor**.
- Os cartões trazem **uma frase sobre o conteúdo proposto**, não direitos garantidos.
- O campo `publicos` descreve público relacionado ao tema, não impacto jurídico confirmado.
- Para alterações legislativas com consequências importantes, consulte texto integral, substitutivos, tramitação e eventual norma publicada.
- Esta versão não inclui proposições originárias do Senado, decretos ou atos de outros órgãos.

## Como usar a aplicação com outra hospedagem

Basta colocar os mesmos arquivos numa hospedagem estática. Para ter atualização automática fora do GitHub Actions, execute `python scripts/atualizar_dados.py` em um agendador equivalente e publique a pasta `dados/` junto com o HTML.
