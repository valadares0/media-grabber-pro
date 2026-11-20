---
name: toagro-edicao
description: Padrão oficial de edição de vídeos curtos (Reels/Stories 9:16, talking head) e cards da Toagro Agronegócios — legenda, logo, cores, fontes, gancho, B-roll, animações na tela e checklist. Use SEMPRE que o pedido for editar, legendar, animar ou criar card/story para a Toagro (cliente em Desktop\CLENTES\TOAGRO), mesmo que o usuário não cite o padrão.
---

# Edição Toagro — briefing de treino

O briefing completo é o PDF **`C:\Users\Igor Verso\Desktop\CLENTES\TOAGRO\padrao_toagro\treinamento\TREINAMENTO_VISUAL_TOAGRO.pdf`** (16 páginas).
As imagens de referência dele estão em `...\treinamento\_work\img\` (cards, quadros anotados, B-rolls, folhas de contato).
**Antes do primeiro corte de qualquer vídeo Toagro, leia o PDF passo a passo** (Read com `pages`) e use as imagens como inspiração em toda legenda e animação. As regras abaixo são o resumo obrigatório; o PDF é a referência visual.

Ferramentas: não há Remotion instalado. Use o motor próprio `padrao_toagro\motor\toagro_edit.py` (legenda, logo, B-roll, música, cartela final), ffmpeg/PIL para composição e as skills `motion-vox` / `hyperframes` para animação — sempre obedecendo este estilo, que é mais sóbrio que o padrão dessas skills.

## 1. Legendas (PDF p. 5–7)
- **Fonte**: Montserrat (`padrao_toagro\assets\Montserrat-VF.ttf`). Uma família só, sem fonte manuscrita.
- **Legenda normal**: Bold 700, **55 px**, branca, **minúscula**, sem ponto final, 2–5 palavras por bloco, centro em **y ≈ 1395** (1080×1920), largura máx. 900 px, margem lateral 90 px.
- **Palavra de impacto**: Bold **74 px**, sozinha, mesma posição; 1–3 vezes por vídeo, só no conceito principal.
- **Sombra**: preta ≈55%, 3 px para baixo, desfoque 6 px. Sem contorno, sem caixa, sem cor, sem emoji, sem palavra-a-palavra pulando.
- Nomes de empresa em CAIXA ALTA (TOAGRO, CORTEVA, CAMPTA). Bloco nunca atravessa corte; legenda acompanha a fala sem adiantar.
- **Story institucional**: frase fixa 2 linhas, Bold 41 px, frase normal com pontuação, y 1455–1530, logo colorida no topo (y 190–285).
- Zona proibida (UI do app): topo 0–220, base 1700–1920, coluna direita x > 960.

## 2. Logo (PDF p. 3)
- Reels: **logo branca** (`assets\toagro_logo_branco.png`), **340 px**, centralizada, **y 1550–1610**, o vídeo inteiro, inclusive sobre B-roll.
- Fechamento: tela preta + logo branca centralizada (~45% da largura), 1–2 s.
- Toagro Log: só em conteúdo da Log (duas logos brancas pequenas no topo). Nunca digitar o nome, esticar ou recolorir.

## 3. Cores (PDF p. 4)
Verde Toagro `#02412A` · Bordô `#63211F` (só na logo) · Verde destaque `#63AA5F` · Branco · Areia `#F1EEE6` · Preto. A foto é a cor principal; marca só nos detalhes. Campanhas (ex.: Outubro Rosa) trocam só o verde destaque.

## 4. Gancho e retenção (PDF p. 14)
- Começar na frase mais forte; cortar "oi", "então", respirações e "é...".
- Quem fala **fica na tela** no gancho, olhando para a câmera.
- Ganchos: problema, número, pergunta ou bastidor.
- Troca visual a cada 2–4 s (corte, B-roll, palavra de impacto ou animação). Prova visual logo após a promessa (fala "mapa" → mostra o mapa). Conclusão no fim, antes de "fale com a Toagro".

## 5. Estrutura e edição (PDF p. 8)
Abertura → fala + prova (B-roll) → parceria/equipe → chamada → assinatura preta. 15–45 s, planos de 1,5–4 s, corte seco (dissolve ≤ 0,3 s), zoom leve ≤ 110% só em B-roll. Cor natural: iPhone HDR → SDR Rec.709 (ver memória iphone-hdr-conversion), só exposição e balanço. Voz limpa na frente, música corporativa ≈ −15 dB sob a voz, final −14 LUFS, 1080×1920 30 fps H.264.

## 6. B-roll (PDF p. 11)
Usar só o que mostra o que está sendo dito naquele segundo: detalhe de marca/produto, veículo com logo, aperto de mão, mão na planta/semente, lavoura aberta, tela com mapa, planilha/sistema, dedo apontando a tela, caminhada no armazém, aéreo da estrutura, equipe na loja, técnico no campo. 30–40% do vídeo.

