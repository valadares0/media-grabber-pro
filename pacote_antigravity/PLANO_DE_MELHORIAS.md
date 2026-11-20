# Media Grabber Pro: plano de melhorias

Documento para o agente (Antigravity) que desenvolve a extensão `media-grabber-extension`.
Escrito depois de ler o projeto inteiro (8.859 linhas) e de **testar na prática** as causas dos erros de edição.
Junto com este documento vem a pasta `motor_padrao/`: código novo, testado (11 testes passando), que resolve o núcleo do problema e deve ser **integrado**, não reescrito.

---

## 0. Resumo em uma página

**O problema principal.** A extensão não sabe guardar nem aplicar um "padrão de edição". O padrão de cliente atual tem 11 campos de legenda (fonte, tamanho, 2 cores, contorno, palavras por linha, margem, caixa alta, cor do gancho). Não existe onde guardar destaque/palavra-chave, título, logo, elementos presos na fala, B-roll, motion, fechamento, áudio, proibições ou correções do editor. Por isso:

- **O PDF é lido, mas não é aplicado.** O Gemini espreme o manual nesses 11 campos e o resto se perde. O que o PDF não diz, ele inventa.
- **Motion e B-roll não existem no código.** Não há nenhuma linha que insira B-roll, logo, PNG, selo ou animação. O único "motion" é um zoom lento de 6% e um pulo de escala de 112% na palavra falada.
- **A legenda sai menor e diferente da referência** por quatro causas técnicas, todas comprovadas em teste (seção 1.2).

**A solução** (já implementada em `motor_padrao/`, falta integrar):

1. **Padrão v2**: um JSON com medidas (px em 1080×1920, segundos, hex) para legenda, destaques, título, números, logo, elementos, B-roll, câmera, ritmo, transições, fechamento, áudio, motions permitidos/proibidos, checklist, **correções do editor** (que valem mais que o PDF), proveniência de cada número e pendências.
2. **Catálogo fechado de motion**: a IA só pode escolher animações que o motor sabe fazer, com tempos fixos. O que não existe vira pendência, nunca improviso.
3. **Importador em 2 etapas**: o Gemini extrai *fatos com citação* para uma lista fechada de campos (responseSchema). O código monta o padrão. **Medidas reais vêm de pixels** de um vídeo aprovado (`medir_referencia.js`), não do olho da IA.
4. **Gerador de legenda novo** (`legenda_ass.js`): tamanho correto, fonte certa, posição pelo centro visual, quebra de linha medida, sombra suave, destaque que entra quando a palavra é falada, sem repetir o destaque na legenda.
5. **Composição** (`composicao.js`): zoom no corte, B-roll (faixa do topo esfumada ou tela cheia), logo, elementos PNG com entrada do catálogo, flash, fechamento, música e loudnorm, num comando ffmpeg só.
6. **Regras automáticas** (`regras.js`): B-roll mínimo, sem B-roll em cima do título, vertical vai para tela cheia, cobertura máxima, elemento sai no corte, zoom só no corte, flash no máximo N, ritmo "algo novo a cada N s"...
7. **Trava de entrega** (`conferir_render.js`): mede no MP4 final se a legenda está no y e no tamanho do padrão, mede o loudness, gera folha de contato e **reprova** se estiver fora.
8. **Cartela de teste** (`cartela_teste.js`): prova visual de um padrão novo, lado a lado com a referência, **antes** de editar qualquer vídeo.

---

## 1. Diagnóstico

### 1.1 Por que "ele cria o padrão, mas não aplica"

