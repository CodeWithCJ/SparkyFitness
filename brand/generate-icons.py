#!/usr/bin/env python3
"""Regenerate every Sparky Fitness app icon / logo file from the brand mark SVGs.

Source of truth: sparky-mark.svg (light-context color) and sparky-mark-dark.svg
(dark-context color). Everything else in the repo that shows the logo is a
raster export of one of these two, composited onto the right background for
that platform (transparent, white, or opaque-white-required like watch icons).

Run from anywhere; paths are resolved relative to the repo's `source/` root
(this file's grandparent directory). Requires `rsvg-convert` on PATH.

    python3 brand/generate-icons.py
"""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

BRAND_DIR = Path(__file__).resolve().parent
SOURCE_ROOT = BRAND_DIR.parent  # .../sparkyfitness/source

LIGHT = "#F2375A"
DARK = "#FF6B82"

# The mark's own viewBox (0 0 100 96) already bakes in comfortable padding
# around the glyph, so "scale" below is the fraction of the square canvas
# that the *whole 100x96 box* occupies -- matching how it was shown in the
# concept comparison (icon glyph at ~62% of the tile).
MARK_PATHS = """
  <path d="M6,58 L24,58 L32,40 L42,80 L52,40 L62,58 L94,58" fill="none" stroke="{color}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M52,16 L55,23 L62,26 L55,29 L52,36 L49,29 L42,26 L49,23 Z" fill="{color}"/>
"""


def icon_svg(canvas_w: float, canvas_h: float, color: str, scale: float) -> str:
    """A `canvas_w` x `canvas_h` square(ish) canvas with the mark centered,
    occupying `scale` fraction of canvas_w."""
    mark_w = canvas_w * scale
    s = mark_w / 100.0
    mark_h = 96 * s
    tx = (canvas_w - mark_w) / 2.0
    ty = (canvas_h - mark_h) / 2.0
    paths = MARK_PATHS.format(color=color)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {canvas_w} {canvas_h}">'
        f'<g transform="translate({tx:.3f},{ty:.3f}) scale({s:.5f})">{paths}</g></svg>'
    )


def render(svg_text: str, out_path: Path, width: int, height: int, bg: str | None = None) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False) as f:
        f.write(svg_text)
        svg_path = f.name
    cmd = ["rsvg-convert", "-w", str(width), "-h", str(height), "-o", str(out_path), svg_path]
    if bg:
        cmd[1:1] = ["-b", bg]
    subprocess.run(cmd, check=True)
    Path(svg_path).unlink(missing_ok=True)
    print(f"  wrote {out_path.relative_to(SOURCE_ROOT)} ({width}x{height}{' opaque ' + bg if bg else ''})")


def blank_png(out_path: Path, width: int, height: int) -> None:
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}"></svg>'
    render(svg, out_path, width, height)


