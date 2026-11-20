# motor_padrao: guia técnico

Motor de edição guiado por **Padrão v2**. Node puro (sem npm) + ffmpeg/ffprobe com libass.
Python só para: converter fonte variável (`pip install fonttools`) e transcrever (`pip install faster-whisper`).

## Testar
```
node testes/rodar_testes.js            # 11 testes (inclui render real, ~30 s)
node testes/rodar_testes.js --rapido   # sem render
```

## Fluxo
```
                 ┌── APRENDER (padrão novo) ───────────────────────────────────────────────┐
 PDF + quadros ─► importar_padrao.importarPadrao()  ─► fatos (Gemini, schema fechado)
 vídeo aprovado ─► ferramentas/medir_referencia.js  ─► medidas (pixels)
                                            └──► montarPadrao(): medido > PDF > descrito > inferido
                                                   └► validar_padrao.js ─► cartela_teste.js ─► usuário aprova ─► padrao.json
                 ┌── EDITAR (corte) ─────────────────────────────────────────────────────────┐
 bruto/trecho ─► transcrever_palavras.py ─► palavras [{t,e,w}]
             ─► segmentos sem pausa (ritmo.cortar_pausas_acima_s) ─► motor.remapearPalavras()
             ─► plano_ia (Gemini sugere: destaques, título, números, B-roll do catálogo)
             ─► regras.aplicarRegras() (tempos, durações, proibições, ritmo)
             ─► legenda_ass.gerarAss() ─► legenda.ass + fontes estáticas
             ─► composicao.montarComando() ─► ffmpeg (cwd = work) ─► final.mp4
             ─► ferramentas/conferir_render.js ─► ok / FALHA (+ folha de contato)
```

## Módulos

### `lib/padrao.js`
- `carregarPadrao(arquivo, {conferirArquivos})` → `{padrao, erros, avisos}`. `padrao._baseDir` = pasta do padrão (onde está `assets/`).
- `normalizar(raw)`: completa com `PADRAO_BASE` e aplica `correcoes[]` com `campo`/`valor` (a mais nova vence).
- `validar(p)`: erros (não renderiza) e avisos. Confere fonte, cores, motions (catálogo, permitidos, proibidos com sinônimos), zonas proibidas, arquivos.
- `CATALOGO_MOTION`: a lista fechada de animações. `asset(padrao, rel)`: caminho absoluto. `migrarPerfilV1(perfil)`: converte cliente antigo.

### `lib/fontes.js`
- `lerFonte(ttf)`: família, nome completo, peso, variável?, instâncias, métricas, acentos faltando, `larguraTexto(txt, emPx)`.
- `fontsizeAss(fonte, emPx)`: **tamanho do padrão → Fontsize do libass** (×(winAscent+winDescent)/unitsPerEm).
- `garantirEstatica(ttf, peso, italico)`: fonte variável → TTF estático do peso (fontTools), em cache. Copia para um caminho curto antes (Python não abre caminhos > 260 caracteres).
- `nomeParaAss(fonte, peso)`: nome que o libass casa (nome completo da estática). `calibrarLargura()`: largura real pelo próprio libass.
- `candidatosPython()`: acha o Python de verdade (o `python` do PATH no Windows costuma ser o atalho da Store).

### `lib/legenda_ass.js`
`gerarAss({padrao, palavras, duracao, cortes, destaques, titulos, numeros, ocultar, fontes?})` → `{ass, blocos, avisos, fontes}`
- `palavras`: `[{t, e, w}]` na linha do tempo **final**.
- `destaques`: `[{id, texto, perto?}]`. O texto precisa existir na fala; entra no tempo da 1ª palavra.
- `titulos` / `numeros`: `[{texto, linha2?, t0, t1}]`.
- `ocultar`: `[[t0,t1]]` sem legenda (elemento com `esconde_legenda`, número que substitui).
- `fontes` devolvido: lista dos TTF usados. **Copie todos** para a pasta do `fontsdir`.

### `lib/composicao.js`
`montarComando({padrao, fala, duracao, ass, fontsDir, zoom, broll, elementos, flashes, saida, semFechamento, semMusica})` → `{args, filtro, duracaoTotal}`
- Rodar `ffmpeg ...args` com **cwd = pasta de trabalho** (`ass` e `fontsDir` relativos: o filtro subtitles quebra com `C:\`).
- Camadas: fala(+zoom) → B-roll → logo → elementos → legenda → flash → fechamento emendado. Áudio: voz + música (opcional) + `loudnorm` no LUFS do padrão.

### `lib/regras.js`
`aplicarRegras({padrao, plano, palavras, cortes, fimFala, usadosBroll})` → `{plano, ocultarLegenda, avisos}`. Também `elementosPorGatilho()` e `zoomAutomatico()`.

### `lib/broll.js`
`catalogar(pasta, {miniaturas})`, `sugestoesParaPlano({sugestoes, catalogo, palavras, padrao})`, `lerUsados/gravarUsados`. CLI: `node lib/broll.js catalogar <pasta> catalogo.json --miniaturas mini/`.

### `lib/plano_ia.js`
`schemaPlanoGemini(padrao, catalogo)`, `promptPlano(padrao, palavras, {catalogo, foco})`, `validarPlanoIA(resp, {padrao, palavras, catalogo, duracao})`.

### `lib/importar_padrao.js`
`importarPadrao({id, nome, notas, pdfBase64, quadrosBase64, medidas, fontesArquivos, logoArquivo, callGemini})` → `{padrao, padraoNormalizado, erros, avisos, conflitos}`.
`callGemini(parts, {responseSchema, temperature})` é o da extensão. **Ajuste o `callGemini` de `ai_clips.js`** para pôr `responseSchema`/`temperature` em `generationConfig`.

### `lib/medir.js`
`quadroRGB(video, t)`, `mascara()`, `medirMascara()` (linhas com **núcleo** sem acento/cedilha), `medirLegendaVideo()`, `detectarLogo()` (pixel estático em ≥ 75% dos quadros + borda), `detectarCortes()`, `corDestaque()`.

## Ferramentas (CLI)
| Comando | Para quê |
|---|---|
| `node ferramentas/validar_padrao.js padrao.json [--sem-arquivos]` | trava antes de usar um padrão |
| `node ferramentas/medir_referencia.js ref.mp4 --fonte x.ttf --caixa alta --saida medidas.json` | números reais de um vídeo aprovado |
| `node ferramentas/cartela_teste.js padrao.json --ref ref.mp4@3.2 --saida cartela.png` | prova visual lado a lado |
| `node motor.js projeto.json` | edição completa (modelo para integrar na extensão) |
| `node ferramentas/conferir_render.js final.mp4 work/plano_final.json` | trava de entrega |
| `python ferramentas/transcrever_palavras.py bruto.mp4 palavras.json --fix fix.json` | tempo por palavra |

## Padrões incluídos
`padroes/daniel_gaia`, `marca_motors`, `toagro`, `guadalupe_leilao`, `verso`: convertidos das regras reais dos clientes (com as correções do editor). Os **assets** (logos, PNGs, fontes) não vêm junto: o caminho de origem está em `origem_assets` de cada arquivo. Copie para `padroes/<id>/assets/`. As `pendencias` dizem o que ainda falta medir.

`testes/padrao_teste` usa só Montserrat (OFL, licença junto) e PNGs gerados pelo teste.