| O que o usuário espera | O que o código faz | Onde |
|---|---|---|
| Padrão completo do cliente (legenda + destaque + logo + B-roll + motion + fechamento) | Perfil com 11 campos de legenda | `js/ai_clips.js:1186-1215` (prompt), `saveClient` `:47` |
| Ler o PDF e aplicar | Gemini devolve o JSON final direto, sem citação; o que não cabe nos 11 campos some | `js/ai_clips.js:1139-1220` |
| Medir a referência | 3 quadros (1 s, 3 s, 6 s) enviados como imagem; o tamanho é chutado | `js/ai_clips.js:1170-1176` |
| Usar o estilo do cliente | `style` só aceita `hormozi\|mrbeast\|clean\|none`; `"none"` **desliga a legenda** | `js/ai_clips.js:1195`, `js/ai_studio.js:655` |
| Fonte da marca (Montserrat, Cal Sans) | Nome solto no ASS, sem `fontsdir`; se a fonte não está instalada no Windows, o ffmpeg troca por Arial **sem avisar** | `js/ai_clips.js:1046` |
| Presets e clientes no mesmo lugar | Presets fixos no JS (`PRESETS`) e duplicados no HTML; clientes em `~/.mediagrabber/clients/` em outro formato | `js/ai_studio.js:251-426`, `ai_studio.html:74-137` |
| Correções do editor ("B-roll mínimo 2,5 s") | Não há onde guardar nem regra que aplique | — |

### 1.2 Por que a legenda sai menor, com outra cara e fora do lugar (provado)

Todos os testes abaixo foram rodados com o ffmpeg 9 (libass 0.17.5) e as fontes reais dos clientes. Estão reproduzidos em `motor_padrao/testes/rodar_testes.js`.

**Causa 1: o libass não entende "tamanho" como o CapCut, o Figma ou o PIL.** O Fontsize do ASS é a altura *usWinAscent + usWinDescent* da fonte, não o tamanho em (em). Na Montserrat isso é 1,562 em.

| Mesmo número "60" | Altura da letra H |
|---|---|
| PIL / CapCut, 60 px | **42 px** |
| ASS `Fontsize 60` (como a extensão faz hoje) | **28 px** (33% menor) |
| ASS `Fontsize 93,72` (convertido por `fontes.fontsizeAss`) | **43 px** ✔ |

Fator por fonte: Montserrat 1,562 · Playfair Display 1,41 · Cal Sans 1,362 · Arial Bold 1,117. Todo padrão medido em PIL/CapCut sai menor na extensão.

**Causa 2: fonte variável.** Todos os clientes usam `Montserrat-VF.ttf` (variável). O peso padrão dela é **100 (Thin)**, e o libass **não escolhe instância** de fonte variável:
- `Fontname = "Montserrat ExtraBold"` → log do libass: `fontselect: (Montserrat ExtraBold, 400, 0) -> ArialMT`, ou seja, **Arial**;
- `Fontname = "Montserrat"` + `Bold=-1` → Thin com **negrito falso** (traço bem mais grosso que o ExtraBold real).

A solução, que o motor aplica sozinho, é converter a variável em **TTF estático do peso** com fontTools (`varLib.instancer`). Depois disso: `fontselect: (Montserrat ExtraBold) -> Montserrat-ExtraBold` e H = 42 px ✔. Melhor ainda: guardar o TTF estático em `assets/`.

**Causa 3: posição por margem em %, não por centro.** `marginV = H × 0,28` com alinhamento embaixo (`js/ai_clips.js:598-608`). Os PDFs medem o **centro** do texto (ex.: Gaia y 1497, Toagro y 1395). Com 1 ou 2 linhas, o texto anda. O motor novo usa `\an5\pos(x, y)` no centro visual de cada linha.

**Causa 4: largura e quebra.** `WrapStyle: 1` deixa o libass quebrar onde quiser, e o pulo `\fscx112` na palavra falada (`:631`) muda a largura da linha a cada palavra ("legenda pulando"). O motor novo mede a largura real de cada linha (calibrada pelo próprio libass, porque na fonte variável a tabela de larguras é a do Thin) e quebra em no máximo `max_linhas`. **O tamanho nunca é reduzido para caber**: se não cabe, o bloco é dividido.

**Causas de sincronia:**
- `downloadSegmentFast` corta com `-ss` antes do `-i` e `-c:v copy` (`js/ai_clips.js:815-819`). Com cópia, o vídeo começa no keyframe anterior, e o áudio (re-encodado) começa no tempo exato. Depois disso, os filtros (`trim` do jump-cut, render) podem deslocar o vídeo em relação ao áudio e à legenda. **Corrigir:** re-encodar o trecho (`-c:v libx264 -preset veryfast -crf 18`): com re-encode, o `-ss` de entrada é exato.
- Tempo por palavra vindo da legenda automática do YouTube, com palavras do mesmo segmento espaçadas artificialmente a cada 0,05 s (`:193`). **Corrigir:** faster-whisper com `word_timestamps` (`ferramentas/transcrever_palavras.py`), ao menos no trecho do corte.

