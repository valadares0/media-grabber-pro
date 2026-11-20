---
name: marca-motors-edicao
description: Padrão oficial de edição de vídeos da Marca Motors | Mitsubishi (concessionária; Reels/Stories 9:16 com apresentadora + carros, e versões 16:9 e 1:1) — legenda Cal Sans máquina de escrever, logo duplo no topo, palavra vermelha, selos/preços PNG presos na fala, cortes na batida, trilha eletrônica, fechamento preto e pacote para CapCut. Use SEMPRE que o pedido for editar, cortar, legendar, animar ou montar vídeo/story da Marca Motors (cliente em Desktop\CLENTES\Marca Motors), mesmo que o usuário não cite o padrão.
---

# Edição Marca Motors | Mitsubishi

Briefing completo: **`C:\Users\Igor Verso\Desktop\CLENTES\Marca Motors\padrao_marca\treinamento\TREINAMENTO_VISUAL_MARCA.pdf`** (16 páginas).
Imagens de referência (quadros, tiras de animação quadro a quadro, folhas de contato, catálogo de elementos) em `...\padrao_marca\treinamento\_work\img\`.
**Antes do primeiro corte, leia o PDF** (Read com `pages`). As regras abaixo são o resumo obrigatório.

Ferramentas: motor próprio **`padrao_marca\motor\marca_edit.py`** (projeto JSON; docstring no topo explica tudo). Fonte e logos em `padrao_marca\assets\`. Elementos PNG prontos em `Marca Motors\ARQUIVOS MARCA\` (nomes vindos do Mac têm acento NFD — o motor resolve). Para animação extra use `motion-vox` / `hyperframes`, sempre neste estilo.

Fluxo: `--palavras` (transcrição com tempo) → montar `segments`/`cover`/`elements` → `--batidas` (se houver trilha) para pôr cortes de B-roll na batida → render com `"stills"` para conferir quadros → entregar.

## 1. Legenda (PDF p. 5–6)
- **Cal Sans SemiBold** (`assets\CalSans-Regular.ttf` — mesma letra, nome novo). Uma fonte só.
- Normal: **82 px**, branca, **minúscula**, sem ponto, 2–5 palavras, centro da 1ª linha em **y 1436**, largura máx. 900 px.
- Linha vermelha **#E20413**, **100 px**, logo abaixo (y ≈ 1528), digitada depois da branca. No motor: `"pra fechar o ano de|Mitsubishi Novo"`.
- Impacto: uma palavra vermelha sozinha (`"*OPORTUNIDADE"`), 1–3 vezes por vídeo, no conceito que vende.
- Maiúscula só em nomes: Marca Motors, Mitsubishi, Triton, Eclipse Cross, Outlander, PCD, FIPE.
- Sombra preta 60%, 3/4 px, desfoque 2 px. Sem contorno, caixa, emoji ou palavra-a-palavra pulando.
- Entrada **máquina de escrever ≈ 0,3 s** (letra a letra com fade); troca de bloco em corte seco.

## 2. Logo (PDF p. 3)
- Logo duplo **Marca Motors | Mitsubishi Motors** (`assets\logo_duplo.png`, vermelho e branco), **400 px**, topo centralizado, **centro y 282**, o vídeo todo.
- Fechamento: tela preta, logo **655 px** no centro, fade 0,4 s, 1,5–2 s; música termina junto.
- Nunca separar as marcas, recolorir ou digitar o nome.

## 3. Cores (PDF p. 4)
Vermelho `#E20413` · Preto `#0E0E10` · Branco · Prata `#C9CBCE` · Laranja preço `#C8853A` · Dourado selo `#B08A3E`. Na legenda só branco e vermelho; laranja/dourado só dentro dos PNGs prontos.

## 4. Elementos — regra de tempo (PDF p. 9)
- O elemento **entra quando a comunicadora fala o assunto** (ex.: "super valorização no seu usado" → `Supervalorização usado.png`).
- **Fica até ela mudar de assunto ou a cena acabar** — o que vier primeiro. **Sai no corte, sem animação de saída.**
- Assunto que continua (preço sobre vários B-rolls): `"hold": true` + `"t1"`.
- Posição: zona da legenda (y ≈ 1470, a legenda some) ou embaixo dela (y ≈ 1620, `"with_caption": true`).
- Use o PNG pronto da pasta; não redesenhe. Preço e condição: confirmar valores com o usuário.

## 5. Animações (PDF p. 8)
Pílula/selo: **pop com rebote** ≈ 0,3 s (pequeno e girado → passa do tamanho → assenta). Número gigante: **slam** ≈ 0,4 s (entra enorme com desfoque e assenta), texto de apoio em fade à esquerda (`"numbers"`). Preço fixo sobre os cortes. Proibido: glitch, brilho, neon, 3D, tremida.

## 6. Estrutura, ritmo e música (PDF p. 10)
- Gancho (apresentadora já falando, frase forte) → carro (B-roll do que ela fala) → oferta/prova (preço, selo) → chamada ("fale com o nosso time") → assinatura preta.
- **18–35 s**. Fala em blocos de 5–10 s com jump cuts; B-roll **1,5–2,5 s** por plano, 4–6 cortes seguidos, **na batida**.
- Funil pelo nome do arquivo: **topo** (modelo e para quem é), **meio** (detalhes/benefícios), **fundo** (oferta, preço, prazo, CTA forte).
- Trilha **eletrônica/sport 125–145 BPM**, grave forte (não é rock). Voz na frente; trilha sobe no fechamento e sai em fade. Final **−14 LUFS**, 1080×1920, 30 fps, H.264.
- Cor: iPhone HDR → SDR Rec.709 (motor faz), só exposição e balanço.

## 7. B-roll (PDF p. 13)
Gravado (pátio, salão, oficina, entrega, apresentadora ao volante, chave, multimídia) + **cenas de fábrica** da Mitsubishi (`ARQUIVOS MARCA`, vídeos `250220_MIT_...`, `Video_de_features...`, `cenas 01/02 Eclipse...`). Cena de fábrica leva `"ilustrativas"` (aviso no rodapé). Fábrica 16:9 é recortada no centro: **conferir tarja preta e texto queimado** antes de usar o trecho.

## 8. Formatos (PDF p. 14)
Foco no **9:16**. Depois de aprovado, gerar **16:9** (`nome-horizontal`) e **1:1** (`nome-quadrado`) com os mesmos cortes: logo no **canto superior direito** pequeno (~10% da largura), legenda centralizada a ~74% da altura e ~0,8× o tamanho, reenquadrar cada plano.

## 9. CapCut (PDF p. 15) — só quando o usuário pedir
`python marca_edit.py projeto.json --capcut` gera a pasta `<saida>_capcut\`: base limpa (cortes+cor+áudio, sem legenda/elementos/logo), `02_legendas.srt`, `elementos\*.mov` (ProRes 4444 com alfa, já animados, tela cheia) + `.png`, voz/trilha/mix separados, logo, `07_tempos.csv` e `LEIA-ME.txt`. Sem pedido, entregar o MP4 final normal.

## 10. Antes de entregar (PDF p. 16)
Percorra o checklist do PDF item a item e diga ao usuário o que foi conferido e o que não foi (ex.: áudio não ouvido, preço não confirmado).

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
