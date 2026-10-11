# Illusztrált Magyar Tarokk 3.0.5 – célkártya-kötelezettség javítása

## Szabálypontosítás

A bemondott figura célkártyájának megfelelő ütésben történő kijátszási kötelezettsége nem írhatja felül a normál színkövetési és tarokk-követési szabályokat. A jogszerű lapok meghatározása történik meg először; a célkártya csak akkor kényszeríthető ki, ha a szokásos szabályok szerint is kijátszható.

- Ha a célkártya a megfelelő ütésben szabályosan kijátszható, akkor azt kell kijátszani.
- Ha a játékosnak színt vagy tarokkot kell követnie, és a célkártya emiatt nem szabályos, a rendszer a normál szabályok szerint kijátszható lapokat engedi.
- A megfelelő ütés előtt a célkártyát továbbra is meg kell őrizni, kivéve, ha a szín-/tarokk-követési szabályok miatt az az egyetlen szabályos kijátszás.
- A szabály a forrásmotorban és a kiadási build által használt motorban is javítva lett.

## Ellenőrzés

- Célkártya-tesztek: 5/5 sikeres.
- Teljes JavaScript-tesztcsomag: 663/663 sikeres.
- A teljes TypeScript-ellenőrzés ebben a körben nem futott le, mert a munkakörnyezetben nincsenek telepítve a fejlesztői függőségek.