### 1.3 Por que "erra nos motions e nos B-rolls"

Porque **não existem**. O Antigravity provavelmente tenta montar filtros ffmpeg do zero a cada pedido, sem catálogo, sem tempos fixos, sem regras e sem conferência. O motor novo tem:
- **Catálogo** (`lib/padrao.js` → `CATALOGO_MOTION`): `corte_seco, fade, pop, pop_rebote, crescer, desfoque_foco, sobe_fade, maquina_escrever, slam, palavra_por_palavra, conta_numero, sai_no_corte, fade_saida, zoom_no_corte, zoom_lento, punch_in, flash, dissolve` (+ `whip`, `brilho_passando` planejados). Cada um tem parâmetros e implementação fixos, em ASS (texto) e em ffmpeg (PNG).
- **Proibições por cliente** com sinônimos ("quique" → `pop_rebote`, "zoom punch" → `punch_in`, "palavra a palavra" → `palavra_por_palavra`). O validador **recusa** o padrão ou troca a entrada por `corte_seco` e avisa.
- **B-roll a partir de catálogo** (`lib/broll.js`): ffprobe de cada clipe (duração, vertical, HDR, rotação) + miniaturas para a IA etiquetar. A IA escolhe um **id do catálogo** (enum no responseSchema) e a **palavra** onde entra. As regras decidem duração, posição e conflitos.

---

## 2. O que vem pronto em `motor_padrao/`

```
motor_padrao/
  motor.js                      fluxo completo: projeto.json -> MP4 (+ conferência)
  lib/
    padrao.js                   Padrão v2: valores padrão, validação, correções, catálogo de motion, migração v1
    fontes.js                   lê .ttf sem dependência; tamanho libass; fonte variável -> estática; calibra largura
    legenda_ass.js              gera o .ass: legenda, destaques, título, números (substitui buildAss)
    composicao.js               um comando ffmpeg: zoom, B-roll, logo, elementos, legenda, flash, fechamento, áudio
    regras.js                   regras do padrão aplicadas no plano (generaliza gaia_regras.py)
    broll.js                    catálogo de B-roll + sugestões da IA -> plano
    plano_ia.js                 prompt + responseSchema do plano de edição do corte e validação da resposta
    importar_padrao.js          PDF/referência -> fatos (Gemini, schema fechado) -> padrão (código)
    medir.js                    lê quadros com ffmpeg e mede pixels (legenda, logo, cor, cortes)
  ferramentas/
    validar_padrao.js           trava: padrão aplicável? (fontes, arquivos, motions, zonas)
    medir_referencia.js         mede um vídeo aprovado -> números para o padrão
    cartela_teste.js            prova visual do padrão, lado a lado com a referência
    conferir_render.js          trava de entrega: mede o MP4 final e reprova se estiver fora
    transcrever_palavras.py     faster-whisper, tempo por palavra
  padroes/                      5 padrões reais convertidos: daniel_gaia, marca_motors, toagro, guadalupe_leilao, verso
  testes/                       node testes/rodar_testes.js (11 testes; --rapido pula os de render)
```

Sem dependências npm. Precisa de: Node 18+, ffmpeg/ffprobe com libass, Python + `fonttools` (só se houver fonte variável) e `faster-whisper` (transcrição local).

**Resultado comprovado** (teste de ponta a ponta com fala sintética, pausa cortada, título, dourado, elemento, B-roll, flash e fechamento):
```
ok  tamanho da legenda: maiúscula 42px ≈ esperado 42px
ok  posição da legenda: 7 blocos com centro em y 1497 ±14
ok  loudness -14 LUFS (alvo -14)
medir_referencia no vídeo final -> legenda y 1497, 60 px; logo y 282, 400 px (= padrão)
```

---

## 3. Plano de implementação (em ordem)

Cada fase tem **critério de pronto**. Não passe para a próxima com a anterior vermelha. Rode `node js/motor_padrao/testes/rodar_testes.js` a cada mudança.

### Fase 0: segurança e bugs críticos (P0, antes de tudo)

