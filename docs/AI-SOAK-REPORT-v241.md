# AI Soak Report – v2.41

## Fast stress profile

| Mérőszám | Eredmény |
|---|---:|
| Teljes leosztások | 8/8 |
| Kijátszott lapok | 288 |
| Ütések | 72 |
| Végső hibák | 0 |
| Policy mismatch | 0 |
| Újraosztás | 5 |

A `--fast` profil csökkentett rollout-budgettel fut; célja a motor stabilitásának gyors vizsgálata, nem az Expert játékerejének mérése.

## Full-strength spot check

4 teljes leosztásból 4 jutott el elszámolásig: 144/144 kijátszás, 36/36 ütés, 0 policy mismatch.

## Környezeti korlát

A 32+ teljes-strength soak ezen a fejlesztői környezeten nem zárható le a végrehajtási plafonon belül. Ezért nincs hamis „100 leosztás PASS” állítás a kiadáshoz.
