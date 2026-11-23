#!/usr/bin/env python3
"""生成妙言剪藏扩展图标（16/32/48/128）。

图标直接取自本机的妙言 App（/Applications/MiaoYan.app 的 app.icns），
保证扩展图标和妙言 App 完全一致：米色圆角方块 + 红鸟。

如果本机没装妙言 App，退回到画一个「米色底 + 红鸟剪影」的简化标记。
用法：python3 icons/make_icons.py
"""
import os
import shutil
import subprocess
import tempfile

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
APP_ICON = "/Applications/MiaoYan.app/Contents/Resources/app.icns"
SIZES = (16, 32, 48, 128)

CREAM = (242, 235, 221)
RED = (224, 74, 44)


def app_icon_png():
    """把 .icns 转成 1024px PNG，返回路径（失败返回 None）"""
    if not os.path.exists(APP_ICON):
        return None
    if not shutil.which("sips"):
        return None
    out = os.path.join(tempfile.mkdtemp(prefix="miaoyan-icon-"), "icon.png")
    try:
        subprocess.run(
            ["sips", "-s", "format", "png", "-Z", "1024", APP_ICON, "--out", out],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        return None
    return out if os.path.exists(out) else None


def fallback_icon(size):
    """没有妙言 App 时画的简化标记：米色圆角方块 + 红鸟剪影"""
    img = Image.new("RGBA", (size * 4, size * 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size * 4
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=CREAM)
    # 鸟身
    d.ellipse([s * 0.28, s * 0.34, s * 0.72, s * 0.74], fill=RED)
    # 头
    d.ellipse([s * 0.52, s * 0.26, s * 0.78, s * 0.52], fill=RED)
    # 嘴
    d.polygon([(s * 0.76, s * 0.36), (s * 0.9, s * 0.42), (s * 0.76, s * 0.46)], fill=(240, 190, 70))
    # 尾
    d.polygon([(s * 0.3, s * 0.5), (s * 0.12, s * 0.66), (s * 0.3, s * 0.62)], fill=RED)
    # 眼睛
    d.ellipse([s * 0.66, s * 0.34, s * 0.72, s * 0.4], fill=(30, 30, 30))
    return img.resize((size, size), Image.LANCZOS)


def main():
    src = app_icon_png()
    base = None
    if src:
        base = Image.open(src).convert("RGBA")
        print("source:", APP_ICON)
    else:
        print("warning: 找不到妙言 App 图标，使用内置简化标记")

    for size in SIZES:
        path = os.path.join(HERE, f"icon{size}.png")
        if base is not None:
            icon = base.resize((size, size), Image.LANCZOS)
        else:
            icon = fallback_icon(size)
        icon.save(path, "PNG")
        print("wrote", path, os.path.getsize(path), "bytes")


if __name__ == "__main__":
    main()
