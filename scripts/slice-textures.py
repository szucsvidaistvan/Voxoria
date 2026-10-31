#!/usr/bin/env python3
"""Használat: python3 scripts/slice-textures.py <a_7_textúralap_mappája>

A mappában az IMG_8114.png … IMG_8120.png lapok vannak (20 oszlop, 112x130 px-es cellák,
a 64x64-es csempe a cella bal felső sarkától (24, 6) pixelre, alatta a név).
Kivágja az alap blokkok textúráit, és létrehozza:
  public/textures/<alapnév>.png          az alapblokkok textúrái
  public/textures/mc/<név>.png           a további blokkok textúrái
  public/generated/blocks.json           a blokklista (src/shared/blocks.ts tölti be)
"""
import sys, os, json
from PIL import Image

SHEETS = {1: 'IMG_8120', 2: 'IMG_8119', 3: 'IMG_8118', 4: 'IMG_8117', 5: 'IMG_8115', 6: 'IMG_8116', 7: 'IMG_8114'}
PITCH_X, PITCH_Y, OFF_X, OFF_Y, T = 112, 130, 24, 6, 64

# textúra neve a lapon -> (lap, sor, oszlop)
# (a diamond/emerald/packed_ice tömbök a *_particle csempéből készülnek: az eredeti csempe 4 részes, shaderes adatot is tartalmaz)
SRC = {
    'grass_block_top': (4, 1, 0), 'grass_block_side': (4, 0, 17), 'dirt': (6, 3, 15), 'stone': (2, 14, 8),
    'sand': (2, 9, 2), 'oak_log': (3, 5, 19), 'oak_log_top': (3, 6, 0), 'oak_planks': (3, 6, 1),
    'oak_leaves': (4, 8, 1), 'cobblestone': (5, 4, 16), 'water_still': (1, 10, 10), 'bedrock': (7, 3, 10),
    'gravel': (4, 1, 1), 'sandstone': (2, 9, 11), 'sandstone_bottom': (2, 9, 12), 'sandstone_top': (2, 9, 13),
    'coal_ore': (5, 4, 14), 'iron_ore': (4, 4, 5), 'gold_ore': (6, 14, 19), 'diamond_ore': (6, 3, 13),
    # további kövek, földek
    'clay': (5, 4, 11), 'snow': (2, 13, 0), 'ice': (4, 3, 19), 'packed_ice': (3, 9, 2), 'netherrack': (3, 5, 9),
    'obsidian': (3, 6, 15), 'glowstone': (6, 14, 17), 'stone_bricks': (2, 14, 9), 'bricks': (7, 12, 18),
    'mossy_cobblestone': (3, 2, 11), 'moss_block': (3, 2, 10), 'smooth_stone': (2, 12, 0), 'diorite': (6, 3, 14),
    'red_sand': (2, 6, 1), 'terracotta': (1, 4, 15), 'white_wool': (1, 12, 7), 'red_wool': (2, 6, 11), 'yellow_wool': (1, 13, 2),
    'mycelium_top': (3, 4, 18), 'mycelium_side': (3, 4, 16), 'end_stone': (6, 9, 8),
    # ércek
    'redstone_ore': (2, 7, 4), 'lapis_ore': (4, 6, 8), 'emerald_ore': (6, 9, 0), 'copper_ore': (5, 7, 2),
    'deepslate_coal_ore': (5, 13, 5), 'deepslate_copper_ore': (5, 13, 6), 'deepslate_diamond_ore': (5, 13, 7),
    'deepslate_emerald_ore': (5, 13, 8), 'deepslate_gold_ore': (5, 13, 9), 'deepslate_iron_ore': (5, 13, 10),
    'deepslate_lapis_ore': (5, 13, 11), 'deepslate_redstone_ore': (6, 2, 6),
    # fémblokkok
    'iron_block': (4, 4, 2), 'gold_block': (6, 14, 18), 'diamond_block': (6, 3, 11), 'emerald_block': (6, 8, 18),
    'lapis_block': (4, 6, 7), 'redstone_block': (2, 6, 12), 'coal_block': (5, 4, 13), 'copper_block': (5, 6, 13),
    # fák
    'spruce_planks': (2, 14, 1), 'birch_planks': (7, 10, 6), 'jungle_planks': (4, 5, 13),
    'acacia_planks': (7, 0, 3), 'dark_oak_planks': (5, 10, 8),
    'spruce_log': (2, 13, 19), 'spruce_log_top': (2, 14, 0), 'birch_log': (7, 10, 4), 'birch_log_top': (7, 10, 5),
    'jungle_log': (4, 5, 11), 'jungle_log_top': (4, 5, 12), 'acacia_log': (7, 0, 1), 'acacia_log_top': (7, 0, 2),
    'dark_oak_log': (5, 10, 6), 'dark_oak_log_top': (5, 10, 7),
    'spruce_leaves': (4, 8, 5), 'birch_leaves': (4, 7, 1), 'jungle_leaves': (4, 7, 19),
    'acacia_leaves': (4, 6, 19), 'dark_oak_leaves': (4, 7, 3),
    # egyebek
    'cactus_top': (7, 14, 17), 'cactus_bottom': (7, 14, 13), 'cactus_side': (7, 14, 16),
    'tnt_top': (1, 5, 5), 'tnt_bottom': (1, 5, 2), 'tnt_side': (1, 5, 3),
    'pumpkin_top': (2, 4, 2), 'pumpkin_side': (2, 3, 10), 'melon_top': (3, 2, 9), 'melon_side': (3, 1, 17),
    'hay_block_top': (4, 2, 14), 'hay_block_side': (4, 2, 13),
    'bookshelf': (7, 12, 10), 'bookshelf_ends': (7, 12, 11),
    'crafting_table_top': (5, 8, 5), 'crafting_table_side': (5, 8, 4),
    'furnace_top': (6, 13, 12), 'furnace_side': (6, 13, 11), 'lava_still': (4, 6, 17),
}

