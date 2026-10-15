"""
Génère les versions web optimisées des visuels officiels MADHOUSE.

Les fichiers sources (assets/logo.png, assets/flyer-1.jpg ... flyer-4.jpg)
ne sont jamais modifiés. Ce script crée uniquement des copies redimensionnées
(sans déformation, sans filtre) utilisées par le site pour charger plus vite :

  assets/logo-web.webp      logo 480 px (affiché à 240 px max)
  assets/icon-180.png       icône Apple / favicon haute définition
  assets/favicon-32.png     favicon
  assets/flyer-N.webp       flyers 800 px de large
  assets/og-image.jpg       image de partage social 1200 x 630

Utilisation (depuis la racine du projet) :
  python3 tools/build-images.py

Prérequis : Python 3 + Pillow  (pip3 install Pillow)
À relancer si vous remplacez un logo ou un flyer par une version originale.
"""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
GREEN = (1, 79, 44)  # #014F2C


def resized(img, width):
    """Redimensionne proportionnellement (jamais de déformation)."""
    ratio = width / img.width
    return img.resize((width, round(img.height * ratio)), Image.LANCZOS)


def main():
    logo = Image.open(ASSETS / "logo.png").convert("RGB")
    resized(logo, 480).save(ASSETS / "logo-web.webp", quality=90, method=6)
    resized(logo, 180).save(ASSETS / "icon-180.png", optimize=True)
    resized(logo, 32).save(ASSETS / "favicon-32.png", optimize=True)

    flyers = []
    for i in range(1, 5):
        flyer = Image.open(ASSETS / f"flyer-{i}.jpg").convert("RGB")
        flyers.append(flyer)
        resized(flyer, 800).save(ASSETS / f"flyer-{i}.webp", quality=80, method=6)

    # Image de partage : logo officiel à gauche, deux flyers officiels à droite.
    # Le logo reste sur son fond noir d'origine (panneau noir à gauche).
    og = Image.new("RGB", (1200, 630), GREEN)
    og.paste((0, 0, 0), (0, 0, 600, 630))
    og.paste(resized(logo, 520), (40, 55))
    for flyer, x, angle in ((flyers[1], 625, 5), (flyers[3], 830, -4)):
        poster = resized(flyer, 330)
        poster = poster.rotate(angle, resample=Image.BICUBIC, expand=True, fillcolor=GREEN)
        og.paste(poster, (x, (630 - poster.height) // 2))
    og.save(ASSETS / "og-image.jpg", quality=85, optimize=True, progressive=True)

    print("Images web générées dans", ASSETS)


if __name__ == "__main__":
    main()
