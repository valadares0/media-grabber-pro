# 07 — Limitações (leia antes de prometer)

## O que a IA NÃO consegue / não deve fazer
1. **Ouvir áudio.** Você lê transcrição, vê quadros e mede espectro/loudness; não julga música, sincronia fina ou dicção. Diga "áudio não ouvido".
2. **Assistir vídeo contínuo.** Trabalha por quadros e tiras. Animações são entendidas por tiras quadro a quadro (`extrair_quadros.py tira`).
3. **Baixar qualquer referência.** Instagram/perfil privado normalmente exige login. O usuário **não quer criar contas nem dar senha**: se `baixar_referencias.py` falhar, peça o arquivo.
4. **Enviar para o cliente, publicar, postar.** Só o usuário.
5. **Inventar preço/data/nome.** Pergunte.
6. **Criar conta, digitar senha, usar API paga sem o usuário.** O usuário prefere ferramentas locais e gratuitas (Whisper local, ffmpeg, Python).
7. **Usar imagem gerada por IA como B-roll** (cliente real). Pode gerar fundo/cenário para **motion** aprovado, nunca como "prova" de fazenda/carro.
8. **Fechar o CapCut à força.** Registrar rascunho exige CapCut fechado: peça ao usuário.

## Limitações técnicas conhecidas
- **Windows e Mac.** Os scripts usam `pathlib` e rodam nos dois, mas: o CapCut guarda rascunhos em pastas diferentes (Windows: `%LOCALAPPDATA%\CapCut\User Data\Projects\com.lveditor.draft`; Mac: confirme com o usuário, costuma ser `~/Movies/CapCut/User Data/Projects/com.lveditor.draft`) — ajuste `DRAFTS` no topo dos exportadores. Fontes: use os TTF de `assets/` (os motores carregam o arquivo direto). `libplacebo` (HDR do iPhone) precisa de ffmpeg com Vulkan; no Mac pode faltar — então converta o HDR antes ou avise o usuário.
- **Motores independentes por cliente.** Há 4 `*_edit.py` com partes duplicadas; correção num não propaga. Unificação = `05_PLATAFORMA/ROADMAP.md`.
- **Os motores de Toagro, Marca e Leilão ficam só como referência** (`03_FERRAMENTAS/motores_referencia/`); dependem de assets que não estão nesta pasta. O Leilão nunca teve motor de fala próprio.
- **Os exportadores de rascunho CapCut dependem de rascunhos-modelo que moram no CapCut do usuário, não nesta pasta:** `gaia_capcut.py` lê o rascunho "erros ao gravar"; `montar_capcut*.py` (Toagro, só referência) leem "toagro - pedro" e "0120 (1)". Se o CapCut for outro computador/instalação sem esses rascunhos, esses scripts não rodam. Alternativa que não depende deles: o **pacote de arquivos soltos** (ver `04_CAPCUT/LEIA-ME.md`, forma A; código de referência em `03_FERRAMENTAS/motores_referencia/marca_edit.py`, função `export_capcut`). `04_CAPCUT/scripts_toagro/capcut_modelo.json` é um instantâneo guardado de objetos-modelo (não é lido pelos scripts hoje) e pode servir para reconstruir os modelos.
- **CapCut guarda caminhos de mídia criptografados** depois de abrir; nunca "remende" um rascunho salvo, regenere pelo script.
- **Lettering na cabeça** (`estilos_agencia/ESTILO_LETTERING_CABECA.md`) exige macOS (Vision + swiftc). No Windows: usar segmentação alternativa (ex.: rembg/mediapipe) — não testado.
- **Kit da agência `~/agents/video`** (reel_lib, conferir_reel) foi criado para outro ambiente; só os arquivos .py/.md foram copiados, não as mídias (56 MB). Podem faltar dependências (HyperFrames, Vision).
- **Brutos, B-rolls e referências .mp4 não estão nesta pasta de propósito** (ela é leve para sincronizar). Ficam em `PLATAFORMA_MIDIA/` em cada computador.
- **HDR:** `libplacebo` precisa de GPU/Vulkan; sem ele a cor do iPhone sai errada.
- **Edge headless grava o PDF de forma assíncrona**: espere o arquivo existir antes de abrir.
- **Nomes de arquivo com acento do Mac (NFD)** não casam com o texto digitado; o motor Marca normaliza, os outros não.

## Pessoas e decisões que a IA não toma
- Estilo novo, mudança de marca, escolha de música, aprovação final → usuário.
- Conflito entre PDF e pedido do dia → pergunte; na dúvida vale a correção mais recente registrada.