1. **Servidor local aberto para qualquer site.** `Access-Control-Allow-Origin: *` sem autenticação (`js/media_engine_server.js:566`). Qualquer página aberta no Chrome pode chamar `127.0.0.1:48721` e, com isso: trocar a chave Gemini (`POST /api/ai/config`), disparar downloads e renders (enchendo o disco) e abrir pastas.
   - Gerar um token aleatório na instalação (`~/.mediagrabber/token`), mandar em `X-MG-Token` pela extensão e recusar requisições sem ele.
   - Aceitar só `Origin: chrome-extension://<id>`; responder CORS só para essa origem.
2. **Injeção de comando** em `/api/open-folder`: `exec(\`explorer.exe /select,"${filePath}"\`)` e `exec(\`open -R "${filePath}"\`)` (`:685-693`). Trocar por `spawn("explorer.exe", ["/select,", caminho])` / `spawn("open", ["-R", caminho])` e aceitar só caminhos dentro de `DOWNLOADS_ROOT`.
3. **Chave do Gemini na URL** (`?key=` em `js/ai_clips.js:390`) aparece em logs e proxies. Mandar no cabeçalho `x-goog-api-key`.
4. **Mac não renderiza nada:** `ffmpeg = path.join(FFMPEG_DIR, "ffmpeg.exe")` (`js/ai_clips.js:788`). No Mac, `FFMPEG_DIR` é `/opt/homebrew/bin` e `ffmpeg.exe` não existe. Usar `process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"`.
5. **Native messaging quebrado em outro PC:** `js/com.mediagrabber.engine.json` aponta para `C:\Users\kerci\...` e para um ID fixo de extensão. O instalador registra esse arquivo sem reescrever o caminho. Também: `native_host.bat` e `start_engine_silent.vbs` têm caminho de node fixo.
   - O instalador deve **gerar** o JSON com o caminho real da pasta.
   - Pôr `"key"` no `manifest.json` para o ID da extensão desempacotada ficar fixo.
   - Achar o `node.exe` com `where node` em vez de `C:\Program Files\nodejs`.
6. **Acentos quebrados no Chrome:** `manifest.json` está com UTF-8 codificado duas vezes (bytes `C3 83 C2 AD` = "Ã­"). Nome e descrição aparecem como "VÃ­deos". Regravar em UTF-8 limpo.

**Pronto quando:** `curl http://127.0.0.1:48721/api/ai/config` sem token → 401; render funciona no Mac; o instalador funciona numa pasta com outro nome de usuário; o Chrome mostra "Vídeos".

### Fase 1: integrar o motor de padrão no render (resolve legenda e fonte)

1. Copiar `motor_padrao/` para `js/motor_padrao/`.
2. Biblioteca de padrões em `~/.mediagrabber/padroes/<id>/padrao.json` + `assets/` (fontes TTF, logos, PNGs). Na primeira execução:
   - copiar os padrões embutidos (`js/motor_padrao/padroes/*`);
   - migrar `~/.mediagrabber/clients/*.json` com `migrarPerfilV1()` (sai com pendências, porque o v1 não tinha medidas);
   - converter os presets fixos (`PRESETS` de `ai_studio.js`: tibapa, mrbeast, hormozi, podcast, encaixa, cinema, raw) para arquivos v2, e **apagar** o objeto `PRESETS` e os cards fixos do HTML. A interface lê tudo do motor.
3. Em `render()` (`js/ai_clips.js:963`), trocar `buildAss` + a montagem de `vf` por:
   ```js
   const { carregarPadrao } = require("./motor_padrao/lib/padrao");
   const { gerarAss, carregarFontes } = require("./motor_padrao/lib/legenda_ass");
   const { aplicarRegras, elementosPorGatilho } = require("./motor_padrao/lib/regras");
   const { montarComando } = require("./motor_padrao/lib/composicao");
   // 1) padrão  2) palavras do corte (já remapeadas pelo jump-cut)  3) plano (IA + regras)
   // 4) gerarAss -> work/legenda.ass; copiar leg.fontes para work/fontes
   // 5) montarComando({..., ass:"legenda.ass", fontsDir:"fontes"}) e rodar com cwd = work
   // 6) conferir_render.js: se reprovar, marcar o job como "precisa revisão" e mostrar os motivos
   ```
   Use `motor.js` como modelo: ele faz exatamente esse fluxo.