def main() -> None:
    mobile = SOURCE_ROOT / "SparkyFitnessMobile"
    frontend = SOURCE_ROOT / "SparkyFitnessFrontend"
    docs = SOURCE_ROOT / "docs"

    print("Mobile: iOS Icon Composer layers")
    icon_bundle = mobile / "assets/icons/appicon.icon/Assets"
    render(icon_svg(800, 819, LIGHT, 0.62), icon_bundle / "Asset 3.png", 800, 819)
    blank_png(icon_bundle / "Asset 1.png", 609, 539)
    blank_png(icon_bundle / "Asset 2.png", 69, 82)

    print("Mobile: Android adaptive icon foreground")
    render(icon_svg(1024, 1024, LIGHT, 0.5), mobile / "assets/icons/adaptiveicon.png", 1024, 1024)

    print("Mobile: watch app icon (must be opaque)")
    render(icon_svg(1024, 1024, LIGHT, 0.62), mobile / "assets/icons/watchicon.png", 1024, 1024, bg="white")

    print("Mobile: in-app logo (Onboarding / About)")
    render(icon_svg(1024, 1024, LIGHT, 0.8), mobile / "assets/images/logo.png", 1024, 1024)
    render(icon_svg(2048, 2048, LIGHT, 0.8), mobile / "assets/images/logo@2x.png", 2048, 2048)

    print("Mobile: Live Activity small icon")
    render(icon_svg(96, 96, LIGHT, 0.7), mobile / "assets/icons/live-activity-icon.png", 96, 96)

    print("Mobile: watch target AppIcon.appiconset (opaque)")
    watch_set = mobile / "targets/watch/Assets.xcassets/AppIcon.appiconset"
    render(icon_svg(1024, 1024, LIGHT, 0.62), watch_set / "App-Icon-1024x1024@1x.png", 1024, 1024, bg="white")

    print("Mobile: widget target AppIcon.appiconset (opaque)")
    widget_set = mobile / "targets/widget/Assets.xcassets/AppIcon.appiconset"
    widget_sizes = {
        "App-Icon-20x20@1x.png": 20,
        "App-Icon-20x20@2x.png": 40,
        "App-Icon-20x20@3x.png": 60,
        "App-Icon-29x29@1x.png": 29,
        "App-Icon-29x29@2x.png": 58,
        "App-Icon-29x29@3x.png": 87,
        "App-Icon-40x40@1x.png": 40,
        "App-Icon-40x40@2x.png": 80,
        "App-Icon-40x40@3x.png": 120,
        "App-Icon-60x60@2x.png": 120,
        "App-Icon-60x60@3x.png": 180,
        "App-Icon-76x76@1x.png": 76,
        "App-Icon-76x76@2x.png": 152,
        "App-Icon-83.5x83.5@2x.png": 167,
        "ItunesArtwork@2x.png": 1024,
    }
    for filename, px in widget_sizes.items():
        render(icon_svg(px, px, LIGHT, 0.62), widget_set / filename, px, px, bg="white")

    print("Web: favicon + PWA icons (transparent)")
    favicon_png = SOURCE_ROOT / "_favicon_tmp.png"
    render(icon_svg(256, 256, LIGHT, 0.62), favicon_png, 256, 256)
    subprocess.run(
        ["magick", str(favicon_png), "-define", "icon:auto-resize=64,48,32,16",
         str(frontend / "public/favicon.ico")],
        check=True,
    )
    print(f"  wrote {(frontend / 'public/favicon.ico').relative_to(SOURCE_ROOT)}")
    favicon_png.unlink(missing_ok=True)

    render(icon_svg(192, 192, LIGHT, 0.62), frontend / "public/images/icons/icon-192x192.png", 192, 192)
    render(icon_svg(512, 512, LIGHT, 0.6), frontend / "public/images/icons/icon-512x512.png", 512, 512)

    print("Web: apple touch icon (opaque, standard 180x180)")
    touch_png = SOURCE_ROOT / "_touch_tmp.png"
    render(icon_svg(180, 180, LIGHT, 0.62), touch_png, 180, 180, bg="white")
    subprocess.run(["magick", str(touch_png), str(frontend / "public/images/SparkyFitness.webp")], check=True)
    print(f"  wrote {(frontend / 'public/images/SparkyFitness.webp').relative_to(SOURCE_ROOT)}")
    touch_png.unlink(missing_ok=True)

    print("Docs: favicon + hero logo (transparent)")
    docs_favicon_png = SOURCE_ROOT / "_docs_favicon_tmp.png"
    render(icon_svg(256, 256, LIGHT, 0.62), docs_favicon_png, 256, 256)
    subprocess.run(
        ["magick", str(docs_favicon_png), "-define", "icon:auto-resize=64,48,32,16",
         str(docs / "src/public/favicon.ico")],
        check=True,
    )
    print(f"  wrote {(docs / 'src/public/favicon.ico').relative_to(SOURCE_ROOT)}")
    docs_favicon_png.unlink(missing_ok=True)

    render(icon_svg(512, 512, LIGHT, 0.72), docs / "src/public/logo.png", 512, 512)

    print("Docs: nav logo SVGs (light/dark, VitePress themeConfig.logo)")
    (docs / "src/public/logo-light.svg").write_text((BRAND_DIR / "sparky-mark.svg").read_text())
    (docs / "src/public/logo-dark.svg").write_text((BRAND_DIR / "sparky-mark-dark.svg").read_text())
    print(f"  wrote {(docs / 'src/public/logo-light.svg').relative_to(SOURCE_ROOT)}")
    print(f"  wrote {(docs / 'src/public/logo-dark.svg').relative_to(SOURCE_ROOT)}")

    print("\nDone. Next: from SparkyFitnessMobile/, run `npx expo prebuild --clean` to")
    print("regenerate ios/ and android/ from the updated assets/icons/ and assets/images/.")


if __name__ == "__main__":
    main()