## 7. Animações na tela (PDF p. 15)
Quatro categorias, um estilo só:
| Categoria | Uso | Como fazer |
|---|---|---|
| Texto | número, conceito | Montserrat Black, verde Toagro ou branco, sobe 40 px com fade, 8–10 frames |
| Objeto | semente, produto, máquina | PNG recortado, sombra suave, desliza e "assenta" |
| Personagem | técnico, produtor | pessoa recortada sobre fundo da marca + etiqueta pill com nome/cargo |
| Vídeo | sistema, mapa, drone | vídeo dentro de cartão arredondado (26 px) |
- **Fundo**: o próprio vídeo desfocado (≈9 px em 540 de largura) e escurecido 40–50%; nunca cenário inventado.
- **Posição**: y 300–1100; legenda e logo continuam no lugar.
- **Efeitos**: sombra suave, cantos arredondados, movimento curto e lento. Proibido: brilho, neon, glitch, 3D, grão pesado, aberração cromática, "boil".
- Duração 2–4 s, presa na palavra falada. Exemplo: `_work\img\demo_overlay.jpg`.

## 8. Cards do Instagram (PDF p. 12–13)
Foto real em tela cheia escurecida sob o texto; título Montserrat Black CAIXA ALTA branco, entrelinha 1,0, alinhado à esquerda; palavras-chave em caixa verde `#63AA5F` (cantos 8 px); etiqueta pill verde acima (tema/data, pode ter ícone); círculo fino + seta para callout; logo branca embaixo à esquerda com linha fina; parceiro à direita; degradê preto atrás do texto, nunca caixa sólida.

## 8b. Referências de edição do usuário (Pinterest)
O usuário mandou estes pins como **referência de estilo de edição**. O PDF continua sendo a base; os pins são a segunda fonte, usada conforme a estrutura e o momento do vídeo (o usuário decide qual das duas vale em cada trecho — se o plano não disser, siga o PDF e pergunte).
- Pin 1 https://br.pinterest.com/pin/671599363236245110/ — antes/depois de talking head: palavra-chave em serifada itálica ao lado do rosto, número gigante em tela cheia, punch-in, cor quente.
- Pin 2 https://br.pinterest.com/pin/825003225537034548/ — objetos recortados sobre fundo texturizado, círculo e seta à mão, câmera descendo até o próximo objeto.
- Pin 3 https://br.pinterest.com/pin/1101693127601677073/ — produto com HUD técnico, linhas de medida, texto digitando numa janela, fundo escuro.
- Pin 4 https://br.pinterest.com/pin/730849845821064529/ — legenda palavra a palavra no centro, zoom alternado a cada corte.
- Pin 5 https://br.pinterest.com/pin/579627414585161503/ — antes/depois: cor limpa e quente, punch-in, legenda curta.
Conflitos com o PDF (cor quente, legenda palavra a palavra): avise e adapte ao padrão Toagro, a não ser que o usuário peça o estilo do pin naquele trecho.
Os nomes de edição que o usuário usa (zoom in com desfoque, pessoa embaixo + imagem em cima, recorte com elementos atrás etc.) estão na página `gestor Tailândia\teste com ia\PLANEJAMENTO_toagro_gestor.html`, bloco 2; o plano exportado de lá ("Baixar plano") traz o nome escolhido por trecho — execute cada trecho como descrito.

## 9. Antes de entregar (PDF p. 16)
Percorra o checklist do PDF item a item e diga ao usuário o que foi conferido e o que não foi (ex.: áudio não ouvido).

## Editor de palpites (toda entrega)
Ao entregar um vídeo (rascunho ou final), gere o editor de palpites na pasta da edição:
`python "C:\Users\Igor Verso\Desktop\CLENTES\_editor\gerar_editor.py" <projeto.json> --cliente "<Cliente>" --palavras <palavras.json> --pdf <PDF de treinamento do cliente> --cor "<cor da marca>" --versoes "*_claude*.mp4" --fonte <TTF da legenda> --logo <PNG do logo>`
Ele cria `EDITOR.html` + `editor_dados.js` + `editor_midia/`. O usuário abre no navegador (sem internet, sem créditos), marca palpites por minutagem, palavra, cena ou área, e clica em "Enviar", que baixa `palpites_<video>.json` e copia o texto. Ao aplicar:
- leia o JSON e execute cada palpite pendente;
- palpite "vale sempre" vai para esta skill;
- responda cada palpite em `editor_respostas.json` (`{id: {estado: feito|nao, nota}}`) e gere o editor de novo, para ele ver o que foi feito.
Avisos e sugestões extras: chaves `editor_avisos` / `editor_sugestoes` (`[{t, t1, texto}]`) no projeto JSON.
O editor também EDITA: corta (E/Q/W/Delete), reorganiza e troca clipes, edita legendas e elementos, com prévia ao vivo (vídeo limpo + textos desenhados). O pacote enviado traz `montagem`. Para aplicar:
`python "C:\Users\Igor Verso\Desktop\CLENTES\_editor\aplicar_montagem.py" <Downloads\palpites_xxx.json>`
Esse comando reescreve o projeto (com backup em analise/) e renderiza. Depois aplique os palpites de texto e gere o editor de novo. Se houver lettering (lettering/lettering.py), rode de novo depois do render.
