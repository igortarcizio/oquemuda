# Protótipo funcional v2

`oquemuda-funcional.html` é uma versão navegável do site com a proposta visual e as correções da revisão de 11/11/2026 (`docs/revisao-comite-2026-11-11.md`). É um arquivo único que abre direto no navegador.

O acervo do repositório (`dados/catalogo.js`, `dados/editorial.js`, `dados/deputados-partidos.js`) vai embutido no arquivo. Por isso busca, temas, filtros, paginação, salvos e ficha funcionam sem internet. Com conexão, o protótipo consulta ao vivo a mesma base Supabase do site (chave pública de leitura) e a API da Câmara para três coisas: a situação de cada proposta, a autoria na ficha e os atalhos "Prontas para pauta" e "Aprovadas na Câmara".

## Gerar de novo

Na raiz do repositório, com Node 22:

```bash
node prototipo/build/build.mjs
```

| Arquivo | Papel |
| --- | --- |
| `build/build.mjs` | Lê o acervo, calcula assuntos e temas, descarta registros de teste e gera o HTML |
| `build/classify.js` | Regra única de tema (13 temas, sem "Outros"), usada no build e no navegador |
| `build/template.html` | Interface: HTML, CSS e JS do protótipo |

## O que muda em relação ao site

- **Temas:** 13 temas e nenhum "Outros"; o card e o filtro usam a mesma regra.
- **Ano:** o filtro mostra só os anos que existem no acervo.
- **Atalhos "De olho na Câmara":** não ficam mais presos ao ano atual.
- **Busca:** ignora acento e aceita palavras soltas ou o número da proposta.
- **Títulos:** pergunta só nas propostas revisadas pela redação, com selo; as demais têm título descritivo gerado a partir da ementa e a linha "Altera:".
- **Navegação:** foco de teclado gerenciado, card inteiro clicável, filtros ativos removíveis e "Voltar" que mantém a busca.
- **Celular:** filtros recolhidos e atalhos compactos.
- **Ficha:** linha do tempo da tramitação.

## Limitações

- **Partido do autor:** o filtro saiu porque o acervo não traz a autoria.
- **Títulos automáticos:** são gerados por regra e alguns saem longos.
- **Parte ao vivo:** não foi testada fora do ambiente de desenvolvimento. Se, aberto direto do computador, a faixa do topo ficar laranja mesmo com internet, teste a versão publicada (`/prototipo/oquemuda-funcional.html` no GitHub Pages, depois do merge).
