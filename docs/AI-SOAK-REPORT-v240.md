# AI Soak Report – v2.40

## Fejlesztői 16-leosztásos minta

| Mérőszám | Eredmény |
|---|---:|
| Teljes leosztások | 16/16 |
| Végső hibák | 0 |
| Kijátszott lapok | 576 |
| Ütések | 144 |
| Újraosztás | 1 |
| Bemondási kísérlet | 5 |
| Sikeres bemondás | 3 |
| Sikertelen bemondás | 2 |
| Bemondási sikerarány | 60.0% |
| Policy mismatch | 0 |
| Silent figure siker | 5 |
| Silent figure bukás | 0 |
| Túlvezérlési arány | 23.53% |
| Partneri ütésátadás | 46.27% |
| Felvevői win-rate | 18.75% |
| Átlagos felvevői settlement | 24.94 |

### Deklarációk

| Figura | Kísérlet | Siker | Bukás |
|---|---:|---:|---:|
| Sas Uhu | 3 | 2 | 1 |
| Pagát Uhu | 1 | 1 | 0 |
| Kismadár | 1 | 0 | 1 |

A 16-os minta már jelzett egy konkrét további kalibrációs pontot: **Kismadár** esetén a jelenlegi egyetlen megfigyelt deklaráció sikertelen volt. Egyetlen esetből nem vonunk általános következtetést, de a figura további expert-szcenáriókkal és nagyobb soak-mintával külön ellenőrzendő.

## Futási korlát

A standard soak runner 100–1000 leosztást fogad. A jelenlegi fejlesztői környezetben a 32-es és 100-as futtatás a 220/300 másodperces végrehajtási korlátba ütközött; ezért ezekre nincs lezárt benchmarkeredmény. A runner maga elkészült és determinisztikus.
