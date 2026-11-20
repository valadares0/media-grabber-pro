---
description: Criar o padrão de edição de um cliente novo a partir de PDF e vídeos de referência
---
1. Peça ao usuário: nome do cliente, PDF do manual, 1 a 3 vídeos **já aprovados** (arquivo ou link), TTF das fontes (estáticos, do peso usado), logo PNG com fundo transparente e observações. Não invente o que faltar.
2. Meça cada vídeo: `node js/motor_padrao/ferramentas/medir_referencia.js ref.mp4 --fonte assets/<fonte>.ttf --caixa alta|baixa --saida medidas_N.json`. Use a mediana se houver mais de um.
3. Extraia os fatos do PDF com `importarPadrao()` (`lib/importar_padrao.js`): PDF inline + `promptFatos` + `responseSchema: schemaFatosGemini()`.
4. Salve o rascunho em `~/.mediagrabber/padroes/<id>/padrao.json`, com as fontes e logos em `assets/`.
5. `validar_padrao.js` sem erros. Liste as `pendencias` para o usuário resolver.
6. `cartela_teste.js padrao.json --ref ref.mp4@<t> --saida cartela.png`: a legenda da direita tem que cair sobre a da referência (linha vermelha). Ajuste até bater.
7. Mostre a cartela + a tabela campo / valor / origem (`proveniencia`) e peça aprovação. Só então marque o padrão como aprovado. Guarde a versão anterior (`padrao.vN.json`).
8. Depois do primeiro vídeo editado com o padrão, registre cada correção do usuário em `correcoes[]` com data.