4. `downloadSegmentFast`: **parar de usar `-c:v copy`** com `-ss` (re-encodar com libx264 veryfast crf 18).
5. Jump-cut: o limiar de silêncio (`-32dB`, `d=0.45` em `:689`) deve vir de `padrao.ritmo.cortar_pausas_acima_s`. Gaia corta a partir de 0,14 s; Toagro 0,25; VERSO 0,15.
6. Layout "blur" (podcast): aplicar o layout **antes**, gerando `fala_9x16.mp4`, e passar esse arquivo como `fala` para `montarComando`.
7. Remover `STYLES`, `hexToAss`, `buildAss` e o `\fscx112`.

**Pronto quando:** um corte renderizado com `daniel_gaia` passa em `conferir_render.js` (legenda y 1497 ±14, maiúscula ≈ 42 px, sem passar de 900 px) e a folha de contato mostra Montserrat ExtraBold, e não Arial nem Thin.

### Fase 2: importar padrão novo por PDF e referência (o pedido principal)

Fluxo na interface ("➕ Novo padrão"), em 4 passos:

1. **Enviar**: nome, PDF do manual, 1 a 3 vídeos de referência **aprovados** (arquivo ou link), observações.
2. **Extrair** (job no motor):
   - `medir_referencia.js` em cada vídeo → mediana das medidas;
   - `importarPadrao({ pdfBase64, quadrosBase64, medidas, callGemini })` (`lib/importar_padrao.js`). Ele manda o PDF inline + o prompt `promptFatos` + `responseSchema: schemaFatosGemini()`. O Gemini devolve **fatos** (campo da lista fechada, valor, página, citação, confiança) e motions mapeados para o catálogo;
   - o código monta o padrão: **medido no vídeo > medido no PDF > descrito > inferido**. Conflitos e faltas viram `pendencias`.
   - **Mudar `callGemini`** para aceitar `opts.responseSchema` e `opts.temperature` e pôr em `generationConfig` (hoje só manda `responseMimeType`).
3. **Completar**: lista de pendências como checklist, por exemplo:
   - "envie o TTF estático de Montserrat ExtraBold";
   - "envie o logo PNG";
   - "a animação 'explosão de partículas' não existe no catálogo: escolher a mais próxima".
   O upload salva em `padroes/<id>/assets/`.
4. **Aprovar**: formulário com cada campo, o valor e **de onde veio** (`proveniencia`: "pdf p.5: '…'" / "medido em ref1.mp4"), mais a **cartela de teste** (`cartela_teste.js --ref video@t`) lado a lado com a referência. Cada mudança no formulário regera a cartela. Só salva com `validar_padrao.js` sem erro.

Regras do importador:
- Nunca salvar padrão com `erros`. Pendências podem existir, mas aparecem como aviso em todo render até serem resolvidas.
- Correções posteriores do usuário entram em `correcoes[]` com data. Com `campo`/`valor`, sobrescrevem o PDF automaticamente (`aplicarCorrecoes`). Só com `regra`, vão para a IA e, se possível, viram código em `regras.js`.
- O padrão é **versionado**: guardar `padrao.v1.json`, `v2`… ao salvar, para poder voltar.

**Pronto quando:** importar o `TREINAMENTO_VISUAL_GAIA.pdf` + o vídeo "Gaia - Ciclo pecuário" produz um padrão cuja cartela bate com a referência (linhas-guia sobre a legenda real) e cujas diferenças para `padroes/daniel_gaia/padrao.json` aparecem como conflitos ou pendências, e não como valores trocados em silêncio.

### Fase 3: plano de edição por corte (onde entram destaque, título, número, B-roll e flash)

1. Depois de escolher o corte, chamar o Gemini com `promptPlano()` + `schemaPlanoGemini(padrao, catalogo)` (`lib/plano_ia.js`). Os ids de destaque e de clipe vão como **enum**.
2. `validarPlanoIA()` descarta destaque cujo texto não está na fala, id inventado, clipe fora do catálogo e excesso de quantidade.
3. `aplicarRegras()` decide os tempos (B-roll ≥ mínimo, não junto com título, elemento sai no corte, zoom só no corte, flash no máximo N).
4. **Mostrar o plano antes do render**: uma linha do tempo simples com legenda, destaques, B-roll e elementos. O usuário pode remover ou mover e ajustar a transcrição (corrigir palavra e nome). Só então renderizar.