# a játék alaptextúrái -> a lapon lévő textúra
BASE = {
    'grass_top': 'grass_block_top', 'grass_side': 'grass_block_side', 'dirt': 'dirt', 'stone': 'stone', 'sand': 'sand',
    'log_side': 'oak_log', 'log_top': 'oak_log_top', 'planks': 'oak_planks', 'leaves': 'oak_leaves',
    'cobblestone': 'cobblestone', 'water': 'water_still', 'bedrock': 'bedrock', 'gravel': 'gravel',
    'sandstone': 'sandstone', 'sandstone_top': 'sandstone_top', 'sandstone_bottom': 'sandstone_bottom',
    'coal_ore': 'coal_ore', 'iron_ore': 'iron_ore', 'gold_ore': 'gold_ore', 'diamond_ore': 'diamond_ore',
}

def cube(top, side=None, bottom=None):
    return (top, bottom or top, side or top)

# blokk neve -> (teteje, alja, oldala)
BLOCKS = {n: cube(n) for n in [
    'clay', 'snow', 'ice', 'packed_ice', 'netherrack', 'obsidian', 'glowstone', 'stone_bricks', 'bricks',
    'mossy_cobblestone', 'moss_block', 'smooth_stone', 'diorite', 'red_sand', 'terracotta', 'white_wool', 'red_wool',
    'yellow_wool', 'end_stone',
    'redstone_ore', 'lapis_ore', 'emerald_ore', 'copper_ore', 'deepslate_coal_ore', 'deepslate_copper_ore',
    'deepslate_diamond_ore', 'deepslate_emerald_ore', 'deepslate_gold_ore', 'deepslate_iron_ore',
    'deepslate_lapis_ore', 'deepslate_redstone_ore',
    'iron_block', 'gold_block', 'diamond_block', 'emerald_block', 'lapis_block', 'redstone_block', 'coal_block',
    'copper_block', 'spruce_planks', 'birch_planks', 'jungle_planks', 'acacia_planks', 'dark_oak_planks',
    'spruce_leaves', 'birch_leaves', 'jungle_leaves', 'acacia_leaves', 'dark_oak_leaves', 'lava_still']}
BLOCKS['lava'] = BLOCKS.pop('lava_still')
for w in ['spruce', 'birch', 'jungle', 'acacia', 'dark_oak']:
    BLOCKS[f'{w}_log'] = cube(f'{w}_log_top', f'{w}_log')
BLOCKS['cactus'] = ('cactus_top', 'cactus_bottom', 'cactus_side')
BLOCKS['tnt'] = ('tnt_top', 'tnt_bottom', 'tnt_side')
BLOCKS['pumpkin'] = ('pumpkin_top', 'pumpkin_top', 'pumpkin_side')
BLOCKS['melon'] = ('melon_top', 'melon_top', 'melon_side')
BLOCKS['hay_block'] = ('hay_block_top', 'hay_block_top', 'hay_block_side')
BLOCKS['mycelium'] = ('mycelium_top', 'dirt', 'mycelium_side')
BLOCKS['bookshelf'] = ('bookshelf_ends', 'bookshelf_ends', 'bookshelf')
BLOCKS['crafting_table'] = ('crafting_table_top', 'oak_planks', 'crafting_table_side')
BLOCKS['furnace'] = ('furnace_top', 'furnace_top', 'furnace_side')


def tile(sheet_dir, key):
    s, r, c = SRC[key]
    im = Image.open(os.path.join(sheet_dir, SHEETS[s] + '.png')).convert('RGBA')
    x, y = c * PITCH_X + OFF_X, r * PITCH_Y + OFF_Y
    return im.crop((x, y, x + T, y + T))


def main():
    sheet_dir = sys.argv[1]
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
    os.makedirs(os.path.join(root, 'public/textures/mc'), exist_ok=True)
    os.makedirs(os.path.join(root, 'public/generated'), exist_ok=True)

    for base, src in BASE.items():
        tile(sheet_dir, src).save(os.path.join(root, f'public/textures/{base}.png'))

    used = sorted({t for faces in BLOCKS.values() for t in faces})
    for t in used:
        tile(sheet_dir, t).save(os.path.join(root, f'public/textures/mc/{t}.png'))

    blocks = [{'name': n, 'kind': 'cube', 'top': f[0], 'bottom': f[1], 'side': f[2]} for n, f in sorted(BLOCKS.items())]
    with open(os.path.join(root, 'public/generated/blocks.json'), 'w') as f:
        json.dump({'textures': used, 'blocks': blocks}, f, indent=1)
    print(f'{len(BASE)} alap textúra, {len(blocks)} extra blokk, {len(used)} extra textúra')


if __name__ == '__main__':
    main()
