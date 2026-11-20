# Arquitetura da plataforma (como as peças se encaixam)

```
                 ┌──────────────────────────── APRENDER (cliente novo) ────────────────────────────┐
 referências ──► baixar_referencias.py ─► extrair_quadros.py ─► medir_elemento.py ─► PADRAO.md
 (vídeos, feed,                                                                       │
  logos, fontes)                                           montar_pdf.py / montar.py ─┴► PDF de treinamento
                                                                                      │
                 ┌───────────────────────────── EDITAR (cliente com padrão) ───────────┴────────────┐
 bruto ► (HDR→SDR, rotação) ► transcrever (faster-whisper) ► decupagem ► projeto.json ► MOTOR do cliente
                                                                                           │
          MP4 final ◄── folha de contato / stills (conferir) ◄──────────────────────────────┤
              │                                                                            └► pacote/rascunho CapCut (04_CAPCUT)
              ▼
        EDITOR.html (gerar_editor.py) ─► usuário marca palpites/edita ─► aplicar_montagem.py + IA aplica texto ─► regra nova no PADRAO.md
```

## Componentes
| Camada | Arquivos | Função |
|---|---|---|
| Conhecimento | `01_METODO/*`, `02_CLIENTES/*/PADRAO.md`, PDFs, `07_MEMORIA/*` | regras e lições; a IA lê antes de agir |
| Referências | `referencias_videos/`, `padrao_x/treinamento/_work/*`, `referencia/` | exemplos visuais medidos |
| Percepção | `extrair_quadros.py`, `medir_elemento.py`, faster-whisper, librosa | "ver" quadros, medir px, transcrever, achar batidas |
| Motores | `padrao_x/motor/*_edit.py` | `projeto.json` → MP4 (ffmpeg + PIL + numpy) |
| Regras automáticas | `gaia_regras.py` | aplica correções aprendidas sem a IA lembrar |
| Revisão | `gerar_editor.py`, `EDITOR.html`, `aplicar_montagem.py` | ciclo de correção do usuário |
| Exportação | `gaia_capcut.py`, `motores_referencia/marca_edit.py --capcut`, `04_CAPCUT/scripts_toagro/*` | CapCut |
| Geração de PDF | `montar_pdf.py` (genérico), `_work/montar.py` (sob medida) | PDF de treinamento |
| Onboarding | `novo_cliente.py`, `verificar_ambiente.py` | criar cliente, checar PC |

## Contrato do motor (o que todo `*_edit.py` faz)
Entrada: `projeto.json` com `src_dir`, `out`, `work`, `segments`, e campos do cliente. Saída: MP4 1080×1920 30 fps + cache em `work/`. Internamente: (1) cortes e cor (ffmpeg, libplacebo se HDR) → (2) voz limpa (`arnndn` com `voz_cb.rnnn`) → (3) camadas de legenda/logo/elementos desenhadas com PIL como PNGs/quadros e compostas por ffmpeg → (4) mix de áudio e −14 LUFS → (5) fechamento. Convenção: `HERE.parent` = `padrao_x`; `CLIENTE = padrao_x.parent`.

## Decisões de projeto (por quê)
- **Desenho com PIL em vez de filtros do ffmpeg**: controle total de tipografia, sombras, acentos e animações.
- **JSON declarativo**: a IA descreve o vídeo; o motor garante o padrão. Corrigir = mudar JSON/constante, não reescrever.
- **Padrão no repositório, não na cabeça da IA**: toda correção do usuário vira texto em `PADRAO.md`.
- **Local e gratuito**: sem contas, sem API paga.