**Pronto quando:** num corte de 40 s, o plano mostra os destaques ancorados em palavras reais e nenhum B-roll fora do catálogo, e os avisos das regras aparecem na tela.

### Fase 4: B-roll

1. Configurar a pasta de B-roll **por padrão** (`broll.pasta`) e rodar `node broll.js catalogar <pasta> catalogo.json --miniaturas mini/`.
2. Etiquetar com o Gemini olhando as miniaturas (3 quadros por clipe). Pedir também `problemas`: "texto queimado", "marca d'água", "tarja preta", "pessoa cortada", "logo de outra empresa". Guardar no catálogo e revisar à mão.
3. HDR do iPhone (`hdr: true`): converter para SDR **antes** de compor (`libplacebo … tonemapping=bt.2390`, ou `zscale` + `tonemap` se não houver Vulkan). Sem isso a pele sai saturada.
4. `usados.json` por cliente: avisar cena repetida entre vídeos (regra do Gaia).
5. Para vídeos do YouTube (cortes virais sem material do cliente), deixar B-roll **desligado** por padrão. Imagem gerada por IA **não** é aceita como prova para cliente real (`ia_gerada_permitida: false`).

**Pronto quando:** um corte do Gaia sai com B-roll ≥ 2,5 s na faixa do topo, esfumado, atrás do logo, e clipe vertical em tela cheia.

### Fase 5: motion e elementos

1. Toda animação vem do `CATALOGO_MOTION`. Implementar `whip` e `brilho_passando` só se um padrão aprovado pedir, e sempre com teste.
2. Elementos da biblioteca (`elementos.biblioteca[]`) entram **sozinhos** pelo gatilho falado (`elementosPorGatilho`) e saem no corte. Ex.: Guadalupe "22 de novembro" → data na zona da legenda, e a legenda some.
3. Proibições do cliente vencem tudo, inclusive pedidos da IA.
4. Motions complexos (cenas 3D, vitrine, celular mockup: catálogo VERSO) ficam **fora** do motor ffmpeg. Gerar à parte (HyperFrames/Remotion) como MOV com alfa e inserir como elemento `tela_cheia`.

### Fase 6: transcrição, arquivos locais e cor

1. **Arquivo local** (bruto do celular): hoje só há link. Aceitar upload/caminho local no estúdio. É o uso real da agência.
2. Transcrição com `transcrever_palavras.py` (faster-whisper `large-v3-turbo`, `word_timestamps`). Usar sempre para arquivo local e para o trecho do corte no YouTube. Campo `fix` por cliente para nomes ("Gaya" → "Gaia").
3. Detectar HDR/rotação do bruto (ffprobe) e normalizar antes de tudo.
4. Cor: não aplicar grade. Alguns clientes corrigem no CapCut (regra Gaia/Guadalupe).

### Fase 7: interface do estúdio

1. **Biblioteca de padrões** vinda do motor (`GET /api/padroes`). Cada card mostra a cartela real (PNG gerado), não `previews/*.jpg` fixos.
2. **Editor do padrão** com prévia ao vivo: canvas 1080×1920 (escalado) desenhando legenda, destaque, logo e zonas proibidas com `FontFace` carregando o TTF do padrão. No canvas, `font-size` em px = em, igual a PIL/CapCut, então a prévia bate com o render (o motor faz a conversão para o libass).
3. **Pendências** sempre visíveis no card do padrão.
4. **Plano do corte** editável (fase 3) e **resultado da conferência** no card do corte (ok/falha + folha de contato).
5. **Corrigir e lembrar**: botão "isso vale sempre" que grava a correção no padrão (`correcoes[]`).
6. Corrigir:
   - `focus` só é preenchido se estiver vazio (`js/ai_studio.js:438`), então trocar de preset não troca o foco;
   - `activeClientId = "tibapa"` fixo (`:248`);
   - `loadClients()` clica no Tibapa a cada carga (`:560`);
   - `innerHTML` com nome e descrição vindos do Gemini (`:548-553`): usar `textContent`.

### Fase 8: scanner, downloader e popup

