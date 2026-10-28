#!/usr/bin/env python3
"""Генерація зображення через fal + конвеєр доведення тайла до стикування.

Ключ береться ЛИШЕ з середовища (FAL_KEY) і ніде не друкується.
Запускається з art.yml, тобто з секрету GitHub Actions.

Заміряно чатом Сайту 22.10.2026. Числа й метод:
brain/Передача/03-zamir-grafiky.md
"""
import json, os, sys, urllib.request
import numpy as np
from PIL import Image

FAL = "https://fal.run/"


def generate(endpoint, payload, out_path):
    key = os.environ.get("FAL_KEY")
    if not key:
        sys.exit("FAL_KEY не заданий у середовищі")
    req = urllib.request.Request(
        FAL + endpoint,
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Key {key}", "Content-Type": "application/json"},
    )
    d = json.load(urllib.request.urlopen(req, timeout=180))
    img = (d.get("images") or [d.get("image")])[0]
    urllib.request.urlretrieve(img["url"], out_path)
    return out_path


def generate_batch(spec, name):
    """Пакет: кожен пункт — окремий виклик, усі зображення зберігаються як WebP.

    Падіння одного пункту не зупиняє решту, але порожній результат — помилка
    (закон 4: мовчання на межі — не факт).
    """
    key = os.environ.get("FAL_KEY")
    if not key:
        sys.exit("FAL_KEY не заданий у середовищі")
    out_dir = f"art/out/{name}"
    os.makedirs(out_dir, exist_ok=True)
    saved, failed = 0, []
    for item in spec["batch"]:
        endpoint = item.get("endpoint", spec.get("endpoint", "fal-ai/flux/schnell"))
        try:
            req = urllib.request.Request(
                FAL + endpoint, data=json.dumps(item["payload"]).encode(),
                headers={"Authorization": f"Key {key}", "Content-Type": "application/json"})
            d = json.load(urllib.request.urlopen(req, timeout=300))
            imgs = d.get("images") or [d.get("image")]
            for i, img in enumerate(imgs):
                tmp = f"{out_dir}/_tmp.png"
                urllib.request.urlretrieve(img["url"], tmp)
                Image.open(tmp).convert("RGB").save(f"{out_dir}/{item['name']}_{i}.webp", quality=88)
                os.remove(tmp)
                saved += 1
            print(f"OK   {item['name']}: {len(imgs)} шт. ({endpoint})")
        except Exception as e:  # noqa: BLE001 — звіт про будь-який збій пункту
            failed.append(item["name"])
            print(f"FAIL {item['name']}: {type(e).__name__}: {str(e)[:200]}")
    print(f"збережено {saved}, впало {len(failed)}: {failed}")
    if saved == 0:
        sys.exit("жодного зображення — пакет провалено")


def seam_report(a):
    """Шов проти внутрішнього шуму + зсув рамки.

    🔴 Друга умова не декоративна. Без неї замір бреше: FLUX малює темну
    рамку по всьому периметру, обидва краї однаково темні, різниця між
    ними мала — і тайл, який НЕ стикується, читається як «стикується».
    Заміряно: сирий тайл дав шов 3.6, після зрізання рамки — 43.6.
    """
    a = a.astype(np.int16)
    lr = float(np.abs(a[:, 0, :3] - a[:, -1, :3]).mean())
    tb = float(np.abs(a[0, :, :3] - a[-1, :, :3]).mean())
    m = a.shape[1] // 2
    ilr = float(np.abs(a[:, m, :3] - a[:, m + 1, :3]).mean())
    m = a.shape[0] // 2
    itb = float(np.abs(a[m, :, :3] - a[m + 1, :, :3]).mean())
    e = np.concatenate([a[:2].reshape(-1, 3), a[-2:].reshape(-1, 3),
                        a[:, :2].reshape(-1, 3), a[:, -2:].reshape(-1, 3)])
    c = a[a.shape[0] // 4:-a.shape[0] // 4, a.shape[1] // 4:-a.shape[1] // 4].reshape(-1, 3)
    bias = float(c.mean() - e.mean())
    ok = lr <= ilr * 1.5 and tb <= itb * 1.5 and abs(bias) < 8
    return {"seam_lr": lr, "seam_tb": tb, "inner_lr": ilr, "inner_tb": itb,
            "border_bias": bias, "tiles": ok}


def to_tile(src, dst, tile=32, colors=16, crop=0.10):
    a = np.array(Image.open(src).convert("RGB"))
    h, w, _ = a.shape
    m = int(h * crop)
    a = a[m:h - m, m:w - m]                                   # зрізати темну рамку
    im = Image.fromarray(a).resize((tile, tile), Image.BOX)    # на точну сітку
    im = im.quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.NONE).convert("RGB")
    b = np.array(im).astype(np.int16)
    for _ in range(2):                                         # зшити краї
        d = (b[:, 0, :] - b[:, -1, :]) // 2
        b[:, 0, :] -= d; b[:, -1, :] += d
        d = (b[0, :, :] - b[-1, :, :]) // 2
        b[0, :, :] -= d; b[-1, :, :] += d
    b = np.clip(b, 0, 255).astype(np.uint8)
    # 🔴 перезвести палітру ПІСЛЯ зшивання: зшивання створює значення поза
    # палітрою і роздуває її (заміряно: 12 -> 99 кольорів).
    b = np.array(Image.fromarray(b).quantize(colors=colors, method=Image.MEDIANCUT,
                                             dither=Image.NONE).convert("RGB"))
    Image.fromarray(b).save(dst)
    Image.fromarray(np.tile(b, (3, 3, 1))).resize((tile * 18, tile * 18), Image.NEAREST) \
        .save(dst.replace(".png", "_3x3.png"))
    return seam_report(b)


def main():
    spec = json.load(open(sys.argv[1]))
    name = os.path.splitext(os.path.basename(sys.argv[1]))[0]
    os.makedirs("art/out", exist_ok=True)
    if "batch" in spec:
        generate_batch(spec, name)
        print("ГОТОВО")
        return
    raw = f"art/out/{name}_raw.png"

    generate(spec.get("endpoint", "fal-ai/flux/schnell"), spec["payload"], raw)
    print(f"згенеровано: {raw}")

    if spec.get("tile"):
        final = f"art/out/{name}.png"
        r = to_tile(raw, final, tile=spec.get("tile_size", 32),
                    colors=spec.get("colors", 16))
        print(json.dumps(r, indent=2, ensure_ascii=False))
        if not r["tiles"]:
            print("::warning::Тайл не стикується після конвеєра. "
                  "Геометрію код лагодить, малюнок — ні. Див. 03-zamir-grafiky.md")
    print("ГОТОВО")


if __name__ == "__main__":
    main()
