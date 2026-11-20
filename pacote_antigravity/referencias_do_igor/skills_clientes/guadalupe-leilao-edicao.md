---
name: guadalupe-leilao-edicao
description: Padrão oficial de edição e motion do Leilão Guadalupe 22/11 (Guadalupe Fazenda & Haras; "Touros & Matrizes PO", domingo 12h, recepção em Palmas/TO) — vídeo de fala no curral com logo 3D dourado no topo, legenda Montserrat caixa alta em corte seco, elementos brancos (22/11, Touros & Matrizes PO) presos na fala, motions sóbrios na parede ardósia com chapéu, sela e armário, e fechamento no papel com o logo gravado. Use SEMPRE que o pedido for editar, legendar, animar ou montar vídeo, story ou motion do Leilão Guadalupe ou da Guadalupe (cliente em Desktop\CLENTES\GUADALUPE), mesmo que o usuário não cite o padrão.
---

# Leilão Guadalupe 22/11

Briefing completo: **`C:\Users\Igor Verso\Desktop\CLENTES\GUADALUPE\padrao_leilao\treinamento\TREINAMENTO_VISUAL_LEILAO_GUADALUPE.pdf`** (15 páginas; gerador em `treinamento\_work\montar.py`). **Antes do primeiro corte, leia o PDF.** As regras abaixo são o resumo obrigatório.
Logos prontos em `padrao_leilao\assets\`: `leilao_guadalupe_3d.png` (Leilão Guadalupe dourado), `touros_matrizes_po.png` (selo marrom; em vídeo vai branco), `papel.png`.

Pasta do padrão: **`C:\Users\Igor Verso\Desktop\CLENTES\GUADALUPE\padrao_leilao\`**
- `referencia\`: quadros do vídeo aprovado no After Effects (`AE_*`) e da edição de fala aprovada (`FALA_*`, logo, legenda, elementos, transições). **Abra antes de começar.**
- `assets\`: `fundo_parede_sem_texto.png` (cena da parede sem os textos), `Montserrat-VF.ttf`, `motion_celular_canais.mp4`.
- `motor\`: **`guadalupe_edit.py`** (editor de fala, base no motor do Gaia: `segments`, `cover` com touros, legenda, logos, elementos `say`, fechamento AE via `end_clip`; exemplo em `GUADALUPE\edicoes\IMG_8385\projeto.json`), `motion_celular.py` e `limpa_fundo.py`. Elementos brancos prontos: `data_2211_branco.png` (fonte Century, parecida com a das artes) e `touros_matrizes_po_branco.png`.

## COR: NÃO CORRIGIR (pedido do usuário, 12/11/2026)
O usuário corrige a cor no CapCut. **Entrega principal = rascunho direto no CapCut** (igual ao Daniel Gaia): `python padrao_leilao\motor\guadalupe_capcut.py projeto.json "<nome>"` cria o rascunho em `AppData\Local\CapCut\User Data\Projects\com.lveditor.draft` (fala e touros com o arquivo ORIGINAL do iPhone, voz limpa em faixa própria, logos e elementos em PNG, legenda como texto do CapCut, fechamento AE); depois, **com o CapCut fechado**, o mesmo comando com `registrar` põe o projeto na lista. Alternativa em arquivos (`guadalupe_edit.py --capcut`): `01_video_original_HDR.mov` (imagem original do iPhone, HLG 10 bits, só cortada, sem tonemap/LUT), `02_camada_...mov` (ProRes 4444 transparente com logos, legenda e elementos), `03_audio_voz.wav`, `04_legendas.srt`, `05_fechamento_AE.mp4`. O MP4 final convertido para SDR serve só de prévia.
Bruto de touros: `D:\BACKUP CLIENTES\GUADALUPE\visita 10-11` (touro sozinho no piquete: dia 2, inventário em `edicoes\IMG_8385\work\inventario.json`, índices ~204–315).

Vídeos-base: `Downloads\Video by guadalupefazenda.mp4` (motion AE aprovado, 29,7 s) e `GUADALUPE\Marco - Gustavo.mp4` (edição de fala aprovada, 34,7 s).
Material do leilão no Drive: pasta "Leilão Guadalupe 22/11" (id `1XNvGjH6JaK99kt3aQrBvsE3nwgQjVNxO`). Em `Elementos`: NOME LEILÃO, LOGO LEILÃO 3D, PAPEL BASE, ASSINATURA GERAL LOGOS. Também tem cards por tema (Contagem, Cadastro, Baixe o App, Catálogo) e Impressos. Baixe do Drive só o que for usar.

## Tom
Leilão é **sério**: nada com "cara de rede social". O usuário já rejeitou celular dourado, balanço e flutuação ("infantilizado"). Proibido: quique ou rebote, tremida, glitch, neon, emoji, caixa pulsando, zoom punch, texto pulando palavra a palavra.

## 1. Vídeo de fala (estrutura aprovada)
1. **Abertura (0–4 s):** quem conduz (ex.: Gustavo, EB Leilões) dá o contexto ("encerrados os apartes…") e chama o anfitrião pelo nome.
2. **Anfitrião (Marco):** data, horário, local, o que vai a leilão, onde transmite, quem realiza.
3. **Plano em dupla** (os dois lado a lado, gado ao fundo) para passar a palavra e para o "esperamos todos vocês".
4. **Motion de apoio** quando a fala cita algo que se mostra (canais, app, catálogo). Entra e sai em **dissolve de ~0,2 s**.
5. **Fechamento:** corte seco para o trecho AE da sala (~8,5 s): luz acende, o papel se preenche em cascata, brilho no 22/11, zoom pelo "11", logo Guadalupe gravado no papel.
- Entre takes de fala: **corte seco**. Plano médio, da cintura para cima, para a pessoa sozinha. Plano aberto para a dupla. Total de 30 a 40 s, 1080×1920, 30 fps.

## 2. Logo no topo
**LEILÃO GUADALUPE** em 3D dourado (`assets\leilao_guadalupe_3d.png`; no Drive se chama "LOGO LEILÃO 3D"), **~400 px de largura, centro em y ≈ 275**, fixo durante a fala e os motions de apoio. Sem animação. No fechamento AE ele já faz parte da cena.

## 3. Legenda
- **Montserrat Bold/ExtraBold** (`assets\Montserrat-VF.ttf`), **CAIXA ALTA**, branca, **~46 px**, **centro em y ≈ 1385**, largura máxima de ~900 px, no máximo 2 linhas.
- 1 a 5 palavras por bloco, trocando em **corte seco**, sem animação. Sombra preta suave, sem caixa e sem contorno. Tudo branco: sem palavra colorida.
- Mantém a fala como foi dita ("né?", "Marquinho").

## 4. Elementos presos na fala
- Entram **quando a pessoa fala o assunto** e saem quando muda de assunto, **no corte**.
- **Data:** "22/11" com serifa clássica branca (a mesma letra das artes; confirmar o arquivo da fonte com o usuário) e "DOMINGO / 12H" embaixo, em caixa alta espaçada. **Centro em y ≈ 1360, no lugar da legenda: a legenda some enquanto a data aparece** (medido no "Marco - Gustavo (final)"; o y ≈ 1210 anterior foi substituído). Nos vídeos do leilão 12/09 de fazenda a data era dourada.
- **Produto:** selo branco "TOUROS & MATRIZES PO" com a cabeça do touro, ~350 px de largura, centro em y ≈ 1230.
- **Entrada:** cresce de ~60% para 100% com fade, **~0,3 s**, freando no final. **Sem passar do tamanho.** Sem animação de saída.
- O elemento fica branco sobre o vídeo; o dourado é só do logo do topo.

## 5. Motion (princípios do vídeo AE aprovado)
- **Câmera contínua, sem cortes secos.** Cada cena passa por dentro da próxima usando algo da própria cena: um boi cruzando a frente, a janela abrindo, um zoom atravessando o "11".
- **2.5D com parallax:** as camadas se movem em velocidades diferentes, com aceleração e freada longas e suaves.
- **Texto em cascata** de cima para baixo, com fade e saindo do desfoque para o foco, ~0,15–0,3 s entre itens.
- **Destaque = brilho dourado passando** pelo texto ou número. Nada de caixa, selo ou escurecer a tela.
- **Pausas longas** para leitura (5–6 s com a informação completa).
- **Cenário:** parede azul-ardósia com luminária de luz quente, chapéu, laço, sela, armário de madeira com N. Sra. de Guadalupe, a foto dos fundadores e os troféus, e o couro no chão. Use `assets\fundo_parede_sem_texto.png`.
- **Paleta:** madeira, ardósia, papel envelhecido, dourado só na tipografia. Celular, se houver, em titânio escuro, quase parado (respiro de 3 px), sem aro dourado.
- **Fechamento:** logo Guadalupe Fazenda & Haras gravado (pirografado) no papel, ~5 s parado.
- Ferramentas: Python/PIL + ffmpeg (ver `motor\`), `hyperframes` ou Higgsfield para planos gerados. Entregar MP4 e, quando for para o editor, MOV ProRes 4444 com fundo transparente.

## 5b. Outros tipos de vídeo da Guadalupe (estilo geral)
PDF: **`padrao_leilao\estilo_geral\ESTILO_EDICAO_VIDEOS_GUADALUPE.pdf`** (gerador `estilo_geral\montar.py`; quadros em `estilo_geral\img\`). Logos brutos em `GUADALUPE\ARQUIVOS` (ex.: `Guadalupe Branco.png`).
- **A · Fazenda / institucional:** só o logo **Guadalupe Fazenda & Haras** dourado no topo (~250 px, centro y ≈ 265), sem logo do leilão. Legenda branca em y ≈ 1385. Gado cobre a fala quando ela o cita. Fechamento: corte seco para fundo preto com o logo (~2 s).
- **B · Leilão:** logo 3D no topo (seção 2) **e** logo Guadalupe pequeno (~250 px, centro y ≈ 1600) embaixo da legenda. Fechamento no 22/11: papel; no 12/09: card do cartaz (~4 s).
- Vídeos do Mateus têm faixa dourada no alto da tela. Exportar sempre 1080×1920 (um bruto veio 720×1280).
- Valores medidos a olho em quadros; o áudio não foi ouvido.

## 6. Antes de entregar
Gere uma folha de contato (`ffmpeg ... tile`) e confira: logo no lugar, legenda sem erro de acento, elementos na hora da fala, nenhum movimento com rebote, dissolves curtos, fechamento completo. Diga ao usuário o que não deu para verificar (por exemplo, o áudio não foi ouvido).
