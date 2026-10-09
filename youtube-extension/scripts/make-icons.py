#!/usr/bin/env python3
"""Draws the TubeShield icon (red shield with a white play button and a slash)
and writes the PNG sizes Chrome needs. Run: python3 scripts/make-icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
S = 1024  # draw large, then downscale for smooth edges

def draw_icon():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # shield outline
    top, bottom, left, right = 70, 970, 130, 894
    mid = S // 2
    shield = [
        (mid, top), (right, top + 130), (right, 520),
        (mid + 250, 820), (mid, bottom), (mid - 250, 820),
        (left, 520), (left, top + 130),
    ]
    d.polygon(shield, fill=(220, 38, 38, 255))
    # play triangle
    d.polygon([(400, 330), (400, 700), (690, 515)], fill=(255, 255, 255, 255))
    # "no" slash across it
    d.line([(300, 300), (724, 735)], fill=(255, 255, 255, 255), width=70)
    d.line([(300, 300), (724, 735)], fill=(220, 38, 38, 255), width=26)
    return img

def main():
    out = ROOT / "icons"
    out.mkdir(exist_ok=True)
    big = draw_icon()
    for size in (16, 32, 48, 128):
        big.resize((size, size), Image.LANCZOS).save(out / f"icon{size}.png")
    # Chrome Web Store small promo tile (440x280)
    tile = Image.new("RGBA", (440, 280), (24, 24, 27, 255))
    tile.alpha_composite(big.resize((180, 180), Image.LANCZOS), (130, 50))
    tile.convert("RGB").save(ROOT / "store" / "promo-tile-440x280.png")
    print("icons written")

if __name__ == "__main__":
    main()