1. `background.js` guarda a lista de mídias em memória (`mediaStore`, `:7`). No MV3 o service worker dorme depois de ~30 s e a lista some. Guardar em `chrome.storage.session`.
2. `content.js` roda em **todas as páginas e todos os frames** com `setInterval(800 ms)` + `MutationObserver` em todo o DOM (`:287-309`). Isso pesa a CPU em qualquer site. Limitar o intervalo ao YouTube e usar `navigation`/`yt-navigate-finish`; o observer deve agir só quando aparecer `<video>`/`<img>` novo.
3. `webRequest` sem filtro de tipo (`background.js:172`). Usar `types: ["media","xmlhttprequest","other","image"]`.
4. **Downloads e cortes no popup** (`popup.js`: HLS em memória `:348`, `MediaRecorder` em tempo real `:417`, `decodeAudioData` do vídeo inteiro `:612`). Ao fechar o popup, tudo morre e vídeos grandes estouram a memória. Mandar para o motor (ffmpeg/yt-dlp) ou para um `offscreen document`.
5. Variantes falsas: o motor lista 1080/720/480/360 mesmo quando o vídeo não tem (`media_engine_server.js:297-330`), e páginas genéricas viram "1080p Full HD" (`:167-173`, `:215-221`). Listar só as alturas reais de `info.formats`.
6. `catch (_) {}` silencioso em dezenas de lugares (ex.: `popup.js:692` mostra "Erro ao baixar" sem motivo). Registrar o erro e mostrar a causa.
7. `startDownloadJob` apaga o arquivo existente sem perguntar (`:391-393`). Usar sufixo `(2)`.

### Fase 9: instalação, portabilidade e código

1. `auto_install.ps1` controla a interface do Chrome por UIAutomation (fragilíssimo, depende do idioma e da versão). Manter como "tentativa", mas sempre mostrar o passo manual ("chrome://extensions → Carregar sem compactação").
2. Instalador: checar e instalar `fonttools` e `faster-whisper` (`pip install`), e checar ffmpeg **com libass** (`ffmpeg -filters | findstr subtitles`).
3. Python no Windows: `python` no PATH costuma ser o atalho da Microsoft Store (não roda pelo Node). Usar a busca de `fontes.candidatosPython()` e o mesmo para o yt-dlp.
4. Caminhos > 260 caracteres (OneDrive): o Python não abre. O motor copia para uma pasta curta antes (`garantirEstatica`); fazer o mesmo nos outros spawns de Python.
5. Versões desencontradas: README v5.0, motor v4.5, instalador v2.0, health "4.5". Usar uma constante só (`package.json`).
6. `jobs`, `analyses`, `previewCache` e as pastas `mediagrabber_ai/prev_*` nunca são limpos (`media_engine_server.js:52`, `ai_clips.js:789-790`). Limpar jobs > 1 h e temporários > 24 h.
7. Fila de render: no máximo 1 ou 2 ffmpeg ao mesmo tempo ("Gerar Top 3" já é sequencial; o resto não).
8. Dividir `ai_clips.js` (1.376 linhas) e `popup.js` (2.036) em módulos; criar `package.json` com `"test": "node js/motor_padrao/testes/rodar_testes.js"`; tirar `install_log.txt` do repositório.

---

## 4. Referência rápida do Padrão v2

Medidas em px num quadro **1080×1920**, tempos em **segundos**, cores em **#RRGGBB**. Exemplos completos em `motor_padrao/padroes/*/padrao.json`.

