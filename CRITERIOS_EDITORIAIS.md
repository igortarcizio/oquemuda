# Critérios editoriais — O Que Muda?

## Objetivo
Traduzir proposições oficiais em informações verificáveis e úteis à sociedade civil. A referência legislativa (ex.: PL 123/2026) é metadado, **não** deve ser o título do card.

## Dois níveis de informação
1. **Conteúdo revisado**: título em pergunta relacionada à vida real; síntese de uma frase sobre o que a proposta pretende alterar; até três públicos relacionados ao tema; ementa e fonte oficial.
2. **Registro automático**: título extraído do objeto da ementa e texto oficial resumido, sem inventar efeitos. É apresentado sem os elementos visuais de destaque editorial. A plataforma deve deixar claro quando não há análise consolidada.

## "O que a proposta quer mudar?"
- **Parte automática (todas as propostas)**, gerada em `src/lib/changes.js` só com o que está na ementa:
  - o que o texto faz (muda lei existente, cria regras, homenagem, derruba ato do governo etc.);
  - a lei afetada, com nome popular;
  - as áreas (tema e tags);
  - o rito conforme o tipo (MPV, PLP, PDL, PEC).
- **Resumo (todas as propostas):** 1 ou 2 frases em linguagem simples, montadas por `plainSummary` com outra estrutura que não a do título (o que faz, em que lei mexe, com palavras do dia a dia). Nas revisadas, o campo `resumo` do editorial substitui o automático depois de validado.
- **Parte editorial (propostas revisadas):** "Como é hoje", "Como ficaria", "O que muda na prática" (até 5 pontos) e "Áreas que podem ser afetadas", nos campos `resumo`, `hoje`, `proposta`, `pontos`, `areas` e `fonte_resumo` de `dados/editorial.js`.
  - Escrever sempre a partir do texto integral e da justificativa, nunca só da ementa.
  - Quando a situação atual vier do autor, dizer isso ("Segundo o autor…").
  - Só aparece no site quando o campo `validado` tiver a data da revisão humana. Rascunhos ficam sem esse campo.
- **Parte gerada por IA (todas as demais propostas):** desde 16/11/2026, com aprovação dos responsáveis, `scripts/resumir_propostas.py` lê o texto integral e gera os mesmos campos com IA, publicando automaticamente na tabela `resumos_ia` do Supabase.
  - Esses textos aparecem sempre com o aviso "Resumo gerado por IA · sem revisão humana" e **nunca** com o selo "Explicado pela redação".
  - O texto validado pela redação tem prioridade sobre o da IA.
  - Para tirar um resumo do ar: `update resumos_ia set status = 'oculto' where proposicao_id = …`.
  - Para refazer: rodar o workflow "Resumos por IA" com o campo `so_ids`.

## Regras
- Nunca afirmar que proposta apresentada já está em vigor.
- Não usar «O que prevê o PL/REQ/MSC nº?» como título.
- Dar preferência a «O que pode mudar na…?» apenas quando houver conteúdo apurado que sustente a pergunta.
- Mensagens ao Congresso (MSC), requerimentos de urgência (REQ) e outros atos processuais devem ser explicados como **procedimentos**, não como alterações diretas de direitos.
- Se um requerimento se referir a outra proposição, o card deve citar o projeto referido e explicar que a urgência trata do rito, não do conteúdo do projeto.
- A classificação por assunto pode ser automática, mas requer revisão; evitar inferências apenas por coincidência de palavras.
- Um destaque grande exige título revisado, síntese revisada e público identificado. Sem os três, apresentar card comum.
- Links para proposições sempre apontam ao registro oficial da Câmara.
- Ao navegar, «registros carregados» não equivale a total de proposições existentes na Câmara.
- O snapshot automático é parcial e contingente à disponibilidade da API. A cobertura paginada ao vivo continua sendo a fonte principal.

## Exemplos práticos
- **MSC 833/2026**: «Acordo de transporte aéreo entre Brasil e Áustria chega ao Congresso» (confirmar a redação integral e as partes na ementa).
- **REQ 4410/2026**: «Pedido de urgência para a análise do PL 4.734/2024». A descrição deve informar que o pedido trata da velocidade de tramitação. Explicar o conteúdo do PL exige consultar o próprio PL.
- **PL sem revisão**: em vez de «O que prevê o PL X/2026?», usar uma frase descritiva derivada da ementa, devidamente resumida e identificável.

## Próxima evolução recomendada
Criar uma tabela de revisão por ID da proposição com `titulo`, `impacto`, `publicos`, `tipo_revisao`, `revisado_em`, `fonte`. Textos gerados por IA só são publicados identificados como tal (ver "Parte gerada por IA"). Priorizar proposições com potencial de afetar diretamente saúde, educação, trabalho, consumo e mobilidade.
