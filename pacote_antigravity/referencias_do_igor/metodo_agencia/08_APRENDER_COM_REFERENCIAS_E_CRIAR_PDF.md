# 08 — Aprender um cliente com vídeos de referência e criar o PDF de treinamento

Este é o coração da plataforma. Resultado esperado de um cliente novo:

```
02_CLIENTES/<CLIENTE>/
  00_BRIEF.md                         ficha do cliente (preenchida com o usuário)
  PADRAO.md                           regras medidas, curtas, obrigatórias
  referencias_videos/FONTES.md         lista (links) dos vídeos estudados; os .mp4 ficam em PLATAFORMA_MIDIA/<CLIENTE>/
  referencias_quadros/                medidas.md + poucos quadros pequenos (JPG <200 KB)
  padrao_<x>/assets/                  logos, fontes, trilha, voz_cb.rnnn
  padrao_<x>/motor/<x>_edit.py        motor (copiado do cliente mais parecido e adaptado)
  padrao_<x>/treinamento/TREINAMENTO_VISUAL_<X>.pdf   ← o PDF-padrão
```

## Passo 0 — Criar a estrutura
```bash
python 03_FERRAMENTAS/novo_cliente.py "NOME DO CLIENTE"
python 03_FERRAMENTAS/verificar_ambiente.py
```
Preencha `00_BRIEF.md` **perguntando ao usuário** (marca, tom, cores, fontes, logos, proibições, quem aprova). Não preencha com suposição.

## Passo 1 — Coletar referências (o que o cliente JÁ publica e o que o usuário aprova)
Quanto melhor a referência, melhor o padrão. Peça ao usuário, nesta ordem de valor:
1. **Vídeos já editados e aprovados** do cliente (5–10, de formatos diferentes: fala, story, card). São a verdade.
2. **Perfil do Instagram** (link) para ver o feed, cards e consistência.
3. **Logos/fontes/manual de marca** oficiais.
4. **Referências de estilo** que ele quer (Pinterest, YouTube, outro perfil) — fonte secundária; o que o cliente já publica vence se conflitar.
5. **Correções anteriores** (vídeo rascunho × versão final do editor) — ouro puro: mostram o que a IA errou.

Baixar:
```bash
python 03_FERRAMENTAS/baixar_referencias.py NOME_DA_PASTA "https://..." "https://..."
```
Se falhar (login), **peça o arquivo ao usuário** e salve em `PLATAFORMA_MIDIA/<CLIENTE>/referencias_videos/` (fora da plataforma, que é leve). Não peça senha. Registre a origem de cada vídeo em `FONTES.md`.

## Passo 2 — Ver cada referência (quadros, não adjetivos)
Para cada vídeo:
```bash
python 03_FERRAMENTAS/extrair_quadros.py info   <video>
python 03_FERRAMENTAS/extrair_quadros.py folha  <video> referencias_quadros/<nome> --cada 1.5
python 03_FERRAMENTAS/extrair_quadros.py quadros <video> referencias_quadros/<nome> --em 0.5 3 8 14
python 03_FERRAMENTAS/extrair_quadros.py tira   <video> referencias_quadros/<nome> --de 4.0 --ate 4.6   # animações
```
**Abra as imagens** (ferramenta de leitura de imagem) e descreva o que vê: onde está a legenda, que fonte parece, quando entra o logo, que cor, como entra cada elemento.

## Passo 3 — Medir (transformar impressão em número)
Trabalhe em quadros 1080×1920 (reescale se o vídeo vier 720×1280 — multiplique as medidas).
1. **Legenda:** `medir_elemento.py quadro.png --cor FFFFFF --regiao 90 1250 990 1550`. Registre: caixa, centro y, altura da letra → tamanho da fonte (≈ altura de caixa-alta ÷ 0,72), nº de linhas, largura máxima, nº de palavras por bloco (conte em 10+ blocos).
2. **Fonte:** compare o glifo com candidatas (Montserrat, Cal Sans, Playfair…). Renderize a mesma frase em 3 candidatas com PIL e coloque lado a lado (o PDF de Gaia/Marca tem `fonttest.jpg` desse teste). Confirme com o usuário/arquivos da marca quando houver.
3. **Cores:** amostre pixels (`PIL.Image.getpixel`) de logo, palavra de destaque, fundo do fechamento; anote hex.
4. **Logo:** posição (centro x,y), largura em px, versão (branca/colorida), se fica o vídeo todo.
5. **Sombra/contorno/caixa:** zoom (recorte 4×) em uma letra.
6. **Tempos:** use transcrição com palavras (`transcrever_exemplo.py`) + quadros para saber **quanto antes/depois da fala** o elemento entra; duração de cada animação (conte quadros na tira 15 qps ÷ 15).
7. **Ritmo:** tempo médio entre trocas visuais (cortes, B-roll, elementos) — conte em 20–30 s de vídeo.
8. **Estrutura:** gancho (o que acontece nos 3 s), desenvolvimento, chamada, fechamento; duração total.
9. **B-roll:** tipos usados, duração média, posição (tela cheia × faixa), tratamento (cantos, desfoque).
10. **Áudio:** trilha? volume relativo? efeitos sonoros? (você mede espectro/loudness; não "ouve").

Anote tudo numa tabela em `referencias_quadros/medidas.md` (vídeo, tempo, elemento, valor medido, confiança). **Medida divergente entre vídeos → pergunte qual vale ou use a mediana e avise.**

