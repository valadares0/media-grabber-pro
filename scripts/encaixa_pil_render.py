import sys
import os
import json
import math
import subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS_DIR = os.path.abspath(os.path.join(HERE, "..", "assets", "fonts"))

STOPWORDS = {
    "um", "uma", "uns", "umas", "o", "a", "os", "as", "no", "na", "nos", "nas",
    "do", "da", "dos", "das", "de", "em", "para", "pra", "por", "com", "sem",
    "que", "se", "e", "ou", "mas", "ao", "aos", "à", "às", "seu", "sua", "seus",
    "suas", "meu", "minha", "nosso", "nossa", "pode", "vai", "é", "são", "ter",
    "esse", "essa", "isso", "este", "esta", "isto", "num", "numa", "pelo", "pela",
    "até", "ate", "estas", "estes", "essas", "esses"
}

DANGLING_END_WORDS = {
    "a", "o", "as", "os", "e", "de", "da", "do", "das", "dos", "em", "no", "na",
    "que", "para", "pra", "por", "com", "sem", "um", "uma", "seu", "sua", "ao"
}

TYPEWRITER_KEYWORDS = {"escrito", "escrita", "escrever", "escreveu", "anota", "leia"}

AUX_VERBS = {
    "está", "estão", "estamos", "estaremos", "estava", "estavam", "ser", "sendo",
    "foi", "foram", "era", "eram", "ter", "tendo", "tem", "têm", "tinha",
    "fazer", "fazendo", "fez", "faz", "dizer", "dizendo", "disse", "falar",
    "falando", "falou", "poder", "podemos", "pode", "querer", "queremos",
    "ir", "indo", "vai", "vamos", "vir", "vindo", "ver", "vendo", "olha",
    "olhem", "ficar", "ficou", "passar", "passaram", "chegar", "chegaram",
    "precisa", "precisamos", "devemos", "deve", "chamado"
}

HIGHLIGHT_KEYWORDS = {
    "mercadoria", "segurança", "resultado", "lucro", "sucesso", "valor", "risco",
    "redenção", "céus", "venha", "olhem", "cabeça", "honra", "desonra", "cultura",
    "geração", "respeito", "deus", "reino", "líder", "proteção", "maturidade",
    "sagrado", "sagradas", "descartável", "verdade", "propósito", "família",
    "futuro", "coragem", "vida", "espiritual", "reverência", "relacionamentos",
    "crítica", "exposição", "divisão", "rebeldia", "encobrir", "cobriram", "nudez"
}

ORANGE = (232, 93, 4, 255)      # #E85D04
WHITE = (255, 255, 255, 255)
OFF_WHITE = (245, 245, 245, 255)


def clean_word(w):
    return w.lower().strip(".,!?;:()\"'«»—–-")


def pick_highlight_index(texts):
    """Escolhe automaticamente a melhor palavra-chave de destaque em qualquer frase."""
    for i, w in enumerate(texts):
        if clean_word(w) in HIGHLIGHT_KEYWORDS:
            return i
    best_i, best_sc = -1, -1
    for i, w in enumerate(texts):
        cw = clean_word(w)
        if not cw or cw in STOPWORDS or cw in AUX_VERBS or len(cw) < 5:
            continue
        score = len(cw) + (3 if any(c in cw for c in "áéíóúâêôãõç") else 0)
        if score > best_sc:
            best_sc = score
            best_i = i
    return best_i


def ease_out_cubic(x):
    x = max(0.0, min(1.0, x))
    return 1.0 - (1.0 - x) ** 3


def load_font(name, size):
    return ImageFont.truetype(os.path.join(FONTS_DIR, name), size)


def measure_text(draw, text, font):
    if not text:
        return (0, 0, 0, 0)
    return draw.textbbox((0, 0), text, font=font)


