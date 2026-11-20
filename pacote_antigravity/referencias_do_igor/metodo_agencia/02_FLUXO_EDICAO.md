# 02 — Fluxo de edição, passo a passo

Vale para qualquer cliente. Os números (px, segundos) vêm do `PADRAO.md` do cliente; aqui está o **processo**.

## Etapa 0 — Preparação (nunca pule)
1. Identifique o **cliente** e o **formato** (Reels 9:16 padrão; Story; 16:9; 1:1; card).
2. Leia `02_CLIENTES/<CLIENTE>/PADRAO.md` e abra o PDF (`padrao_x/treinamento/*.pdf`). Para PDF: `pymupdf` (`page.get_text()`) lê o texto e `page.get_pixmap()` gera imagem da página para você **ver**.
3. Olhe os quadros de referência (`treinamento/_work/img/`, `referencia/`) e, se precisar, extraia quadros dos `referencias_videos/` (`03_FERRAMENTAS/extrair_quadros.py`).
4. Rode `python 03_FERRAMENTAS/verificar_ambiente.py`.
5. Pergunte ao usuário o que faltar: caminho dos brutos, roteiro/ideia, se é para o CapCut, se há preço/data a mostrar, se já existe decupagem feita por ele.

## Etapa 1 — Conhecer o bruto
- `python 03_FERRAMENTAS/extrair_quadros.py info <bruto>`: resolução, fps, duração, **rotação**, **HDR**.
- **iPhone (Dolby Vision/HLG BT.2020):** converter para SDR ANTES de qualquer corte, senão a cor sai errada (pele saturada).
  Filtro validado: `libplacebo=w=1080:h=1920:colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv:tonemapping=bt.2390:apply_dolbyvision=1:format=yuv420p`. (zscale+tonemap saturou a pele: foi rejeitado.) Os motores já fazem isso.
- **Rotação:** alguns brutos vêm 1920×1080 sem flag mas gravados em pé → gire com `transpose=1` e crie um `master.mp4` antes de editar. Clipes verticais (rotação 90) de B-roll: confira o recorte antes de usar.
- Folha de contato: `extrair_quadros.py folha <bruto> <pasta> --cada 2` e abra a imagem para escolher planos.

## Etapa 2 — Transcrever com tempo por palavra
- Extraia WAV 16 kHz mono do bruto (ffmpeg) e rode faster-whisper `large-v3-turbo`, `language="pt"`, `word_timestamps=True` (exemplo: `03_FERRAMENTAS/transcrever_exemplo.py`).
- Motores Marca/Gaia: `python <motor>.py projeto.json --palavras` imprime as palavras com tempo (use para ancorar elementos).
- Corrija nomes próprios e termos do cliente (campo `"fix": {"errado": "certo"}` nos motores).

## Etapa 3 — Decupagem (base da fala)
- **Quem faz:** na Marca Motors o usuário entrega a base pronta (regra de um cliente anterior; vale perguntar em todo cliente): você usa a base inteira como um segmento e só cobre. Nos demais, você decupa — mas pergunte se ele quer decupar.
- Corte pausas e vícios: Gaia: tirar pausas ≥ 0,14–0,28 s; Toagro: cortar "oi", "então", respiração, "é…". Comece na frase mais forte.
- Se a pessoa repete a frase em várias tentativas: **fique com a última tentativa completa**.
- Corte em quebra natural de fala; nunca no meio de palavra (o usuário reprovou emendas bruscas).
- Quem fala deve ficar visível no gancho, olhando para a câmera.

## Etapa 4 — Montar o projeto (JSON do motor)
Cada motor lê um `projeto.json` (docstring no topo do `.py` explica todos os campos). Campos comuns:
`src_dir`, `out`, `work`, `segments` (fala), `cover` (B-roll tela cheia), `captions`, `elements`/`titles`/`inserts`, `numbers`, `zoom`, `music`, `fix`, `end_card`.
Ordem de raciocínio:
1. **Fala** (segmentos) → 2. **Legendas** (palavra de impacto/destaque) → 3. **Cobertura** (B-roll que mostra o que está sendo dito naquele segundo) → 4. **Elementos** presos na fala (selo, preço, data, logo falado) → 5. **Ritmo** (algo novo a cada 2–6 s conforme cliente) → 6. **Áudio** → 7. **Fechamento** (assinatura do cliente).

## Etapa 5 — Render e conferência visual
1. Rode o motor. Use `"stills"` (quando existir) ou extraia quadros nos momentos-chave.
2. Gere **folha de contato** do vídeo final (`extrair_quadros.py folha <final.mp4> <pasta> --cada 1.5`) e **abra as imagens**.
3. Confira (detalhe em `05_CHECKLIST_ENTREGA.md`): logo no lugar, legenda sem erro de acento, elementos na hora da fala, nada cobrindo rosto, B-roll sem texto/marca d'água queimados, fechamento completo.
4. Meça posições se houver dúvida: `medir_elemento.py` (legenda deve bater com os px do PADRAO).

## Etapa 6 — Áudio
- Voz limpa na frente (denoise `arnndn` com `assets/voz_cb.rnnn`, já embutido nos motores).
- Trilha só se o padrão do cliente pedir; volume baixo; sobe no fechamento e sai em fade.
- Loudness final: **−14 LUFS**. Você não ouve: diga isso na entrega.

## Etapa 7 — Entrega
1. Saída em `02_CLIENTES/<CLIENTE>/edicoes/<nome-do-video>/` (se a IA e outra editam em paralelo: `edicao_<nome_da_ia>/`, nunca sobrescreva o outro).
2. Gere o **Editor de palpites** (`05_PLATAFORMA/EDITOR_DE_PALPITES.md`).
3. Se o usuário pediu CapCut: `04_CAPCUT/LEIA-ME.md`.
4. Escreva a lista final: *conferido* × *não conferido* (áudio, preço, valores, nomes).

## Etapa 8 — Aprender com a correção
Quando o usuário corrigir (diretamente ou pelos palpites):
- Aplique a correção.
- Se ele disser "vale sempre"/"sempre faça assim", **escreva a regra** no `PADRAO.md` do cliente (seção "Correções do editor", com data e o vídeo de origem) e, se for geral, em `03_REGRAS_UNIVERSAIS.md`.
- Se a regra pode ser automática, ponha no motor (ex.: `gaia_regras.py` aplica B-roll mínimo 2,5 s e remove repetição título × legenda).
