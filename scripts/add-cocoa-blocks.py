#!/usr/bin/env python3
"""A kakaóhüvely 3 fázisának hozzáadása a generált blokkokhoz (public/generated/blocks.json) a Good Vibes textúráiból.
Használat: python3 scripts/add-cocoa-blocks.py <kicsomagolt-csomag>/minecraft/textures/block   (többször is futtatható)
A blokkok a lista végére kerülnek, így a korábbi azonosítók nem csúsznak el."""
import json, shutil, sys

GV = sys.argv[1].rstrip('/') + '/'
d = json.load(open('public/generated/blocks.json'))
tex = lambda n: 'block__' + n
for i in range(3):
    n = f'cocoa_stage{i}'
    shutil.copy(GV + n + '.png', 'public/textures/mc/' + tex(n) + '.png')
    if tex(n) not in d['textures']:
        d['textures'].append(tex(n))
d['textures'].sort()
# [honnan, meddig, tető/alj UV, oldal UV] fázisonként (16x16-os textúra: bal felső a tető, a test a jobb oldalon)
S = [([6, 7, 11], [10, 12, 15], [0, 0, 4, 4], [11, 4, 15, 9]),
     ([5, 5, 9], [11, 12, 15], [0, 0, 6, 4], [9, 4, 15, 11]),
     ([4, 3, 7], [12, 12, 15], [0, 0, 7, 4], [7, 7, 15, 13])]
blocks = [b for b in d['blocks'] if not b['name'].startswith('cocoa_stage')]
for i, (f, t, top, side) in enumerate(S):
    tx = tex(f'cocoa_stage{i}')
    F = lambda uv: {'uv': uv, 'tex': tx}
    blocks.append({'name': f'cocoa_stage{i}', 'kind': 'shape', 'rx': 0, 'ry': 0, 'tinted': False,
                   'parts': [{'from': f, 'to': t, 'faces': {'up': F(top), 'down': F(top), 'north': F(side), 'south': F(side), 'east': F(side), 'west': F(side)}}]})
d['blocks'] = blocks
json.dump(d, open('public/generated/blocks.json', 'w'), separators=(',', ':'))
print('kész:', len(blocks), 'blokk')
