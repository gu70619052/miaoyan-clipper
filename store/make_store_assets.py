#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 Chrome 应用商店需要的截图与宣传图。

素材来源：test/screenshots/ 下由 test/shots.mjs 生成的实拍截图。
版式：上方 660px 是实拍画面（缩放到 1280 宽），下方 140px 深色标题条
      （大标题 + 副标题 + 妙言 App 图标）。

用法：
  python3 store/make_store_assets.py
"""
import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SHOTS = ROOT / 'test' / 'screenshots'
ICONS = ROOT / 'icons'
OUT = HERE

BAR_H = 140
IMG_H = 660
W = 1280

# macOS 自带中文字体；PingFang.ttc 在本机不存在，用 Hiragino 才不会出豆腐块
FONT_PATH = '/System/Library/Fonts/Hiragino Sans GB.ttc'

# (源截图, 输出名, 大标题, 副标题)
SHOTS_SPEC = [
    ('06-全文范围框.png', 'shot-1-1280x800.png',
     '全文剪藏：自动框出正文，拖手柄即可调整',
     '广告位、猜你喜欢、热门排行都在框外，保存时会被自动剔除'),
    ('02-面板-草稿.png', 'shot-2-1280x800.png',
     '侧边栏里改标题、选目录、写标签',
     '会带出你最近一次保存用的目录；不想要的字段可以关掉'),
    ('03-面板-预览.png', 'shot-3-1280x800.png',
     '保存前先预览 Markdown 效果',
     'frontmatter 写好标题、来源、站点、作者、剪藏时间、标签'),
    ('04-设置页.png', 'shot-4-1280x800.png',
     '目录授权、图片策略一次设定',
     '默认拒绝下载内网地址的图片，网页无法借它探测你的局域网'),
    ('05-设置页-诊断.png', 'shot-5-1280x800.png',
     '出问题时先看诊断',
     '对比设置页与后台两个上下文的目录权限，一眼看出卡在哪'),
]

PROMO_SPEC = {
    'promo-440x280.png': (440, 280),
    'promo-920x680.png': (920, 680),
}


def font(size, index=0):
    try:
        return ImageFont.truetype(FONT_PATH, size, index=index)
    except Exception:
        return ImageFont.load_default()


def compose_shot(src, dst, title, subtitle):
    page = Image.open(src).convert('RGB')
    # 顶部画面：按宽度缩放后裁到 660 高
    scale = W / page.width
    page = page.resize((W, max(1, int(page.height * scale))), Image.LANCZOS)
    if page.height < IMG_H:
        canvas = Image.new('RGB', (W, IMG_H), (24, 23, 21))
        canvas.paste(page, (0, 0))
        page = canvas
    page = page.crop((0, 0, W, IMG_H))

    out = Image.new('RGB', (W, IMG_H + BAR_H), (24, 23, 21))
    out.paste(page, (0, 0))
    draw = ImageDraw.Draw(out)

    f_title = font(30)
    f_sub = font(16)
    draw.text((44, IMG_H + 22), title, font=f_title, fill=(240, 238, 233))
    draw.text((44, IMG_H + 76), subtitle, font=f_sub, fill=(160, 155, 146))

    icon = ICONS / 'icon128.png'
    if icon.exists():
        im = Image.open(icon).convert('RGBA').resize((56, 56), Image.LANCZOS)
        out.paste(im, (W - 56 - 44, IMG_H + (BAR_H - 56) // 2), im)

    out.save(dst, 'PNG')
    return dst


def compose_promo(src, dst, size):
    w, h = size
    page = Image.open(src).convert('RGB')
    scale = w / page.width
    page = page.resize((w, max(1, int(page.height * scale))), Image.LANCZOS)
    bar_h = max(64, int(h * 0.26))
    img_h = h - bar_h
    if page.height < img_h:
        canvas = Image.new('RGB', (w, img_h), (24, 23, 21))
        canvas.paste(page, (0, 0))
        page = canvas
    page = page.crop((0, 0, w, img_h))

    out = Image.new('RGB', (w, h), (24, 23, 21))
    out.paste(page, (0, 0))
    draw = ImageDraw.Draw(out)
    f_title = font(max(16, int(bar_h * 0.30)))
    f_sub = font(max(11, int(bar_h * 0.17)))
    draw.text((int(w * 0.05), img_h + int(bar_h * 0.16)),
              '妙言剪藏', font=f_title, fill=(240, 238, 233))
    draw.text((int(w * 0.05), img_h + int(bar_h * 0.55)),
              '网页一键存成妙言笔记', font=f_sub, fill=(160, 155, 146))

    icon = ICONS / 'icon128.png'
    if icon.exists():
        im = Image.open(icon).convert('RGBA').resize((int(bar_h * 0.62),) * 2, Image.LANCZOS)
        out.paste(im, (w - im.width - int(w * 0.05), img_h + (bar_h - im.height) // 2), im)

    out.save(dst, 'PNG')
    return dst


def main():
    if not SHOTS.exists():
        print(f'找不到截图目录：{SHOTS}（先跑 test/shots.mjs）', file=sys.stderr)
        return 1
    made = []
    for src_name, dst_name, title, subtitle in SHOTS_SPEC:
        src = SHOTS / src_name
        if not src.exists():
            print(f'跳过（缺源图）：{src_name}', file=sys.stderr)
            continue
        made.append(compose_shot(src, OUT / dst_name, title, subtitle))
        print('生成', dst_name)
    promo_src = SHOTS / '01-页面浮层.png'
    if promo_src.exists():
        for name, size in PROMO_SPEC.items():
            made.append(compose_promo(promo_src, OUT / name, size))
            print('生成', name)
    else:
        print(f'跳过宣传图（缺源图）：{promo_src}', file=sys.stderr)
    print(f'共 {len(made)} 张')
    return 0


if __name__ == '__main__':
    sys.exit(main())
