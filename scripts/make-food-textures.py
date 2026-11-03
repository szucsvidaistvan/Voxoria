#!/usr/bin/env python3
"""Az ételek és mobdropok 16x16-os textúráinak előállítása (nincs hozzájuk kész képfájl a textúracsomagban).
Használat: python3 scripts/make-food-textures.py   ->   public/textures/item/*.png"""
import math, os, random
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'textures', 'item')
N = 16

def shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c)

def blob(base, cx, cy, rx, ry, rot=0.0, seed=1, speck=None, speck_n=0, bone=None, marks=False, holes=0):
    rnd = random.Random(seed)
    img = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    px = img.load()
    cs, sn = math.cos(rot), math.sin(rot)
    inside = set()
    for y in range(N):
        for x in range(N):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            u, v = dx * cs + dy * sn, -dx * sn + dy * cs
            wob = 1 + 0.12 * math.sin(x * 1.7 + seed) * math.cos(y * 1.3 + seed * 2)
            if (u / rx) ** 2 + (v / ry) ** 2 < wob:
                inside.add((x, y))
    for (x, y) in inside:
        # megvilágítás balról fentről
        l = ((cx - x) * 0.5 + (cy - y) * 0.5) / max(rx, ry)
        k = 1.0 + max(-0.28, min(0.28, l * 0.35))
        px[x, y] = shade(base, k) + (255,)
    if speck:
        for _ in range(speck_n):
            x, y = rnd.choice(sorted(inside))
            px[x, y] = speck + (255,)
    if marks:  # grillcsíkok
        for (x, y) in sorted(inside):
            if (x + y) % 5 == 0 and (x * 3 + y) % 4 != 0:
                px[x, y] = shade(base, 0.62) + (255,)
    for _ in range(holes):
        x, y = rnd.choice(sorted(inside))
        px[x, y] = shade(base, 0.55) + (255,)
    if bone:
        for (x, y) in bone:
            px[x, y] = (238, 232, 214, 255)
            if x + 1 < N and px[x + 1, y][3] == 0: px[x + 1, y] = (196, 188, 168, 255)
    # körvonal
    for (x, y) in sorted(inside):
        edge = any((x + dx, y + dy) not in inside for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        if edge:
            px[x, y] = shade(base, 0.45) + (255,)
    return img

def save(name, img):
    img.save(os.path.join(OUT, name + '.png'))

RAW_BEEF, COOKED_BEEF = (192, 62, 62), (132, 82, 46)
RAW_PORK, COOKED_PORK = (234, 152, 152), (190, 122, 72)
RAW_CHICKEN, COOKED_CHICKEN = (236, 198, 172), (204, 142, 72)
RAW_MUTTON, COOKED_MUTTON = (186, 88, 88), (142, 88, 56)

save('raw_beef', blob(RAW_BEEF, 8, 8.5, 6.3, 4.6, -0.5, 1, (238, 204, 196), 9))
save('cooked_beef', blob(COOKED_BEEF, 8, 8.5, 6.3, 4.6, -0.5, 1, marks=True))
save('raw_porkchop', blob(RAW_PORK, 8.5, 8.5, 5.6, 4.8, 0.3, 2, (250, 214, 214), 5, bone=[(5, 7), (5, 8), (6, 8)]))
save('cooked_porkchop', blob(COOKED_PORK, 8.5, 8.5, 5.6, 4.8, 0.3, 2, marks=True, bone=[(5, 7), (5, 8), (6, 8)]))

def drumstick(base, seed, marks=False):
    img = blob(base, 9.5, 6.5, 4.4, 3.8, -0.7, seed, marks=marks)
    px = img.load()
    # csont: a bal alsó sarokban
    for x, y in [(6, 9), (5, 10), (4, 11), (3, 12)]:
        px[x, y] = (238, 232, 214, 255)
        px[x, y + 1] = (196, 188, 168, 255) if px[x, y + 1][3] == 0 else px[x, y + 1]
    for x, y in [(2, 12), (2, 13), (3, 13), (3, 11), (2, 11)]:
        px[x, y] = (238, 232, 214, 255)
    return img
save('raw_chicken', drumstick(RAW_CHICKEN, 3))
save('cooked_chicken', drumstick(COOKED_CHICKEN, 3, True))

def mutton(base, seed, marks=False):
    img = blob(base, 8, 8.5, 5.8, 4.4, 0.6, seed, marks=marks, speck=(236, 222, 210) if not marks else None, speck_n=6)
    px = img.load()
    for x, y in [(11, 5), (12, 4)]:
        px[x, y] = (238, 232, 214, 255)
    return img
save('raw_mutton', mutton(RAW_MUTTON, 4))
save('cooked_mutton', mutton(COOKED_MUTTON, 4, True))

save('rotten_flesh', blob((112, 128, 62), 8, 8.5, 6.0, 4.4, -0.3, 6, (84, 96, 44), 8, holes=7))

# puskapor: szürke halom
rnd = random.Random(7)
g = Image.new('RGBA', (N, N), (0, 0, 0, 0))
gp = g.load()
for y in range(5, 14):
    half = (y - 4) * 0.9
    for x in range(N):
        if abs(x - 8) <= half and rnd.random() < 0.95:
            v = rnd.randint(88, 168)
            gp[x, y] = (v, v, v + 4, 255)
for y in range(N):
    for x in range(N):
        if gp[x, y][3] and any(0 <= x + dx < N and 0 <= y + dy < N and gp[x + dx, y + dy][3] == 0 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            gp[x, y] = (52, 52, 56, 255)
save('gunpowder', g)
print('ok')
