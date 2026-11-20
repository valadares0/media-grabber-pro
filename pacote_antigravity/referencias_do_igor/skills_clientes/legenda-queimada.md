---
name: legenda-queimada
description: Queima legenda estilizada no video, com a tipografia da marca e acentuacao conferida. Use quando pedirem legenda no video, legenda queimada, subtitle, caption no reel ou texto na tela.
allowed-tools: Bash, Read, Write
---

# legenda-queimada

## Duas tecnicas

**PIL quadro a quadro** (usada nos reels da Scala 447): controle total de
tipografia, escalonamento e cor. Use quando a legenda faz parte do design.

**ASS/libass via ffmpeg**: mais rapida, boa para legenda corrida de fala.

Word timestamps saem do Whisper nos dois casos.

## Fontes disponiveis

```
~/agents/video/fonts/   Lexend-Regular, Montserrat-Bold, Montserrat-ExtraBold,
                        Montserrat-ExtraBoldItalic, Syne-Regular
```

A tipografia e' **a da marca do cliente**. Nunca reuse a fonte de outro cliente.

## Conferencia de acento, obrigatoria

O erro mais comum e' o acento sumir ou virar quadrado porque a fonte nao tem o
glifo. **Conferir no quadro renderizado, nunca so no codigo.**

```python
import sys, os
sys.path.insert(0, os.path.expanduser("~/agents/_shared/lib"))
from criativo import checar_acento
print(checar_acento("Construção em Chapecó, atenção"))   # ['ã','ç','é','ç','ã']
```

Renderize um quadro de teste com o texto mais acentuado do video e olhe o PNG
antes de processar o video inteiro.

## Criterio de aceite

1. Tipografia da marca
2. **Acentuacao conferida no quadro renderizado**
3. Texto legivel no formato de destino
4. Nao cobre o rosto (ajuste a posicao vertical do bloco)
5. Contraste suficiente sobre o fundo em movimento
