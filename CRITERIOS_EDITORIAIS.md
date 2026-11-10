# Critérios editoriais — O Que Muda?

## Objetivo
Traduzir proposições oficiais em informações verificáveis e úteis à sociedade civil. A referência legislativa (ex.: PL 123/2026) é metadado, **não** deve ser o título do card.

## Dois níveis de informação
1. **Conteúdo revisado**: título em pergunta relacionada à vida real; síntese de uma frase sobre o que a proposta pretende alterar; até três públicos relacionados ao tema; ementa e fonte oficial.
2. **Registro automático**: título extraído do objeto da ementa e texto oficial resumido, sem inventar efeitos. É apresentado sem os elementos visuais de destaque editorial. A plataforma deve deixar claro quando não há análise consolidada.

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
Criar uma tabela de revisão por ID da proposição com `titulo`, `impacto`, `publicos`, `tipo_revisao`, `revisado_em`, `fonte`. Usar um pipeline de sugestões automáticas, **sem publicar textos gerados por IA como fatos apurados sem validação**. Priorizar proposições com potencial de afetar diretamente saúde, educação, trabalho, consumo e mobilidade.
