# Illusztrált Tarokk 2.98.0 – csendes Sas Ultimó és eseménynapló

## Javítások

- A csendes Sas Ultimó teljesítését a Sas játékosának párja is teljesítheti: a kilencedik ütés győztesének ugyanazon az oldalon kell állnia, mint a Sas kijátszójának. Az elszámolás így az ellenpárnak írja jóvá a teljesült csendes figurát is.
- A kapcsolódó Uhu/Ultimó állapotértékelés szintén pár-/oldalszinten vizsgálja az utolsó ütést.
- A multiplayer eseménynapló legfeljebb 100 eseményt őriz, ad vissza és jelenít meg.
- A lapkijátszás naplóbejegyzése nem írja ki a lap értékét vagy színét; csak a játékos neve és a „Kijátszott egy lapot” szöveg jelenik meg.
- A single-player napló ugyanezt a lapvédelmet alkalmazza, és legfeljebb 100 bejegyzést mutat.
- A frissítés verziózott URL-jei 2.98.0-ra változtak a gyorsítótár okozta régi JavaScript elkerülésére.

## Telepítés

Készíts biztonsági másolatot a jelenlegi projektről. A javítócsomag a 2.96-os projektfájlokra épül, és az azóta elkészült 2.97-es javításokat is tartalmazza. Csomagold ki a projekt gyökérkönyvtárába a fájlok felülírásának engedélyezésével, töltsd fel a módosításokat GitHubra, majd várd meg a Render sikeres deploymentjét. A build újragenerálja a `dist/` kimenetet.
