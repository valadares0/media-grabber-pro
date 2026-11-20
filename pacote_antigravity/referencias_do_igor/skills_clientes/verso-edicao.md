---
name: verso-edicao
description: Padrão oficial de edição de vídeos da VERSO Marketing Agro (a agência do Igor; Reels/Stories 9:16 de fala, bastidor de feira, entrevista no stand, vlog de evento) — legenda Montserrat pequena minúscula no peito (y≈1150, 1–3 palavras), palavra-explosão grande alternando sans 900 / Playfair itálico / tag roxa #4F11A8, contador 1-2-3, cards roxo-escuro com borda roxa, polaroids, celular mockup, slates tipográficos, logo Verso branco no topo e fechamento roxo-escuro. Use SEMPRE que o pedido for editar, cortar, legendar ou montar vídeo da Verso (cliente em Desktop\CLENTES\VERSO), mesmo que o usuário não cite o padrão.
---

# Edição VERSO

Leia antes do primeiro corte:
1. **`Desktop/CLENTES/PLATAFORMA_EDICAO_IA/02_CLIENTES/VERSO/PADRAO.md`** (medidas completas).
2. **PDF `02_CLIENTES/VERSO/padrao_verso/TREINAMENTO_VISUAL_VERSO.pdf`** (Read com `pages`) — quadros-exemplo de cada efeito.
3. `referencias_quadros/ref1..7.jpg` (estilo do Pinterest que MANDA) e `atual_*.jpg` (só marca).
Método geral: `PLATAFORMA_EDICAO_IA/01_METODO/02_FLUXO_EDICAO.md` e `03_REGRAS_UNIVERSAIS.md`.
Assets: `padrao_verso/assets/` (logo branco/preto, Montserrat-VF, Playfair Italic). Brutos/B-roll: `Desktop/CLENTES/VERSO/`. Trabalhar em `Desktop/CLENTES/VERSO/edicoes/<nome>/`. Ferramentas: faster-whisper (palavras com tempo), ffmpeg, `hyperframes`/`motion-vox` para cards, contador e slates — sempre neste estilo.

## Cores
**Roxo #4F11A8 = cor de TODO efeito.** Roxo-escuro #12062D = fundo de card, slate e fechamento. Roxo-claro #8C50FF só em filete sobre roxo-escuro. Branco = legenda. Papel #F4F4F2 = tela de dados. Verde/amarelo/azul existem SÓ dentro do logo — nunca em efeito.
Roxo puro some em fundo escuro: em texto/número roxo, sempre contorno branco ou texto branco dentro de tag roxa.

## A lógica do estilo (o que o editor precisa entender)
O vídeo tem **duas camadas de texto**: a legenda (pequena, sempre lá, discreta) e o **destaque** (raro, grande, é o que a pessoa lembra). E uma terceira camada de **elementos que provam o que a pessoa fala** (número, lista, foto, tela). Nada é decoração: cada coisa que entra na tela entra **na palavra** que ela ilustra e **sai no corte** seguinte. Tela limpa a maior parte do tempo; impacto em momentos escolhidos.

