# Illusztrált Tarokk – Render + Neon deployment

Ez a csomag a v2.46-os production-adaptáció. Renderen a Node web service szolgálja ki a `dist/` webklienst, ugyanerről a hostról fut a WebSocket endpoint. A `DATABASE_URL` beállítása esetén a room persistence Neon PostgreSQL-t használ; enélkül lokális JSON storage marad fejlesztéshez.

## 1. GitHub

1. Hozz létre egy üres GitHub repositoryt.
2. A projekt teljes tartalmát töltsd fel a repository gyökerébe.
3. A `render.yaml` maradjon a repository gyökerében.

## 2. Neon

1. Hozz létre egy Neon projektet.
2. Másold ki a PostgreSQL connection stringet.
3. Renderben a `DATABASE_URL` secret értékeként add meg.

A kód automatikusan létrehozza a `tarokk_rooms` táblát első induláskor, külön migration parancs nem szükséges.

## 3. Render

1. Render Dashboard → New → Blueprint.
2. Válaszd ki a GitHub repositoryt.
3. A Blueprint a `render.yaml` alapján hozza létre a web service-t.
4. A `DATABASE_URL` mezőnél illeszd be a Neon connection stringet.
5. A szolgáltatás Frankfurt régióban indul; Neon oldalon válassz lehetőleg közeli európai régiót.
5. A deploy után a Render egy `https://<service>.onrender.com` címet ad.

## 4. Ellenőrzés

- `GET /health` → 200 és `storage: "postgres"`
- `GET /health/db` → 200, ha a Neon adatbázis elérhető
- `https://<service>.onrender.com/` → single-player
- `https://<service>.onrender.com/multiplayer.html` → multiplayer lobby

A multiplayer kliens productionben automatikusan ugyanahhoz a hosthoz kapcsolódik WebSocketen (`wss://.../ws`), ezért nem kell külön `:8787` portot beállítani. Fejlesztői szerver URL továbbra is megadható a `?server=` query paraméterrel.

## 5. Fontos free-tier megjegyzés

A Render Free web service 15 perc bejövő forgalom nélkül leállhat, és az induláskor kb. egy perces felébredési idő lehet. A lokális filesystem nem tartós, ezért production deployhoz a `DATABASE_URL` használata kötelező. A free Render Postgres helyett ebben a projektben Neon kerül használatra, így a release persistence nem a Render ephemeral filesystemre támaszkodik.

## 6. Visszaállás fejlesztői JSON storage-ra

A `DATABASE_URL` törlésével a szerver automatikusan a `.data/rooms` JSON store-t használja.
