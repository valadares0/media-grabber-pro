import sys
import json
import os
import cv2
import numpy as np


def analyze_video(video_path, model_path, allow_split=False):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return {"error": "Cannot open video", "segments": []}

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1920)
    orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 1080)
    duration = total_frames / fps if total_frames > 0 else 0.0

    sample_fps = 2.5
    step = max(1, int(round(fps / sample_fps)))

    det_w = 480
    det_h = max(160, int(round(orig_h * (det_w / max(1, orig_w)))))

    detector = cv2.FaceDetectorYN.create(
        model_path,
        "",
        (det_w, det_h),
        score_threshold=0.60,
        nms_threshold=0.30,
        top_k=10,
    )

    samples = []
    prev_gray = None
    prev_hist = None
    frame_idx = 0

    while True:
        ret = cap.grab()
        if not ret:
            break
        if frame_idx % step == 0:
            ok, frame = cap.retrieve()
            if not ok or frame is None:
                frame_idx += 1
                continue
            small = cv2.resize(frame, (det_w, det_h), interpolation=cv2.INTER_AREA)
            gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
            hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
            hist = cv2.calcHist([hsv], [0, 1], None, [16, 16], [0, 180, 0, 256])
            cv2.normalize(hist, hist, 0, 1, cv2.NORM_MINMAX)

            is_cut = False
            if prev_gray is not None:
                diff = float(np.mean(cv2.absdiff(prev_gray, gray)))
                corr = float(cv2.compareHist(prev_hist, hist, cv2.HISTCMP_CORREL))
                if diff > 26.0 or corr < 0.72:
                    is_cut = True

            prev_gray = gray
            prev_hist = hist

            _, faces_raw = detector.detect(small)
            faces = []
            if faces_raw is not None:
                for f in faces_raw:
                    fx, fy, fw, fh = float(f[0]), float(f[1]), float(f[2]), float(f[3])
                    score = float(f[14])
                    cx = (fx + fw * 0.5) / det_w
                    cy = (fy + fh * 0.5) / det_h
                    area = (fw * fh) / (det_w * det_h)
                    # Ignora detecções minúsculas no fundo
                    if fw / det_w >= 0.032 and fh / det_h >= 0.04:
                        faces.append({
                            "cx": max(0.05, min(0.95, cx)),
                            "cy": max(0.05, min(0.95, cy)),
                            "w": fw / det_w,
                            "h": fh / det_h,
                            "area": area,
                            "score": score,
                        })

            # Ordena por área (maior rosto primeiro)
            faces.sort(key=lambda d: d["area"], reverse=True)
            samples.append({
                "t": frame_idx / fps,
                "is_cut": is_cut,
                "faces": faces,
            })
        frame_idx += 1

    cap.release()

    if not samples:
        return {
            "origW": orig_w,
            "origH": orig_h,
            "duration": duration,
            "segments": [{"start": 0.0, "end": max(1.0, duration), "mode": "single", "cx": 0.5, "cy": 0.45}],
        }

    # Agrupa samples em cenas (shots)
    shots = []
    cur_shot = [samples[0]]
    for s in samples[1:]:
        if s["is_cut"] and (s["t"] - cur_shot[0]["t"]) >= 0.6:
            shots.append(cur_shot)
            cur_shot = [s]
        else:
            cur_shot.append(s)
    if cur_shot:
        shots.append(cur_shot)

    segments = []
    for i, shot in enumerate(shots):
        t_start = 0.0 if i == 0 else shot[0]["t"]
        t_end = duration if i == len(shots) - 1 else shots[i + 1][0]["t"]
        if duration <= 0:
            t_end = shot[-1]["t"] + 0.4

        # Verifica se é cena de podcast com 2 pessoas lado a lado
        dual_frames = []
        primary_faces = []

        for smp in shot:
            fs = smp["faces"]
            if not fs:
                continue
            main = fs[0]
            primary_faces.append(main)
            if allow_split and len(fs) >= 2:
                f1, f2 = fs[0], fs[1]
                # Ambos têm tamanho comparável e estão separados horizontalmente
                if f2["area"] >= f1["area"] * 0.38 and abs(f1["cx"] - f2["cx"]) >= 0.22 and abs(f1["cy"] - f2["cy"]) < 0.28:
                    left, right = (f1, f2) if f1["cx"] < f2["cx"] else (f2, f1)
                    dual_frames.append((left, right))

        if allow_split and len(dual_frames) >= max(2, int(len(shot) * 0.35)):
            cx1 = float(np.median([p[0]["cx"] for p in dual_frames]))
            cy1 = float(np.median([p[0]["cy"] for p in dual_frames]))
            cx2 = float(np.median([p[1]["cx"] for p in dual_frames]))
            cy2 = float(np.median([p[1]["cy"] for p in dual_frames]))
            segments.append({
                "start": round(t_start, 3),
                "end": round(t_end, 3),
                "mode": "split",
                "cx1": round(cx1, 4),
                "cy1": round(cy1, 4),
                "cx2": round(cx2, 4),
                "cy2": round(cy2, 4),
            })
        elif primary_faces:
            cx = float(np.median([f["cx"] for f in primary_faces]))
            cy = float(np.median([f["cy"] for f in primary_faces]))
            segments.append({
                "start": round(t_start, 3),
                "end": round(t_end, 3),
                "mode": "single",
                "cx": round(cx, 4),
                "cy": round(cy, 4),
            })
        else:
            segments.append({
                "start": round(t_start, 3),
                "end": round(t_end, 3),
                "mode": "fit_blur" if orig_w > orig_h else "single",
                "cx": 0.5,
                "cy": 0.45,
            })

    # Mescla segmentos single consecutivos com cx muito próximo (< 0.04 de diferença) para suavidade
    merged = []
    for seg in segments:
        if (
            merged
            and merged[-1]["mode"] == "single"
            and seg["mode"] == "single"
            and abs(merged[-1]["cx"] - seg["cx"]) < 0.04
        ):
            merged[-1]["end"] = seg["end"]
        else:
            merged.append(seg)

    return {
        "origW": orig_w,
        "origH": orig_h,
        "duration": round(duration, 3),
        "segments": merged,
    }


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: smart_reframe.py <video> <yunet.onnx> [allow_split]"}))
        sys.exit(1)
    video = sys.argv[1]
    model = sys.argv[2]
    allow_split = len(sys.argv) > 3 and sys.argv[3] in ("1", "true", "True")
    res = analyze_video(video, model, allow_split)
    print(json.dumps(res))