## Passo 4 — Escrever o `PADRAO.md` (resumo obrigatório, curto)
Modelo de seções (copie de `02_CLIENTES/DANIEL_GAIA/PADRAO.md`):
1. Legendas (fonte, peso, tamanho, caixa, cor, y, largura, palavras/bloco, sombra, proibições)
2. Logo e fechamento
3. Cores (hex e onde usar)
4. Gancho e retenção
5. Estrutura e edição (duração, planos, transições, zoom, cor, áudio)
6. B-roll
7. Animações na tela (categorias, tempos, proibidas)
8. Cards/estáticos (se houver)
9. Correções do editor (vazia no início — preencha ao longo do tempo)
10. Antes de entregar (aponta para o checklist do PDF)

Regra de ouro: **cada linha com número ou verbo mensurável**; nada de "elegante", "moderno".

## Passo 5 — Montar o PDF de treinamento (anatomia padrão)
Todos os PDFs dos 4 clientes seguem a mesma sequência (páginas 1280×720, 15–16 páginas). Reproduza:

| Pág. | Seção | Conteúdo |
|---|---|---|
| 1 | Capa | logo, título "Treinamento visual <Cliente>", subtítulo |
| 2 | 01 · Essência | como o cliente aparece: tom, o que nunca fazer, 3–4 quadros típicos |
| 3 | 02 · Logo | versões, posição no Reels, assinatura/fechamento, o que nunca fazer |
| 4 | 03 · Cores | paleta com hex e uso |
| 5 | 04 · Tipografia | fonte(s), pesos, amostra com o texto real do cliente |
| 6 | 05 · Legenda e espaços | **quadro 1080×1920 anotado** com medidas (y, tamanho, margens, zona proibida) |
| 7 | 06 · Variações | destaque/impacto, número, story, preço, selo... |
| 8 | 07 · Animações | como cada coisa entra, **tiras quadro a quadro** |
| 9 | 08 · Elementos / B-roll / estrutura | quando entra, onde, quanto dura |
| 10 | 09 · Estrutura e ritmo | linha do tempo de um vídeo típico, do gancho à assinatura |
| 11–12 | 10 · Referências | folhas de contato dos vídeos já publicados/aprovados, com anotações |
| 13 | 11 · B-roll | banco de B-roll: o que filmar/usar |
| 14 | 12 · Formatos / cards / recursos especiais | 9:16 principal; 16:9 e 1:1; cards |
| 15 | 13 · CapCut / animações na tela | como finalizar no CapCut (se aplicável) |
| 16 | 14 · Antes de entregar | checklist do editor |

**Como gerar:**
- Rápido (genérico): edite `padrao_<x>/treinamento/spec_pdf.json` e rode
  `python 03_FERRAMENTAS/montar_pdf.py 02_CLIENTES/<C>/padrao_<x>/treinamento/spec_pdf.json`. Tipos de página: capa, texto, paleta, tabela, galeria, checklist. Imagens anotadas (setas, medidas) você cria com PIL antes e referencia no spec.
- Sob medida (como os PDFs dos clientes anteriores): consulte `02_CLIENTES/DANIEL_GAIA/padrao_gaia/treinamento/_work_leve/montar.py` (só o código; as imagens que ele usa não estão aqui) e adapte. Ele desenha quadros anotados com PIL, escreve o HTML e imprime o PDF com Edge headless.
- **Depois de gerar:** converta 3–4 páginas em imagem (`pymupdf` → `page.get_pixmap(dpi=90)`) e **olhe** (texto cortado? imagem fora do lugar? acento?). Corrija e gere de novo. Mostre ao usuário.

## Passo 6 — Montar o motor
1. Escolha o motor mais parecido: caixa alta + destaque + B-roll topo → `gaia_edit.py`; legenda minúscula + logo fixa → `motores_referencia/toagro_edit.py`; elementos PNG + máquina de escrever → `motores_referencia/marca_edit.py`.
2. Copie para `padrao_<x>/motor/<x>_edit.py`, troque as constantes do topo pelas **medidas do cliente** (tamanho, y, cores, fonte, logo) e ajuste fechamento/animações.
3. Teste com um vídeo curto; compare o quadro gerado com o quadro de referência **lado a lado** (mesmo tempo, mesma posição). Itere até bater.
4. Documente os campos do `projeto.json` na docstring.

## Passo 7 — Validar com o usuário
Entregue: PDF + `PADRAO.md` + um vídeo-teste + folha de contato comparando com a referência. Peça correções e **escreva-as** em "Correções do editor". Só depois considere o cliente "treinado".

## Passo 8 — Registrar a skill (opcional, por ferramenta)
- Claude Code: `~/.claude/skills/<cliente>-edicao/SKILL.md` (frontmatter `name` + `description` com "Use SEMPRE que o pedido for editar vídeo do <Cliente>").
- Antigravity/Gemini/outros: não precisa; `AGENTS.md` já aponta para `PADRAO.md`. Se a ferramenta tiver "rules/workflows", copie o conteúdo de `.agent/`.
- Atualize `02_CLIENTES/LEIA-ME.md` (tabela de clientes).

## Armadilhas aprendidas ao treinar clientes
- Primeiro "Aprovado" pode virar "ruim" no dia seguinte (aconteceu com um cliente): trate o primeiro padrão como **base**, não final, até o usuário confirmar em mais de um vídeo.
- Descrever estilo com adjetivos não funciona; só medidas funcionam.
- Referência de Pinterest/YouTube pode conflitar com o que o cliente publica: pergunte qual vale em cada trecho.
- Vídeos publicados no Instagram vêm comprimidos/720p: meça em proporção.
- Nome de arquivo do cliente com acento do Mac (NFD) quebra caminhos: normalize.
- Quadros de referência com texto de terceiros/marca d'água: não copie.
