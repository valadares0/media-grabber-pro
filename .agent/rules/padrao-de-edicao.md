# Regras do sistema de padrões de edição (sempre ativas)

Este projeto edita vídeos de clientes seguindo um **Padrão v2** (JSON com medidas em px 1080×1920, segundos e hex).
Código de referência e testado: `js/motor_padrao/` (antes da integração: `pacote_antigravity/motor_padrao/`).
Plano completo: `pacote_antigravity/PLANO_DE_MELHORIAS.md`.

## Legenda e texto
- Tamanho do padrão = tamanho em (CapCut/PIL). No ASS: `fontsizeAss(fonte, px)`, nunca o número direto (o libass desenha 20–36% menor).
- Fonte variável não funciona no libass (vira Arial ou Thin). Use TTF estático do peso (`garantirEstatica`). Sempre `fontsdir=` e confira o log `fontselect`.
- Posição pelo centro visual em px (`\an5\pos`), nunca `MarginV` em %. Quebra de linha medida; **nunca** reduzir a fonte para caber.
- Destaque entra no tempo da palavra falada e não se repete na legenda de baixo.
- Mantenha a fala como foi dita ("cê", "tá", "pra", "né?"). Acento conferido no quadro renderizado.

## Motion, elementos e B-roll
- Animação só do `CATALOGO_MOTION` (`lib/padrao.js`). O que não existe vira pendência. Proibições do cliente vencem tudo.
- Elemento entra quando a pessoa fala o assunto e sai no corte (salvo `hold`).
- B-roll só do catálogo do cliente, mostrando o que é falado naquele segundo. Duração mínima do padrão, nunca junto com o título, vertical em tela cheia, sem texto ou marca d'água queimados. Nada de imagem gerada por IA como prova.

## IA (Gemini)
- A IA sugere, com `responseSchema` e listas fechadas (campos importáveis, ids de destaque, ids de B-roll). Px, segundos, cores e durações vêm do padrão e das regras.
- Importar PDF: fatos com página e citação → o código monta o padrão. Medido em vídeo aprovado > medido no PDF > descrito > inferido. Conflito vira pendência.
- Correção do editor (`correcoes[]`) vale mais que o PDF. "Vale sempre" vira registro no padrão e, se possível, regra em `regras.js`.

## Entrega
- Todo render passa por `conferir_render.js`. Reprovou = "precisa revisão" com os motivos.
- Sempre diga o que **não** foi conferido: áudio (a IA não ouve), acento visto por humano, escolha das cenas, valores e nomes a confirmar.
- `node js/motor_padrao/testes/rodar_testes.js` verde antes de dizer que terminou.
