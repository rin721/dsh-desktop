"""从透明母版确定性生成 DSH Desktop 的 Windows 图标资源。"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from tempfile import NamedTemporaryFile

from PIL import Image, ImageDraw, ImageFilter


PNG_SIZES = (16, 20, 24, 32, 40, 48, 64, 96, 128, 192, 256, 512, 1024)
ICO_SIZES = (16, 20, 24, 32, 40, 48, 64, 128, 256)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="带透明通道的正方形母版")
    parser.add_argument("--output", required=True, type=Path, help="图标资源目录")
    args = parser.parse_args()

    source = Image.open(args.input).convert("RGBA")
    if source.width != source.height:
        raise ValueError("图标母版必须是正方形。")
    if source.getextrema()[3][0] != 0:
        raise ValueError("图标母版四周必须包含透明像素。")

    output = args.output.resolve()
    png_dir = output / "png"
    png_dir.mkdir(parents=True, exist_ok=True)
    master = source.resize((1024, 1024), Image.Resampling.LANCZOS)
    write_png(master, output / "app-icon-master.png")

    generated: list[Path] = []
    frames: dict[int, Image.Image] = {}
    for size in PNG_SIZES:
        frame = master.resize((size, size), Image.Resampling.LANCZOS)
        if size <= 48:
            frame = frame.filter(ImageFilter.UnsharpMask(radius=0.6, percent=115, threshold=2))
        path = png_dir / f"app-icon-{size}.png"
        write_png(frame, path)
        frames[size] = frame
        generated.append(path)

    ico_path = output / "app-icon.ico"
    write_ico(master, ico_path)
    generated.append(ico_path)

    preview_path = output / "app-icon-contact-sheet.png"
    write_contact_sheet(frames, preview_path)
    generated.append(preview_path)

    manifest = {
        "schemaVersion": 1,
        "source": relative(output, args.input.resolve()),
        "sourceSha256": digest(args.input.resolve()),
        "pngSizes": list(PNG_SIZES),
        "icoSizes": list(ICO_SIZES),
        "files": [
            {
                "path": relative(output, path),
                "bytes": path.stat().st_size,
                "sha256": digest(path),
            }
            for path in sorted(generated)
        ],
    }
    write_text(output / "icon-manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")


def write_png(image: Image.Image, path: Path) -> None:
    with NamedTemporaryFile(dir=path.parent, suffix=".png", delete=False) as handle:
        temporary = Path(handle.name)
    try:
        image.save(temporary, format="PNG", optimize=True, compress_level=9)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def write_ico(image: Image.Image, path: Path) -> None:
    with NamedTemporaryFile(dir=path.parent, suffix=".ico", delete=False) as handle:
        temporary = Path(handle.name)
    try:
        image.save(temporary, format="ICO", sizes=[(size, size) for size in ICO_SIZES])
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def write_contact_sheet(frames: dict[int, Image.Image], path: Path) -> None:
    columns = 4
    card_width, card_height = 248, 220
    rows = (len(PNG_SIZES) + columns - 1) // columns
    sheet = Image.new("RGBA", (columns * card_width, rows * card_height), "#eef2f8")
    draw = ImageDraw.Draw(sheet)
    for index, size in enumerate(PNG_SIZES):
        x = (index % columns) * card_width
        y = (index // columns) * card_height
        for py in range(y + 18, y + 178, 16):
            for px in range(x + 44, x + 204, 16):
                fill = "#d6dbe5" if ((px + py) // 16) % 2 == 0 else "#ffffff"
                draw.rectangle((px, py, px + 15, py + 15), fill=fill)
        preview = frames[size].resize((160, 160), Image.Resampling.NEAREST)
        sheet.alpha_composite(preview, (x + 44, y + 18))
        draw.text((x + 44, y + 188), f"{size} x {size}", fill="#16233d")
    write_png(sheet, path)


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def relative(root: Path, path: Path) -> str:
    return path.relative_to(root).as_posix()


def write_text(path: Path, content: str) -> None:
    with NamedTemporaryFile(dir=path.parent, mode="w", encoding="utf-8", newline="\n", delete=False) as handle:
        handle.write(content)
        temporary = Path(handle.name)
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