## Como cada efeito aparece na tela
| Efeito | Quando usar | Onde | Como entra | Quanto fica / sai |
|---|---|---|---|---|
| **Legenda** | sempre que alguém fala | centro y 1150 (peito); entrevista a 2: y 1250 | corte seco no início da 1ª palavra; Montserrat 600 46 px minúscula branca, sombra suave | até o próximo bloco (1–3 palavras, ≤18 caracteres) |
| **Destaque A — explosão** | gancho, negação, ideia forte | substitui a legenda no y 1150 | pop: escala 0,85→1,00 em 0,15 s (5 quadros), palavra Montserrat 900 150–190 px + 1–3 palavras pequenas 34 px penduradas em cima/embaixo | a frase inteira (1–2 s); some no corte, sem animação de saída |
| **Destaque B — serifa** | promessa, número por extenso, palavra emocional | idem | mesmo pop; Playfair Italic 140 px branca + linha pequena embaixo | idem |
| **Destaque C — tag roxa** | CTA, nome da marca, palavra a gravar | idem | linha pequena branca entra; 0,1 s depois a palavra branca Montserrat 800 dentro da tag roxa entra com pop | até o fim da frase |
| **Contador 1-2-3** | quando a pessoa enumera ("primeiro…", "três coisas") | topo, y 360, três círculos 64 px | aparece no "primeiro"; o círculo do passo atual enche de roxo (0,15 s) a cada "segundo"/"terceiro" | fica a lista toda; some no fim da lista |
| **Número do passo** | junto com o contador | à esquerda, y 600 | número 300 px roxo com contorno branco + título do passo ao lado, pop 0,15 s | 1,0–1,5 s |
| **Card / lista** | quando cita itens, benefícios, etapas | y 300–700, acima da cabeça | cada card sobe 40 px + fade em 0,2 s **no instante em que o item é falado**; empilham, gap 24 px | todos ficam até o fim da lista; saem juntos no corte |
| **Polaroid / foto real** | quando cita lugar, cliente, evento | ao lado da cabeça, y 300–750, girada ±6° | pop 0,2 s com sombra; 2ª foto 0,3 s depois | 1,5–2,5 s |
| **Celular mockup** | fala de Instagram, anúncio, resultado na tela | tela cheia, fundo roxo-escuro com brilho roxo no canto | slide de baixo 0,25 s; título da etapa em cima | enquanto explica a tela |
| **Número que conta** | resultado, dado | tela papel ou acima da cabeça | conta 0→valor em 0,8 s + SFX pop; etiqueta roxa embaixo | 1,5–2 s |
| **Slate tipográfico** | virada de assunto | tela cheia roxo-escuro | corte seco + whoosh; frase curta Montserrat 900 + Playfair, filete roxo-claro | 0,8–1,5 s |
| **Flash roxo** | troca de bloco grande | tela cheia | 2 quadros | máx. 2 por vídeo |
| **B-roll** | ilustra o que é falado | tela cheia | corte seco na palavra; legenda continua por cima | 1,5–2,5 s |
| **Fechamento** | fim | roxo-escuro, logo branco 520 px centro | zoom 1,00→1,05 | 1,5–2 s |

Limites: **máx. 2 elementos** além da legenda ao mesmo tempo; **nunca sobre o rosto**; destaque **3–6 por minuto**, nunca o mesmo tipo (A/B/C) duas vezes seguidas; o texto em destaque **não se repete** na legenda; algo novo a cada 2–3 s.

## Ritmo e áudio
Gancho com destaque A ou slate no 1º segundo → ponte → corpo (contador/cards) → CTA com destaque C → fechamento. Cortar pausas ≥ 0,15 s; zoom 1,00/1,15 junto do corte. Voz −14 LUFS; trilha só se pedir; SFX whoosh (slate/card) e pop (número) a 0,25–0,35.
Logo Verso branco 300 px no topo (y≈110) o vídeo todo.

## Nunca
Legenda caixa alta, com fundo ou no rodapé; efeito verde/amarelo/laranja; inventar número/nome/data; entregar sem dizer "áudio não ouvido".

## Catálogo de efeitos — como o Igor pede
O Igor escreve a edição assim (tempo do BRUTO + nome do catálogo em MAIÚSCULA + material):
```
00:00 EXPLOSÃO "postar"
00:10 VITRINE PC (photoshop) — arquivo: flyer_rodeio.png
00:14 VITRINE CELULAR — arquivo: story_rodeio.mp4
00:28 TAG "VERSO"
fim FECHAMENTO
```
A IA aplica cada linha no segundo indicado e preenche o resto seguindo o padrão. Material de VITRINE = arquivo real do cliente; se faltar, PERGUNTAR (nunca inventar arte). Nome desconhecido → perguntar.

