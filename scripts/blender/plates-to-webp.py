#!/usr/bin/env python3
"""Convert the rendered plates (site/img/plate-*.png, RGBA) to WebP with alpha for the site, and report sizes."""
import glob, os
from PIL import Image
for p in sorted(glob.glob(os.path.join(os.path.dirname(__file__), '..', '..', 'site', 'img', 'plate-*.png'))):
    im = Image.open(p).convert('RGBA'); w, h = im.size
    if w > 960: im = im.resize((960, round(h * 960 / w)), Image.LANCZOS)
    out = p[:-4] + '.webp'; im.save(out, 'WEBP', quality=82, method=6, alpha_quality=90)
    print(f'{os.path.basename(out)} {im.size[0]}x{im.size[1]} {os.path.getsize(out) // 1024} KB (png {os.path.getsize(p) // 1024} KB)')
