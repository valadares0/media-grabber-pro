# Pacote para o Antigravity: melhorias do Media Grabber Pro

## Como usar (3 passos)
1. Copie esta pasta inteira (`pacote_antigravity`) para dentro de `media-grabber-extension/`.
2. Copie a pasta `.agent/` daqui para a **raiz** de `media-grabber-extension/`: são as regras e os fluxos que o Antigravity lê sozinho. Se já existir uma `.agent/`, junte os arquivos.
3. Abra `PROMPT_PARA_ANTIGRAVITY.md`, copie o texto e cole no Antigravity.

## O que tem aqui
| Arquivo / pasta | Para quê |
|---|---|
| `PROMPT_PARA_ANTIGRAVITY.md` | o texto para colar |
| `PLANO_DE_MELHORIAS.md` | o documento detalhado: diagnóstico com provas, 10 fases com critério de pronto, todos os bugs com arquivo:linha |
| `motor_padrao/` | código novo e testado (11 testes) que resolve legenda, fonte, padrão, motion, B-roll, importação de PDF e conferência |
| `motor_padrao/padroes/` | 5 padrões reais já no formato novo: Daniel Gaia, Marca Motors, Toagro, Leilão Guadalupe e VERSO |
| `.agent/` | regras e fluxos para o Antigravity (`rules/`, `workflows/`) |
| `referencias_do_igor/` | as regras de edição dos clientes e o método da agência, para o agente entender o que é um padrão "de verdade" |

## Para conferir que funciona no PC onde o Antigravity roda
```
node pacote_antigravity/motor_padrao/testes/rodar_testes.js
```
Precisa: Node 18+, ffmpeg com libass no PATH e Python com `pip install fonttools` (para a Montserrat variável dos clientes).
Resultado esperado: `pass 11`, `fail 0`.

## Observações
- Os caminhos dentro de `referencias_do_igor/` (Desktop\CLENTES\...) são do PC do Igor. Em outro computador, servem como leitura, não como caminho válido.
- Os logos e PNGs dos clientes **não** vêm no pacote (são do cliente). Cada `padrao.json` diz de onde copiar (`origem_assets`).
