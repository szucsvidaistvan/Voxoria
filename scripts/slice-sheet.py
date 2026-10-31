#!/usr/bin/env python3
"""Használat: python3 scripts/slice-sheet.py <blokklap.png>

Az izometrikus blokklapból (8 oszlop, blokkonként egy kocka + felirat) kivágja minden kocka
felső és oldalsó lapját 32x32-es lapos textúrának, és létrehozza:
  public/textures/<alapnév>.png     az alapblokkok textúrái
  public/textures/mc/<név>_top|_side.png   a többi blokk textúrái
  public/generated/blocks.json      a blokklista (src/shared/blocks.ts tölti be)
"""
import sys, json, os
import numpy as np
from PIL import Image

SRC = sys.argv[1]
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
T = 32
Q = 8  # túlmintavételezés a szebb leképezéshez

NAMES = """grass_block dirt stone cobblestone sand gravel clay bedrock
snow ice netherrack obsidian glowstone stone_bricks bricks glass
white_wool coal_ore iron_ore gold_ore diamond_ore redstone_ore lapis_ore emerald_ore
copper_ore deepslate_coal_ore deepslate_iron_ore deepslate_gold_ore deepslate_diamond_ore iron_block gold_block diamond_block
coal_block emerald_block lapis_block redstone_block copper_block oak_planks spruce_planks birch_planks
jungle_planks acacia_planks dark_oak_planks oak_log spruce_log birch_log jungle_log acacia_log
dark_oak_log oak_leaves spruce_leaves birch_leaves jungle_leaves acacia_leaves dark_oak_leaves sandstone
cactus tnt pumpkin melon hay_block mycelium bookshelf crafting_table
furnace water lava ladder""".split()
SKIP = {'glass', 'ladder'}  # átlátszó / nem kocka

XS = [7, 140, 273, 405, 537, 669, 802, 933]
YS = [8, 167, 333, 493, 659, 820, 986, 1140, 1311]
TW, TH = 125, 152

im = Image.open(SRC).convert('RGB')
a = np.array(im).astype(int)

def cube_box(x0, y0, h):
    reg = a[y0:y0 + h - 34, x0:x0 + TW]
    bg = np.array([reg[2:6, 2:6].reshape(-1, 3).mean(axis=0)])
    d = np.abs(reg - bg).sum(axis=2) > 70
    d[:3] = False
    ys, xs = np.where(d)
    # a szélső szóródó pixeleket (árnyék, fény) levágjuk
    cx = np.where(d.sum(axis=0) > 3)[0]; cy = np.where(d.sum(axis=1) > 3)[0]
    return x0 + cx.min(), y0 + cy.min(), x0 + cx.max() + 1, y0 + cy.max() + 1

def quad(box, p):
    # p: 4 pont (x,y) a forrásban: bal-felső, bal-alsó, jobb-alsó, jobb-felső a kimeneti négyzethez
    return im.transform((T * Q, T * Q), Image.QUAD, tuple(c for pt in p for c in pt), Image.BICUBIC).resize((T, T), Image.LANCZOS)

def faces(b):
    x0, y0, x1, y1 = b
    W, H = x1 - x0, y1 - y0
    m = 0.08  # befelé húzás, hogy az élek ne kerüljenek a textúrába
    X = lambda f: x0 + W * f
    Y = lambda f: y0 + H * f
    top_apex, ul, ur, ctr = (X(.5), Y(0)), (X(0), Y(.25)), (X(1), Y(.25)), (X(.5), Y(.5))
    ll, lr, bot = (X(0), Y(.75)), (X(1), Y(.75)), (X(.5), Y(1))
    def shrink(pts):
        cx = sum(p[0] for p in pts) / 4; cy = sum(p[1] for p in pts) / 4
        return [(cx + (px - cx) * (1 - m), cy + (py - cy) * (1 - m)) for px, py in pts]
    # QUAD sorrend: bal-felső, bal-alsó, jobb-alsó, jobb-felső
    top = shrink([ul, ctr, ur, top_apex])      # ul = bal, ctr = elöl, ur = jobb, apex = hátul
    left = shrink([ul, ll, bot, ctr])
    return top, left

os.makedirs(os.path.join(ROOT, 'public/textures/mc'), exist_ok=True)
os.makedirs(os.path.join(ROOT, 'public/generated'), exist_ok=True)

BASE = {  # játékbeli alapnév -> (blokk, lap)
    'grass_top': ('grass_block', 'top'), 'grass_side': ('grass_block', 'side'),
    'dirt': ('dirt', 'side'), 'stone': ('stone', 'side'), 'sand': ('sand', 'side'),
    'log_side': ('oak_log', 'side'), 'log_top': ('oak_log', 'top'), 'planks': ('oak_planks', 'side'),
    'leaves': ('oak_leaves', 'side'), 'cobblestone': ('cobblestone', 'side'),
    'water': ('water', 'top'), 'bedrock': ('bedrock', 'side'), 'gravel': ('gravel', 'side'),
    'sandstone': ('sandstone', 'side'), 'sandstone_top': ('sandstone', 'top'),
    'sandstone_bottom': ('sandstone', 'top'),
    'coal_ore': ('coal_ore', 'side'), 'iron_ore': ('iron_ore', 'side'),
    'gold_ore': ('gold_ore', 'side'), 'diamond_ore': ('diamond_ore', 'side'),
}
BASE_KEYS = {'grass_block', 'dirt', 'stone', 'sand', 'oak_log', 'oak_planks', 'oak_leaves', 'cobblestone',
             'bedrock', 'gravel', 'sandstone', 'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore'}

tex = {}
for i, name in enumerate(NAMES):
    if name in SKIP:
        continue
    x0, y0 = XS[i % 8], YS[i // 8]
    b = cube_box(x0, y0, TH)
    top, left = faces(b)
    tex[name] = {'top': quad(b, top), 'side': quad(b, left)}

for base, (blk, face) in BASE.items():
    tex[blk][face].save(os.path.join(ROOT, f'public/textures/{base}.png'))

textures, blocks = [], []
for name, t in tex.items():
    if name in BASE_KEYS or name == 'water':
        continue
    for face in ('top', 'side'):
        t[face].save(os.path.join(ROOT, f'public/textures/mc/{name}_{face}.png'))
    textures += [f'{name}_top', f'{name}_side']
    blocks.append({'name': name, 'kind': 'cube', 'top': f'{name}_top', 'bottom': f'{name}_top', 'side': f'{name}_side'})

with open(os.path.join(ROOT, 'public/generated/blocks.json'), 'w') as f:
    json.dump({'textures': textures, 'blocks': blocks}, f, indent=1)
print(f'{len(BASE)} alap textúra, {len(blocks)} extra blokk')

# ellenőrző lap
sheet = Image.new('RGB', (T * 2 * 10 + 20, (T + 4) * 8), (30, 30, 36))
for j, (n, t) in enumerate(tex.items()):
    sheet.paste(t['top'], ((j % 10) * T * 2 + 8, (j // 10) * (T + 4)))
    sheet.paste(t['side'], ((j % 10) * T * 2 + 8 + T, (j // 10) * (T + 4)))
sheet.save('/tmp/check.png')
