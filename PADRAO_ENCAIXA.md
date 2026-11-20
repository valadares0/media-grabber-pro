# Padrão Oficial: Encaixa (Corporativo B2B)

Motor responsável: `scripts/encaixa_pil_render.py` + `scripts/smart_reframe.py` + `js/ai_clips.js` (`style: "encaixa"`).

## Regras Visuais Aprovadas
1. **Tipografia Tripla (`assets/fonts/`)**:
   - Conectores / preposições: `Poppins Light` (44px @ 1080w), branco.
   - Âncoras estruturais e números de referência (ex.: `Lucas 21,`): `Poppins ExtraBold` (100px @ 1080w), branco.
   - Palavras de impacto / destaque: `Playfair Display Bold Italic` (110px no gancho, 74px no complemento, 64px no corpo), laranja corporativo (`#E85D04`) ou branco.
2. **Animações**:
   - Verbos de escrita (`escrito`, `anota`, `leia`): **efeito datilografia letra a letra** (sem tarja riscada).
   - Demais âncoras: *wipe* horizontal + *blur-to-sharp*.
   - Frase complementar: *slide-up* suave.
3. **Alinhamento e Quebra de Frase**:
   - Linha de base comum via `font.getmetrics()` (nenhuma palavra sobe ou desce em fontes mistas).
   - Números de capítulo/referência ficam juntos da palavra anterior no mesmo bloco (`Lucas 21, versículo 28.`).
   - Proibido terminar frase com artigo/preposição solto (`a`, `o`, `de`, `que`, `para`, `com`) — joga para o bloco seguinte.
   - Máximo de **1 palavra em laranja** por linha no corpo.
4. **Enquadramento (`smart_reframe.py`)**:
   - Centraliza o rosto em cada corte de câmera; alterna para `fit_blur` quando a cena é um slide sem rosto; divide tela (1 em cima / 1 embaixo) apenas em planos de podcast com 2 pessoas lado a lado.
5. **Renderização Rápida**:
   - Gera apenas PNGs das transições + `overlay.ffconcat` direto no FFmpeg (sem intermediário `.mov`).

## Workflow Econômico em Lote (5–10 Vídeos)
- **Com minutagem pronta**: chama `/api/ai/render` direto (`style: "encaixa"`) — **0 tokens do Gemini** e **0 tokens de análise**.
- **Sem minutagem**: chama `/api/ai/analyze` 1 vez por vídeo e dispara `/api/ai/render` em paralelo/fila para os cortes aprovados.