def draw_text_with_shadow(base_img, xy, text, font, fill, alpha=1.0, blur_px=0.0, shadow_alpha=175):
    if alpha <= 0.01 or not text:
        return
    x, y = int(round(xy[0])), int(round(xy[1]))
    layer = Image.new("RGBA", base_img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.text((x + 2, y + 3), text, font=font, fill=(0, 0, 0, int(shadow_alpha * alpha)))
    layer = layer.filter(ImageFilter.GaussianBlur(radius=4.0))

    txt_layer = Image.new("RGBA", base_img.size, (0, 0, 0, 0))
    td = ImageDraw.Draw(txt_layer)
    stroke_col = (0, 0, 0, int(170 * alpha))
    td.text((x, y), text, font=font, fill=(fill[0], fill[1], fill[2], int(fill[3] * alpha)), stroke_width=2, stroke_fill=stroke_col)
    if blur_px > 0.25:
        txt_layer = txt_layer.filter(ImageFilter.GaussianBlur(radius=blur_px))

    base_img.alpha_composite(layer)
    base_img.alpha_composite(txt_layer)


def group_into_beats(words, clip_start, clip_end):
    ws = [w for w in words if w["t"] >= clip_start - 0.05 and w["t"] < clip_end]
    beats = []
    cur = []
    i = 0
    while i < len(ws):
        w = ws[i]
        cur.append(w)
        nxt = ws[i + 1] if i + 1 < len(ws) else None
        gap = (nxt["t"] - (w.get("e") or w["t"] + 0.35)) if nxt else 99.0
        has_punct = w["w"].strip()[-1:] in ".,!?;:"
        cw = clean_word(w["w"])

        # Mantém referências juntas (ex: "Lucas 21, versículo 28.")
        is_ref_num = nxt and (clean_word(nxt["w"]).isdigit() or clean_word(nxt["w"]) in ("versículo", "versiculo", "capítulo", "capitulo"))
        should_cut = (not is_ref_num) and (len(cur) >= 5 or (len(cur) >= 2 and (has_punct or gap > 0.32)) or not nxt)

        if should_cut:
            # Nunca deixa uma frase terminar pendurada com artigo/preposição ("a", "o", "de", "que"...)
            if nxt and len(cur) >= 3 and clean_word(cur[-1]["w"]) in DANGLING_END_WORDS and not has_punct:
                dangling = cur.pop()
                beats.append(cur)
                cur = [dangling]
            else:
                beats.append(cur)
                cur = []
        i += 1
    if cur:
        beats.append(cur)
    return beats


def build_timeline(words, clip_start, clip_end):
    dur = max(1.0, clip_end - clip_start)
    beats = group_into_beats(words, clip_start, clip_end)
    timeline = []
    last_idx = len(beats) - 1
    last_staggered_t = -99.0

    for idx, beat in enumerate(beats):
        s = max(0.0, beat[0]["t"] - clip_start)
        nxt = beats[idx + 1] if idx + 1 < len(beats) else None
        raw_end = (nxt[0]["t"] - clip_start) if nxt else ((beat[-1].get("e") or beat[-1]["t"] + 0.8) - clip_start)
        e = min(dur, max(s + 0.35, raw_end))
        if e <= s:
            continue

        texts = [w["w"].strip() for w in beat if w["w"].strip()]
        if not texts:
            continue

        if idx == 0:
            timeline.append({"kind": "staggered", "s": s, "e": e, "texts": texts, "y_frac": 0.22 if len(texts) <= 2 else 0.72})
            last_staggered_t = s
        elif idx <= 2 and s < 5.0:
            timeline.append({"kind": "staggered", "s": s, "e": e, "texts": texts, "y_frac": 0.73})
            last_staggered_t = s
        elif idx == last_idx and dur > 10.0 and len(texts) >= 2 and (e - s) >= 1.1:
            timeline.append({"kind": "staggered", "s": s, "e": e, "texts": texts, "y_frac": 0.73})
            last_staggered_t = s
        elif (s - last_staggered_t) >= 8.5 and 2 <= len(texts) <= 4 and (e - s) >= 1.1 and (dur - e) > 2.5:
            timeline.append({"kind": "staggered", "s": s, "e": e, "texts": texts, "y_frac": 0.73})
            last_staggered_t = s
        else:
            timeline.append({"kind": "body", "s": s, "e": e, "texts": texts})

    return timeline


class EncaixaRenderer:
    def __init__(self, W=1080, H=1920):
        self.W = W
        self.H = H
        sc = W / 1080.0
        self.sc = sc
        self.f_light = load_font("Poppins-Light.ttf", max(18, int(44 * sc)))
        self.f_regular = load_font("Poppins-Regular.ttf", max(22, int(60 * sc)))
        self.f_bold = load_font("Poppins-ExtraBold.ttf", max(28, int(100 * sc)))
        self.f_serif = load_font("PlayfairDisplay-BoldItalic.ttf", max(30, int(110 * sc)))
        self.f_serif_md = load_font("PlayfairDisplay-BoldItalic.ttf", max(24, int(74 * sc)))
        self.f_serif_sm = load_font("PlayfairDisplay-BoldItalic.ttf", max(22, int(64 * sc)))
        self._dummy = ImageDraw.Draw(Image.new("RGBA", (10, 10)))

    def is_static_at(self, ev, t):
        dt = t - ev["s"]
        rem = ev["e"] - t
        if ev["kind"] == "staggered":
            return dt > 0.72 and rem > 0.16
        return dt > 0.16 and rem > 0.12

    def render_staggered(self, ev, t):
        W, H, sc = self.W, self.H, self.sc
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        s, e = ev["s"], ev["e"]
        dt = t - s
        rem = e - t
        dur = max(0.3, e - s)

        fade_in = ease_out_cubic(dt / 0.15)
        fade_out = ease_out_cubic(rem / 0.14) if rem < 0.14 else 1.0
        alpha_all = min(fade_in, fade_out)

        texts = ev["texts"]

        # Se tiver "Lucas 21," agrupa os dois como âncora única para o 21 ficar do mesmo tamanho que Lucas
        anchor_start = 0
        anchor_end = 1
        found = False
        for i, w in enumerate(texts):
            cw = clean_word(w)
            if cw in TYPEWRITER_KEYWORDS or cw in HIGHLIGHT_KEYWORDS:
                anchor_start, anchor_end = i, i + 1
                found = True
                break
        if not found:
            # Se for nome + número ("Lucas 21,")
            if len(texts) >= 2 and clean_word(texts[1]).isdigit():
                anchor_start, anchor_end = 0, 2
            else:
                best_i, best_sc = 0, -1
                for i, w in enumerate(texts):
                    cw = clean_word(w)
                    score = (0 if cw in STOPWORDS else 10) + len(cw)
                    if score > best_sc:
                        best_sc = score
                        best_i = i
                anchor_start, anchor_end = best_i, best_i + 1

        pre_words = texts[:anchor_start]
        anchor_word = " ".join(texts[anchor_start:anchor_end])
        post_words = texts[anchor_end:]

        cw_anchor = clean_word(anchor_word)
        is_typewriter = any(clean_word(x) in TYPEWRITER_KEYWORDS for x in texts[anchor_start:anchor_end])
        is_hi = any(clean_word(x) in HIGHLIGHT_KEYWORDS for x in texts[anchor_start:anchor_end])

        use_serif = is_typewriter or is_hi or (len(cw_anchor) >= 8 and not any(c.isdigit() for c in anchor_word))
        anchor_font = self.f_serif if use_serif else self.f_bold
        anchor_color = ORANGE if is_hi else WHITE

        ax0, ay0, ax1, ay1 = measure_text(self._dummy, anchor_word, anchor_font)
        aw, ah = ax1 - ax0, ay1 - ay0
        center_x = W // 2
        anchor_draw_x = center_x - aw // 2 - ax0
        anchor_center_y = int(H * ev["y_frac"])
        anchor_draw_y = anchor_center_y - ah // 2 - ay0

        box_x1 = anchor_draw_x + ax0
        box_y1 = anchor_draw_y + ay0
        box_x2 = box_x1 + aw
        box_y2 = box_y1 + ah

        # 1) Conector superior esquerdo
        if pre_words:
            pre_txt = " ".join(pre_words)
            px0, py0, px1, py1 = measure_text(self._dummy, pre_txt, self.f_light)
            ph = py1 - py0
            pre_x = max(int(48 * sc), box_x1 - int(18 * sc)) - px0
            pre_y = box_y1 - ph - int(14 * sc) - py0
            blur_pre = max(0.0, 4.0 * (1.0 - ease_out_cubic(dt / 0.16)))
            draw_text_with_shadow(img, (pre_x, pre_y), pre_txt, self.f_light, WHITE, alpha=alpha_all, blur_px=blur_pre)

        # 2) Palavra-âncora: datilografia letra-a-letra (se for "escrito") OU wipe horizontal
        anchor_dt = max(0.0, dt - (0.06 if pre_words else 0.0))
        if is_typewriter:
            tw_dur = min(0.45, max(0.22, dur * 0.5))
            n_chars = max(1, int(math.ceil(len(anchor_word) * min(1.0, anchor_dt / tw_dur))))
            shown = anchor_word[:n_chars]
            draw_text_with_shadow(img, (anchor_draw_x, anchor_draw_y), shown, anchor_font, anchor_color, alpha=alpha_all, blur_px=0.0)
        else:
            reveal_p = ease_out_cubic(anchor_dt / min(0.28, dur * 0.4))
            blur_a = max(0.0, 4.5 * (1.0 - ease_out_cubic(anchor_dt / 0.16)))
            anchor_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            draw_text_with_shadow(anchor_layer, (anchor_draw_x, anchor_draw_y), anchor_word, anchor_font, anchor_color, alpha=alpha_all, blur_px=blur_a)
            if reveal_p < 0.999:
                wipe_x = int(box_x1 - 20 + (aw + 40) * reveal_p)
                mask = Image.new("L", (W, H), 0)
                ImageDraw.Draw(mask).rectangle([0, 0, wipe_x, H], fill=255)
                anchor_layer = Image.composite(anchor_layer, Image.new("RGBA", (W, H), (0, 0, 0, 0)), mask)
            img.alpha_composite(anchor_layer)

        # 3) Frase complementar abaixo-direita
        if post_words:
            post_delay = min(0.24, dur * 0.28)
            if dt >= post_delay:
                pdt = dt - post_delay
                pp = ease_out_cubic(pdt / 0.18)
                p_alpha = min(pp, fade_out)
                slide_dy = int(round((1.0 - pp) * 16 * sc))
                blur_p = max(0.0, 3.0 * (1.0 - pp))

                last_w = post_words[-1]
                last_hi = len(post_words) >= 2 and clean_word(last_w) in HIGHLIGHT_KEYWORDS
                base_y = box_y2 + int(24 * sc) + slide_dy

                if last_hi:
                    lead_txt = " ".join(post_words[:-1])
                    lx0, ly0, lx1, ly1 = measure_text(self._dummy, lead_txt, self.f_light)
                    sx0, sy0, sx1, sy1 = measure_text(self._dummy, last_w, self.f_serif_md)
                    lw, sw = lx1 - lx0, sx1 - sx0
                    gap = int(14 * sc)
                    total_w = lw + gap + sw
                    right_edge = min(W - int(48 * sc), max(box_x2 + int(16 * sc), center_x + total_w // 2))
                    start_x = max(int(48 * sc), right_edge - total_w)

                    asc_l, _ = self.f_light.getmetrics()
                    asc_s, _ = self.f_serif_md.getmetrics()
                    baseline_y = base_y + asc_l
                    draw_text_with_shadow(img, (start_x - lx0, baseline_y - asc_l), lead_txt, self.f_light, WHITE, alpha=p_alpha, blur_px=blur_p)
                    draw_text_with_shadow(img, (start_x + lw + gap - sx0, baseline_y - asc_s), last_w, self.f_serif_md, ORANGE, alpha=p_alpha, blur_px=blur_p)
                else:
                    post_txt = " ".join(post_words)
                    tx0, ty0, tx1, ty1 = measure_text(self._dummy, post_txt, self.f_light)
                    tw = tx1 - tx0
                    right_edge = min(W - int(48 * sc), max(box_x2, center_x + tw // 2))
                    start_x = max(int(48 * sc), right_edge - tw)
                    draw_text_with_shadow(img, (start_x - tx0, base_y - ty0), post_txt, self.f_light, WHITE, alpha=p_alpha, blur_px=blur_p)

        return img

    def render_body(self, ev, t):
        W, H, sc = self.W, self.H, self.sc
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        s, e = ev["s"], ev["e"]
        dt = t - s
        rem = e - t
        alpha = min(ease_out_cubic(dt / 0.12), ease_out_cubic(rem / 0.10) if rem < 0.10 else 1.0)
        blur = max(0.0, 2.0 * (1.0 - ease_out_cubic(dt / 0.12)))

        # Apenas UMA palavra de destaque em laranja por frase (seleção universal automática)
        hi_idx = pick_highlight_index(ev["texts"])
        max_line_w = int(W * 0.84)
        word_items = []
        for idx_w, w in enumerate(ev["texts"]):
            if idx_w == hi_idx:
                f, col = self.f_serif_sm, ORANGE
            else:
                f, col = self.f_regular, WHITE
            x0, y0, x1, y1 = measure_text(self._dummy, w, f)
            word_items.append((w, f, col, x0, y0, x1 - x0, y1 - y0))

        space_w = int(16 * sc)
        lines = []
        cur_line = []
        cur_w = 0
        for item in word_items:
            iw = item[5]
            add_w = iw if not cur_line else space_w + iw
            if cur_line and cur_w + add_w > max_line_w:
                lines.append(cur_line)
                cur_line = [item]
                cur_w = iw
            else:
                cur_line.append(item)
                cur_w += add_w
        if cur_line:
            lines.append(cur_line)

        base_y = int(H * 0.78)
        line_h = int(78 * sc)
        start_y = base_y - (len(lines) - 1) * (line_h // 2)

        for li, line in enumerate(lines):
            total_w = sum(it[5] for it in line) + space_w * max(0, len(line) - 1)
            cx = (W - total_w) // 2
            baseline_y = start_y + li * line_h
            for w, f, col, x0, y0, ww, wh in line:
                asc, _ = f.getmetrics()
                draw_text_with_shadow(img, (cx - x0, baseline_y - asc), w, f, col, alpha=alpha, blur_px=blur, shadow_alpha=195)
                cx += ww + space_w

        return img


def render_overlay_video(words_json, clip_start, clip_end, W, H, fps, out_mov):
    with open(words_json, "r", encoding="utf-8") as f:
        words = json.load(f)

    dur = max(1.0, clip_end - clip_start)
    timeline = build_timeline(words, clip_start, clip_end)
    renderer = EncaixaRenderer(W, H)

    frames_dir = os.path.join(os.path.dirname(os.path.abspath(out_mov)), "_pil_frames")
    os.makedirs(frames_dir, exist_ok=True)
    empty_png = os.path.join(frames_dir, "empty.png")
    Image.new("RGBA", (W, H), (0, 0, 0, 0)).save(empty_png, compress_level=1)

    segments = []  # list of (png_path, duration_sec)
    cursor = 0.0
    step = 1.0 / fps
    png_idx = 0

    for ev in timeline:
        s = max(cursor, ev["s"])
        e = min(dur, ev["e"])
        if e <= s:
            continue
        if s > cursor + 0.005:
            segments.append((empty_png, s - cursor))

        # Entrada animada (até static_t) + hold estático + saída curta
        t = s
        static_written = False
        while t < e - 0.002:
            nxt_t = min(e, t + step)
            is_stat = renderer.is_static_at(ev, t)
            if is_stat and not static_written:
                # Calcula quanto tempo o quadro estático dura até o início do fade-out
                hold_end = max(t + step, e - (0.14 if ev["kind"] == "staggered" else 0.11))
                frame_img = renderer.render_staggered(ev, t) if ev["kind"] == "staggered" else renderer.render_body(ev, t)
                p = os.path.join(frames_dir, f"f_{png_idx:04d}.png")
                png_idx += 1
                frame_img.save(p, compress_level=1)
                segments.append((p, hold_end - t))
                static_written = True
                t = hold_end
            else:
                frame_img = renderer.render_staggered(ev, t) if ev["kind"] == "staggered" else renderer.render_body(ev, t)
                p = os.path.join(frames_dir, f"f_{png_idx:04d}.png")
                png_idx += 1
                frame_img.save(p, compress_level=1)
                segments.append((p, nxt_t - t))
                t = nxt_t
        cursor = e

    if cursor < dur - 0.005:
        segments.append((empty_png, dur - cursor))

    if not segments:
        segments.append((empty_png, dur))

    if out_mov.lower().endswith(".ffconcat"):
        with open(out_mov, "w", encoding="utf-8") as cf:
            cf.write("ffconcat version 1.0\n")
            for p, d in segments:
                p_esc = p.replace("\\", "/").replace("'", "\\'")
                cf.write(f"file '{p_esc}'\nduration {d:.4f}\n")
            last_esc = segments[-1][0].replace("\\", "/").replace("'", "\\'")
            cf.write(f"file '{last_esc}'\n")
        return

    concat_txt = os.path.join(frames_dir, "list.ffconcat")
    with open(concat_txt, "w", encoding="utf-8") as cf:
        cf.write("ffconcat version 1.0\n")
        for p, d in segments:
            p_esc = p.replace("\\", "/").replace("'", "\\'")
            cf.write(f"file '{p_esc}'\nduration {d:.4f}\n")
        last_esc = segments[-1][0].replace("\\", "/").replace("'", "\\'")
        cf.write(f"file '{last_esc}'\n")

    ffmpeg_bin = os.environ.get("FFMPEG_BIN", "ffmpeg")
    r = subprocess.run([
        ffmpeg_bin, "-y",
        "-f", "concat", "-safe", "0", "-i", concat_txt,
        "-vf", f"fps={fps},format=rgba",
        "-c:v", "png", "-pix_fmt", "rgba",
        "-t", f"{dur:.3f}",
        out_mov
    ], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    if r.returncode != 0:
        raise RuntimeError("Overlay render failed: " + r.stderr.decode("utf-8", "ignore")[-400:])


if __name__ == "__main__":
    if len(sys.argv) < 7:
        print("Usage: encaixa_pil_render.py <words.json> <clip_start> <clip_end> <W> <H> <out_overlay.mov> [fps]")
        sys.exit(1)
    render_overlay_video(
        sys.argv[1], float(sys.argv[2]), float(sys.argv[3]),
        int(sys.argv[4]), int(sys.argv[5]),
        int(sys.argv[7]) if len(sys.argv) > 7 else 25,
        sys.argv[6]
    )
    print("OK:", sys.argv[6])
