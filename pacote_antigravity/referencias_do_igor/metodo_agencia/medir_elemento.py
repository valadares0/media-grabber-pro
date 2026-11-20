"""Mede posição e tamanho de um elemento (legenda, logo, selo) num quadro 1080x1920.

python medir_elemento.py <quadro.png> --cor FFFFFF [--tol 40] [--regiao x0 y0 x1 y1]

Acha os pixels da cor dada (padrão: branco da legenda), dentro da região opcional, e imprime:
caixa (x0,y0,x1,y1), largura, altura, centro (cx,cy) e, por faixa de linhas, as linhas de texto encontradas.
Use para transformar "a legenda fica embaixo" em "centro y ≈ 1395, altura de letra 55 px".

Dicas: meça em vários quadros e tire a mediana; a altura de uma linha de texto em caixa alta
≈ 0,72 × tamanho da fonte (sem descendentes). Fundos claros confundem a medição: use --regiao.
"""
import argparse

import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("quadro")
ap.add_argument("--cor", default="FFFFFF", help="cor alvo em hex (sem #)")
ap.add_argument("--tol", type=int, default=40)
ap.add_argument("--regiao", type=int, nargs=4, metavar=("X0", "Y0", "X1", "Y1"))
a = ap.parse_args()

im = np.asarray(Image.open(a.quadro).convert("RGB")).astype(int)
H, W, _ = im.shape
x0, y0, x1, y1 = a.regiao or (0, 0, W, H)
alvo = np.array([int(a.cor[i:i + 2], 16) for i in (0, 2, 4)])
m = (np.abs(im[y0:y1, x0:x1] - alvo).max(axis=2) <= a.tol)
if not m.any():
    raise SystemExit("Nenhum pixel dessa cor na região.")
ys, xs = np.nonzero(m)
bx0, by0, bx1, by1 = xs.min() + x0, ys.min() + y0, xs.max() + x0, ys.max() + y0
print(f"quadro {W}x{H}  pixels={m.sum()}")
print(f"caixa  x {bx0}-{bx1}  y {by0}-{by1}  ->  {bx1 - bx0 + 1} x {by1 - by0 + 1} px")
print(f"centro cx={(bx0 + bx1) // 2}  cy={(by0 + by1) // 2}")
# linhas de texto: faixas de y com pixels, separadas por vazios >= 6 px
lin = m.any(axis=1)
ini = None
vazio = 0
for i, v in enumerate(list(lin) + [False] * 8):
    if v:
        if ini is None:
            ini = i
        vazio = 0
    elif ini is not None:
        vazio += 1
        if vazio >= 6:
            fim = i - vazio
            xs2 = np.nonzero(m[ini:fim + 1].any(axis=0))[0]
            print(f"linha  y {ini + y0}-{fim + y0} (altura {fim - ini + 1})  x {xs2.min() + x0}-{xs2.max() + x0}")
            ini = None
