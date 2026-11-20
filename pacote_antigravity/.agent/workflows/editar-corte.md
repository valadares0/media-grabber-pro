---
description: Editar um corte/vídeo de um cliente que já tem padrão
---
1. Carregue o padrão (`carregarPadrao`). Erro = não edite; mostre os erros. Pendências = avise.
2. Transcreva com tempo por palavra (`transcrever_palavras.py`, com o `fix` de nomes do cliente). Mostre a transcrição para correção se houver palavra com baixa confiança.
3. Corte as pausas acima de `ritmo.cortar_pausas_acima_s` com re-encode (nunca `-c copy` + `-ss`). Remapeie as palavras.
4. Peça o plano ao Gemini (`promptPlano` + `schemaPlanoGemini`), valide (`validarPlanoIA`) e aplique as regras (`aplicarRegras`). Mostre o plano e os avisos ao usuário antes do render.
5. Gere a legenda (`gerarAss`), copie as fontes usadas para `work/fontes`, monte o comando (`montarComando`) e rode com cwd = work.
6. Rode `conferir_render.js`. Reprovou = corrija ou marque "precisa revisão" com os motivos.
7. Entregue o MP4 + folha de contato + lista do que foi e do que NÃO foi conferido (áudio não ouvido, acentos vistos por humano, cenas, valores).
