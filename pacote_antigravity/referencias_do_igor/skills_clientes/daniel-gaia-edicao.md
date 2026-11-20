---
name: daniel-gaia-edicao
description: Padrão oficial de edição de vídeos do Daniel Gaia Assessoria Pecuária (@dgassessoriapec; Reels 9:16, zootecnista falando para a câmera na fazenda) — legenda Montserrat ExtraBold caixa alta, palavra-chave em itálico dourado, título-gancho no topo, logo Daniel Gaia + Estância Bahia, B-roll de gado no terço de cima, números, logo falado, flash branco e fechamento branco com logos coloridos. Use SEMPRE que o pedido for editar, cortar, legendar ou montar vídeo do Daniel Gaia (cliente em Desktop\CLENTES\DANIEL GAIA), mesmo que o usuário não cite o padrão.
---

# Edição Daniel Gaia

Briefing completo: **`C:\Users\Igor Verso\Desktop\CLENTES\DANIEL GAIA\padrao_gaia\treinamento\TREINAMENTO_VISUAL_GAIA.pdf`** (16 páginas).
Quadros e tiras de animação de referência em `...\padrao_gaia\treinamento\_work\img\` e `\anim\`.
**Antes do primeiro corte, leia o PDF** (Read com `pages`). As regras abaixo são o resumo obrigatório.

Ferramentas: motor próprio **`padrao_gaia\motor\gaia_edit.py`** (projeto JSON; docstring no topo explica tudo). Fontes, logos e trilha em `padrao_gaia\assets\`. B-roll em `DANIEL GAIA\GAIA ARQUIVOS\` (drone da boiada, nelore, angus, curral, leilão, central de vendas). Para animação extra use `motion-vox` / `hyperframes`, sempre neste estilo.

Fluxo (exemplo pronto: `DANIEL GAIA\edicoes\teste claud\projeto.py`):
1. Transcrever o bruto com faster-whisper (palavras com tempo; extrair WAV 16 kHz antes — o `av` instalado não abre MP4 direto).
2. `projeto.py` gera `projeto.json`: segmentos tirando pausas > 0,28 s, tempos escritos no bruto e convertidos com `out()`.
3. Render → conferir `stills` + folha a cada 1,5 s → ajustar → entregar em `DANIEL GAIA\edicoes\<nome>\`.

## Regras (PDF)
- **Logo** (p. 3): `logo_duplo_branco.png` em tela cheia (Daniel Gaia esquerda + **Estância Bahia** direita, y 155–286), o vídeo todo. Padrão do usuário = Estância Bahia; `"partner": "eb_leiloes"` só se ele pedir.
- **Legenda** (p. 5–6): Montserrat 800, **CAIXA ALTA**, branca, ≈ 60 px, centro **y 1497**, 2–4 palavras, corte seco (sem animação), sombra preta 60% 3/4 px. Manter a fala do Daniel ("cê", "tá", "pra").
- **Dourado** #EBCE1D: `"BRANCA|dourada"` — itálico serifado minúsculo embaixo da branca, só na palavra-chave, 3–6 vezes.
- **Título-gancho** (topo, y ≈ 470): branca 112 px com brilho + dourada; entra com desfoque ≈ 0,3 s. Volta no fim (chamada).
- **B-roll** (p. 9): entra na palavra; no terço de cima (y 300–760, bordas esfumadas) acima da cabeça, sem cobrir o Daniel; nunca junto com o título. Conferir texto/marca d'água queimados no clipe (AGROPERLAN tem legenda e logo).
- **Números**: `"numbers"` branca grande + dourada, no lugar da legenda. **Logo falado**: `eb_leiloes_branco.png` quando ele diz "EB Leilões".
- **Ritmo** (p. 10): algo novo a cada 4–6 s; take único → `"zoom"` alternando 1,0 / 1,14 no começo das frases. Flash branco 1–2 vezes na troca de assunto.
- **Fechamento**: tela branca, logos coloridos, zoom lento ≈ 2 s.
- **Áudio**: voz na frente, trilha baixa contínua (`trilha_gaia_01.wav`, original gerada; trocar se o usuário mandar outra), final −14 LUFS. 1080×1920, 30 fps.

## Correções do usuário (09/11/2026) — valem MAIS que tudo
- **Dourada só quando ele FALA a palavra.** A branca entra no começo da frase; a dourada entra no instante em que ele diz a primeira palavra dela, e aí ficam as duas. Vale para legenda, título e número. Automático: `marcar_dourado` (gaia_regras) usa as palavras com tempo da linha final (`work\palavras.json`, gerado pelo gaia_edit — rodar o gaia_edit ANTES do gaia_capcut).
- **Não repetir cena de apoio entre vídeos.** Catálogo de 419 clipes em `padrao_gaia\broll_catalogo\` (`catalogo.json` + `pagina_1..4.jpg` com miniaturas numeradas; pastas fazenda -, dia 15-04, agrotins 2026, angus, junho, julho, transporte leilao, GAIA ARQUIVOS…). Já usadas ficam em `padrao_gaia\broll_usados.json`; o gaia_edit avisa "cena REPETIDA" e grava as do vídeo novo. Escolher pela miniatura, conferir o quadro real e evitar cartaz/contato de outra empresa.
- **Nunca apagar `capcut_midia`** de um vídeo que já tem rascunho no CapCut: os rascunhos antigos apontam para esses arquivos e ficam com "Mídia perdida" (aconteceu no "Hora de repor"). Para refazer, crie um rascunho novo (v2) e deixe os arquivos antigos onde estão.
- **Cor: não corrigir.** O CapCut converte certo o arquivo do iPhone. No rascunho a imagem da fala é o **MOV original** (sem som) e a voz limpa vai numa **faixa de áudio própria** (`*_voz_limpa.m4a`), cortada igual — nada de remontar o vídeo (a cópia perdia a informação de cor do iPhone). O MP4 daqui é só prévia.

## Correções do editor (1º vídeo "Gaia - Ciclo pecuário", nov/2026) — valem MAIS que as regras acima
Comparação: meu rascunho × versão final dele (`DANIEL GAIA\Gaia - Ciclo pecuário.mp4`, rascunho CapCut "Gaia - Ciclo pecuário (Claude)").
- **B-roll mais longo: mínimo 2,5 s** (meus tinham 1,1–2,7 s, média 1,9; ele estendeu todos para ≈ 2,4–2,7). Pode passar para a frase seguinte; dois drones seguidos (5 s) tudo bem. Se não cabe depois (fim da fala), começa antes. `gaia_regras.py` aplica isso sozinho nos dois motores.
- **B-roll começa do topo (y 0) e desce até ≈ 650–760, ATRÁS dos logos** (logos continuam por cima) — não abaixo dos logos. Boi gordo + número = **B-roll em tela cheia** com o número por cima.
- **Zoom: menos trocas.** Eu fiz 19 punch-ins no meio da frase, sem corte. Ele troca o zoom **junto com o corte da fala** (corte + zoom ao mesmo tempo), alternando 1,0 e 1,20–1,26 enquadrado no rosto, e usa 2–3 **zooms lentos com keyframe** (1,0 → 1,26 em 3–4 s; abertura 1,07 → 1,41). Nunca troca zoom com intervalo menor que 2,5 s.
- **Cortes de fala mais justos:** ele tirou pausas de 0,14 s ou mais (eu cortava só acima de 0,28 s). Fala final 46,2 s contra 47,2 s.
- **Menos títulos, sem repetir:** ele tirou "ALTA DO ciclo". Usou "MAS AGORA CHEGOU / e se firmou" no topo (virada do assunto) e repetiu o gancho "CICLO pecuário" no fim, em "dessa festa do ciclo pecuário". **REGRA DO USUÁRIO: se a frase já está no destaque (branca + palavra dourada), ela NÃO entra de novo na legenda de baixo — fica repetido.** Se só a parte dourada repete, fica a branca sozinha (ex.: "DESSA FESTA" sem "do ciclo pecuário"). `gaia_regras.py` tira isso sozinho e avisa no terminal.
- **"Lembra lá atrás?" = flashback:** trecho de um vídeo antigo do Daniel numa janela com cantos arredondados, no canto de cima à esquerda (≈ 2,6 s). Aqui ele usou `sequestro de bezerro.mp4`, a partir de 29,6 s.
- **Logo do topo segue a marca citada no vídeo:** falou EB Leilões, então Daniel Gaia + **EB Leilões** no topo. O fechamento continua com Daniel Gaia + Estância Bahia coloridos. Logo falado EB vai **na zona da legenda** (y −0,588, escala 0,55), e não no meio da tela.
- Áudio: música 0,08 (não 0,05); SFX Woosh 0,28, Title Swoosh 0,38, Woosh Motion 0,60, ding 0,32; final em −15 LUFS. Uma transição "Sobrepor" num corte. Fechamento ≈ 2,4 s.

## Duas câmeras (multicam)
Principal = base e **áudio sempre** (frente). Secundária = só imagem, por `"angles": [{"t0","t1","src","offset"}]` (tempo da 2ª = principal + offset; achar o offset por correlação do áudio, ex. `edicoes\nov 7637\projeto.py`). Trocar **poucas vezes** (2–3), em virada de frase ("ou seja…", começo de ideia nova). **Conferir para qual celular ele está OLHANDO** (quadro dos dois no mesmo instante): no trecho em que ele olha para a 2ª câmera, usar a 2ª — no "Leilão de marca" ele passou a olhar para a IMG_1838 a partir de "E você…", e o chamado final inteiro foi nela (correção do usuário). A 2ª costuma ser mais fechada: **não pôr B-roll em cima dela** (a cabeça sobe e o B-roll cobre). No CapCut a 2ª vai numa faixa própria por cima da fala, sem som.
- Ele repete frases (várias tentativas): ficar com a **última tentativa** completa e cortar as anteriores.
- Clipes de leilão em `GAIA ARQUIVOS\gaia leilao\C49xx–C50xx` (leilão Guadalupe): C4965 marca Guadalupe, C5021/C5022 salão com telão, C5044 logo Estância. Muitos são verticais (rotação 90): conferir antes de escolher o recorte.
- **Cenas de apoio "feias e desconexas" (correção do usuário):** clipe vertical na faixa do topo fica recortado e feio — clipe vertical vai em **tela cheia** (`"cover"`, 2,5–2,6 s). Escolher todas do MESMO assunto da fala e na ordem da história (ex.: marca Guadalupe → salão do leilão com o lote no telão → gado de qualidade → rebanho no curral → Daniel conduzindo o leilão). Olhar o quadro real (com a proporção certa) antes de escolher; nada de pessoas cortadas, só pernas/tronco.
- **Logo flutuando na frente dele** (pedido do usuário quando ele fala de uma marca): `"floaters": [{"t0","t1","png","w","x0","x1","y","bob","rot"}]` — várias marcas numa **fila só, todas do mesmo tamanho (≈ 280 px), da ESQUERDA para a DIREITA, na altura do peito (y ≈ 1150)**, velocidade constante, uma a cada 0,75 s, subindo/descendo de leve, com sombra, por cima do Daniel e por baixo da legenda (correção do usuário: não variar tamanho/altura/direção, não passar alto). No CapCut vira imagem com keyframes de posição e rotação + "Woosh Motion". Logo recortada da marca: `padrao_gaia\assets\marca_guadalupe.png` (tirada do clipe C4965, fundo azul removido).

## CapCut (quando pedir para editar no CapCut)
`python -X utf8 padrao_gaia\motor\gaia_capcut.py <projeto.json> "<nome>"` cria um rascunho editável copiando o estilo do rascunho **"erros ao gravar"** do editor (fontes CapCut, brilho, "Elevar na entrada", máscara "Dividir", trilha country e efeitos sonoros dele). Fala = bruto inteiro com voz limpa (cortes e zoom editáveis), B-roll = arquivo original. Depois, com o **CapCut fechado**, rodar de novo com `registrar` no fim para aparecer na lista. `atualizar` regrava só a linha do tempo de um rascunho já criado (perde o que foi editado nele).

## Antes de entregar (PDF p. 16)
Percorra o checklist e diga o que foi conferido e o que não foi (áudio não ouvido, números/valores a confirmar com o Daniel, acentos).
