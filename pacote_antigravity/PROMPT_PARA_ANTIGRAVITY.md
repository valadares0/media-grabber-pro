# Prompt para colar no Antigravity

> Antes de colar: copie a pasta `pacote_antigravity` inteira para dentro do projeto `media-grabber-extension` (fica `media-grabber-extension/pacote_antigravity/`) e copie `pacote_antigravity/.agent/` para a raiz do projeto. Depois cole o texto abaixo.

---

Você vai evoluir a extensão Chrome **Media Grabber Pro** (pasta atual). O ponto fraco hoje é o **sistema de padrões de edição**. A extensão até cria um "padrão de cliente", mas não consegue aplicá-lo, nem aprender um padrão novo a partir de PDF. Na edição, ela erra a legenda (sai menor, com outra fonte, fora da posição da referência), os motions e os B-rolls.

Um diagnóstico completo foi feito e o núcleo da solução **já está escrito e testado** em `pacote_antigravity/motor_padrao/`. Sua tarefa é **integrar e completar**, não reescrever do zero.

## Leia primeiro (nesta ordem)
1. `pacote_antigravity/PLANO_DE_MELHORIAS.md`: diagnóstico com provas, fases e critério de pronto de cada fase, lista de bugs com arquivo:linha.
2. `pacote_antigravity/motor_padrao/LEIA-ME.md`: o que cada módulo faz e como chamar.
3. `pacote_antigravity/motor_padrao/padroes/daniel_gaia/padrao.json`: exemplo completo do Padrão v2.
4. `pacote_antigravity/referencias_do_igor/`: as regras de edição reais de 5 clientes e o método da agência. É a "verdade" de como um padrão deve se comportar.

## Antes de mudar qualquer coisa
- Rode `node pacote_antigravity/motor_padrao/testes/rodar_testes.js`. Precisa dar **11 pass, 0 fail**. Se falhar por ambiente (ffmpeg sem libass, falta de `pip install fonttools`), resolva o ambiente primeiro e me diga o que fez.
- Rode `node pacote_antigravity/motor_padrao/ferramentas/validar_padrao.js pacote_antigravity/motor_padrao/padroes/daniel_gaia/padrao.json --sem-arquivos`.

## O que fazer
Siga as fases do PLANO_DE_MELHORIAS.md **na ordem**. Ao terminar cada fase, pare, me mostre o critério de pronto cumprido (saída de teste, imagem da cartela ou folha de contato) e espere meu OK.

- **Fase 0**: segurança e bugs críticos (token no servidor local, injeção de comando no open-folder, chave Gemini no cabeçalho, ffmpeg no Mac, native host com caminho fixo, manifest com acento quebrado).
- **Fase 1**: mover `motor_padrao/` para `js/motor_padrao/` e trocar o `buildAss`/render do `js/ai_clips.js` pelo motor novo (use `motor.js` como modelo). Biblioteca de padrões em `~/.mediagrabber/padroes/`. Migrar presets e clientes antigos.
- **Fase 2**: importação de padrão por PDF + vídeo de referência, em 4 passos (enviar → extrair fatos + medir → completar pendências → aprovar com cartela lado a lado). Use `lib/importar_padrao.js`, `ferramentas/medir_referencia.js` e `ferramentas/cartela_teste.js`.
- **Fase 3**: plano de edição por corte com `lib/plano_ia.js` (o Gemini sugere, o código valida, `regras.js` decide os tempos), mostrado ao usuário antes do render.
- **Fases 4 a 9**: B-roll, motion, transcrição/arquivo local, interface, scanner/popup, instalação/código.

## Regras que não podem ser quebradas
1. Tamanho do padrão = tamanho em (como CapCut/PIL). No ASS use **sempre** `fontsizeAss()`; nunca o número direto.
2. Fonte variável **não** funciona no libass (vira Arial ou Thin). Use TTF estático do peso; o motor converte com fontTools se precisar. Sempre `fontsdir` + conferir no log `fontselect` que não caiu em Arial.
3. Posição por centro em px (`\an5\pos`), nunca `MarginV` em %. Nunca diminuir a fonte para caber.
4. Animação só do `CATALOGO_MOTION`. O que o PDF pedir e não existir vira **pendência**, nunca improviso. Proibições do cliente vencem tudo.
5. A IA (Gemini) **sugere** com `responseSchema` e listas fechadas (ids de destaque, ids do catálogo de B-roll, campos importáveis). Px, segundos, cores e durações vêm do padrão e das regras, nunca da IA.
6. Medida de vídeo aprovado > medida escrita no PDF > descrição > inferência. Conflito vira pendência.
7. **Correção do editor vale mais que o PDF** (`correcoes[]`). Quando eu disser "vale sempre", grave no padrão.
8. Nada de imagem gerada por IA como B-roll de cliente real.
9. Todo render passa por `conferir_render.js`. Se reprovar, o corte fica "precisa revisão" com os motivos na tela. Na entrega, diga o que **não** foi conferido (áudio não é ouvido pela IA, acento visto por humano, escolha das cenas).
10. Não quebre o que funciona (download, scanner): teste o fluxo de baixar vídeo do YouTube depois de cada fase.
11. Antes de mexer num arquivo grande (`ai_clips.js`, `popup.js`), leia o trecho inteiro que vai mudar. Mudanças pequenas e testadas; nada de reescrever arquivo inteiro de uma vez.

## Como me responder
Português do Brasil, curto. Para cada fase: o que mudou (arquivos), como testou (comando + resultado), o que ficou pendente e o que precisa de mim (arquivos de fonte/logo, decisões).