| Seção | Campos principais | Observação |
|---|---|---|
| `fontes` | `{ id: { arquivo, peso, italico } }` | TTF **estático** de preferência; variável é convertida |
| `legenda` | `fonte, peso, tamanho_px, cor, caixa (alta/baixa/original), centro_y, ancora (centro_bloco/centro_primeira_linha), largura_max_px, max_linhas, entrelinha, palavras_por_bloco{min,max}, max_caracteres, quebra_em_pausa_s, entrada, palavra_ativa{modo: nenhum/cor/palavra_por_palavra}, sombra{cor,opacidade,dx,dy,desfoque}, contorno, maiusculas_sempre[], nao_repetir_destaque` | `tamanho_px` = tamanho em (CapCut/PIL) |
| `destaques[]` | `id, nome, quando, posicao (linha_abaixo_da_legenda/substitui_legenda/topo), fonte, peso, tamanho_px, cor, caixa, centro_y?, espaco_px, entrada, sincronia (na_palavra/depois_da_branca), freq_por_video, tag_fundo{cor,padding_px,raio_px}` | Gaia "dourado", Marca "linha vermelha", VERSO "explosão/serifa/tag" |
| `titulo_gancho` | `ativo, fonte, tamanho_px, cor, caixa, centro_y, linha2{...,sincronia}, entrada, duracao_s{min,max}, repete_no_fim` | quebra em até 2 linhas, nunca encolhe |
| `numeros` | `ativo, posicao, fonte, tamanho_px, cor, centro_y, linha2, entrada (slam/conta_numero/…)` | `substitui_legenda` esconde a legenda |
| `logo` | `ativo, arquivo, largura_px, centro_x, centro_y, tela_cheia, acima_do_broll, variantes{}` | PNG com alfa |
| `elementos` | `regra (entra_na_fala_sai_no_corte), max_simultaneos, entrada, biblioteca[{id, arquivo, gatilhos[], largura_px, centro_x, centro_y, esconde_legenda, hold}]` | entram sozinhos pelo gatilho falado |
| `broll` | `ativo, pasta, modo (faixa_topo/tela_cheia/faixa_topo_ou_tela_cheia), faixa{y0,y1,esfumado_px}, vertical_vai_para, duracao_s{min,max}, cobertura_max_pct, nao_junto_com[], nao_repetir_entre_videos, conferir[], ia_gerada_permitida` | |
| `camera.zoom` | `modo (nenhum/no_corte_alternado/punch_in), niveis[], intervalo_min_s, lento{de,ate,dur,max_por_video}` | |
| `ritmo` | `novidade_a_cada_s{min,max}, cortar_pausas_acima_s, duracao_alvo_s{min,max}, gancho_max_s` | vira aviso no plano |
| `transicoes` | `padrao, flash{cor,quadros,max_por_video}, dissolve_s` | |
| `fechamento` | `ativo, tipo (cartela/clipe), fundo, logo, largura_px, centro_y, duracao_s, entrada, animacao` | |
| `audio` | `lufs, voz_limpa, musica{ativa,arquivo,volume,sobe_no_fim,fade_saida_s}, sfx{}` | loudnorm no fim |
| `zonas_proibidas[]` | `{nome,x0,y0,x1,y1}` | padrão: UI do Instagram (topo 0–220, base 1700–1920, direita x>960) |
| `motions_permitidos[]` / `motions_proibidos[]` | nomes do catálogo ou sinônimos | validador recusa |
| `correcoes[]` | `{data, origem, regra, campo?, valor?}` | com campo/valor: sobrescreve; vale mais que o PDF |
| `proveniencia{}` | `"campo": "pdf p.5: '…'" / "medido em ref.mp4"` | mostrado na tela de aprovação |
| `pendencias[]` | texto | aviso em todo render até resolver |

---

## 5. Erros que o agente NÃO deve repetir

1. **Nunca** passar o tamanho do padrão direto para o `Fontsize` do ASS. Use `fontsizeAss()`.
2. **Nunca** usar fonte variável no libass, nem `Bold=-1` para "engrossar". Use TTF estático do peso.
3. **Nunca** queimar legenda sem `fontsdir` apontando para a pasta com os TTF do padrão, e conferir no log `fontselect` que não caiu em Arial.
4. **Nunca** posicionar por `MarginV` em %. Use o centro (`\an5\pos`) em px.
5. **Nunca** diminuir a fonte para caber. Quebre em linhas/blocos.
6. **Nunca** inventar animação. Catálogo ou pendência.
7. **Nunca** deixar a IA escolher arquivo de B-roll fora do catálogo, nem px, cor ou duração.
8. **Nunca** cortar com `-ss … -c copy` e depois sincronizar legenda. Re-encode.
9. **Nunca** entregar sem `conferir_render.js` verde e sem dizer o que não foi conferido (áudio não é ouvido pela IA; acentos vistos por humano; escolha das cenas).
10. **Correção do editor > PDF.** Toda correção vira registro em `correcoes[]` e, se possível, regra em código.