| Nome | O que aparece | Use quando a pessoa fala… |
|---|---|---|
| LEGENDA | legenda base y 1150 (sempre ligada) | — |
| EXPLOSÃO "palavra" | palavra gigante Montserrat 900 + palavras penduradas | gancho, negação, ideia forte |
| SERIFA "palavra" | palavra em Playfair itálico | promessa, emoção, número por extenso |
| TAG "palavra" | palavra branca em etiqueta roxa | CTA, nome da marca |
| CONTADOR 1-2-3 | círculos no topo + número do passo | primeiro / segundo / terceiro |
| LISTA | cards roxo-escuro entrando um por vez | itens, benefícios, etapas |
| POLAROID | fotos reais giradas ao lado da cabeça | lugar, cliente, evento |
| NÚMERO 4.931 | número que conta + etiqueta | resultado, dado |
| PAPEL | tela clara com dado/comparação | explicação, antes × depois |
| SLATE "frase" | tela cheia roxo-escuro com frase | virada de assunto |
| FLASH | flash roxo de 2 quadros | troca de bloco (máx. 2) |
| BROLL | imagem real em tela cheia | o que está sendo falado |
| FECHAMENTO | logo no roxo-escuro | fim |
| VITRINE 3D | a arte/flyer/banner flutuando inclinada no escuro, luz de janela, câmera chegando | "criei o flyer / a arte / o banner" |
| VITRINE PC (programa) | monitor inclinado com Photoshop/Canva/Premiere e a arte aberta; câmera entra na tela | "fiz no photoshop", processo de criação |
| VITRINE CELULAR | celular deitado na mesa de madeira, luz de janela, tela com o story/post | "postei", "tá no ar", story, reels |
| VITRINE POST | mockup do post do Instagram com curtidas, inclinado no fundo claro | resultado, engajamento |
| VITRINE PAREDE | vários materiais lado a lado, câmera passa por eles | portfólio, "fizemos vários" |
| DIGITANDO "texto" | bloco de notas branco com o texto sendo digitado | ideia, briefing, roteiro |
| CHECKLIST | linha do tempo com ícones que vão acendendo | processo, etapas do job |
| BRILHO "palavra" | palavra roxa com sublinhado ondulado + estrelas | contraste ("mas a marca não") |
| MURAL "palavra" | palavra repetida em textura, uma em destaque | frase de efeito, fechamento de ideia |
| MACRO | câmera colada na arte, passando com desfoque forte nos detalhes | detalhe, acabamento, "olha esse detalhe" |
| TELA 3D | tela de app/site inclinada, lista rolando | site, app, cardápio, catálogo |
| MONTAGEM | ícones/peças da arte entram um a um com brilho até formar a peça | como a arte foi construída |
| REVELA POST | zoom-out: a arte vira um post do Instagram com curtidas | "e virou post", resultado |
| NOTIFICAÇÃO | celular na mesa recebe notificação/balão de mensagem que salta | cliente aprovou, mensagem, venda |
| RELÓGIO | relógio digital correndo (00:05→02:00) com frase em cima | prazo, rapidez, "em 2 horas" |
| CINZA→PRETO "frase" | frase entra palavra a palavra em cinza e escurece | frase de efeito em fundo claro |
| CINEMA "palavra" | fundo escuro com objetos 3D flutuando + palavra condensada texturizada, 1 palavra roxa | virada forte, chamada |
| PROMPT | barra de busca/IA digitando + prévia em vídeo embaixo | "pedi pra IA", pesquisa, ideia |
| CTA CÂMERA | tela de câmera do celular gravando + claquete com prints colados + texto manuscrito | chamada final ("chama a Verso") |

### Família VITRINE (ref8, pin 1086986060079822211 — analisado inteiro, 36 s, ~20 cenas)
- Material vira objeto 3D: inclinado 15–25°, fundo roxo-escuro (ou mesa de madeira / papel claro), **luz de janela** em faixas diagonais, bordas desfocadas, sombra forte.
- Entra na palavra ("criei", "fiz", "postei") com whip/zoom 0,2 s + whoosh; câmera chega devagar (escala 1,00→1,12, giro 3–5°); 1,5–3 s por cena.
- Sequência de material: cena nova a cada ~1,5 s, trocas com whip, zoom-blur ou flash branco; grão leve.
- Legenda continua (sobe para y 1500 se o objeto ocupa o meio); logo do topo continua.
- Minutagem completa da ref8 no PDF (seção 08c).

## Correções do editor
(vazio — anotar aqui e no PADRAO.md cada correção do Igor; valem mais que o resto)
