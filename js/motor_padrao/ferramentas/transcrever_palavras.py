"""Transcreve com tempo POR PALAVRA (faster-whisper, local e gratuito) -> palavras.json [{t, e, w}].

Por que: a legenda automática do YouTube (json3) dá tempo aproximado por palavra
(o motor antigo ainda espalhava palavras a cada 0,05 s) e não existe para arquivo
local. Legenda fora de sincronia começa aqui. O Whisper com word_timestamps dá o
tempo real de cada palavra.

Uso:
  python transcrever_palavras.py <video_ou_audio> <saida.json> [--modelo large-v3-turbo] [--fix fix.json] [--inicio 120 --fim 180]

  --fix: {"errado": "certo"} para nomes próprios do cliente (ex.: {"Gaya": "Gaia", "EB leilão": "EB Leilões"})
  --inicio/--fim: transcreve só um trecho (segundos do arquivo original); os tempos saem no tempo do arquivo.

Requisitos: pip install faster-whisper   (e ffmpeg no PATH)
A extensão chama este script pelo motor (spawn) quando não há legenda do YouTube ou quando o vídeo é local.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile


def extrair_wav(origem, destino, inicio=None, fim=None):
    # WAV 16 kHz mono antes: o "av" do faster-whisper às vezes não abre MP4/MOV do iPhone direto
    cmd = ["ffmpeg", "-v", "error", "-y"]
    if inicio is not None:
        cmd += ["-ss", str(inicio)]
    cmd += ["-i", origem]
    if fim is not None:
        cmd += ["-t", str(float(fim) - float(inicio or 0))]
    cmd += ["-vn", "-ac", "1", "-ar", "16000", destino]
    subprocess.run(cmd, check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("entrada")
    ap.add_argument("saida")
    ap.add_argument("--modelo", default="large-v3-turbo")
    ap.add_argument("--idioma", default="pt")
    ap.add_argument("--fix")
    ap.add_argument("--inicio", type=float)
    ap.add_argument("--fim", type=float)
    ap.add_argument("--dispositivo", default="auto", help="auto | cpu | cuda")
    a = ap.parse_args()

    from faster_whisper import WhisperModel

    fix = {}
    if a.fix and os.path.exists(a.fix):
        with open(a.fix, encoding="utf-8") as f:
            fix = json.load(f)

    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, "audio.wav")
        extrair_wav(a.entrada, wav, a.inicio, a.fim)
        tipo = "int8" if a.dispositivo in ("auto", "cpu") else "float16"
        modelo = WhisperModel(a.modelo, device=a.dispositivo, compute_type=tipo)
        segs, info = modelo.transcribe(
            wav, language=a.idioma, word_timestamps=True, vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 300}, condition_on_previous_text=False,
        )
        base = a.inicio or 0.0
        palavras = []
        for s in segs:
            for w in s.words or []:
                txt = w.word.strip()
                if not txt:
                    continue
                for errado, certo in fix.items():
                    if txt.strip(".,!?;:").lower() == errado.lower():
                        txt = txt.replace(txt.strip(".,!?;:"), certo)
                palavras.append({"t": round(base + w.start, 3), "e": round(base + w.end, 3), "w": txt, "p": round(w.probability, 3)})

    with open(a.saida, "w", encoding="utf-8") as f:
        json.dump(palavras, f, ensure_ascii=False, indent=1)
    baixas = [p["w"] for p in palavras if p["p"] < 0.5]
    print(f"{len(palavras)} palavras -> {a.saida} (idioma {info.language}, {info.duration:.1f}s)")
    if baixas:
        print(f"palavras com baixa confiança (conferir nomes): {' '.join(baixas[:30])}")


if __name__ == "__main__":
    sys.exit(main())
