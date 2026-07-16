# SECTOR 9

A retro 2D top-down shooter that runs straight in the browser — no build step,
no server needed. Just open `index.html`.

## Controls

| Input | Action |
|-------|--------|
| Arrow keys / WASD | Move |
| Mouse | Aim |
| Click (hold) | Shoot |
| P / Esc | Pause |
| M | Mute |

## The game

Clear all 5 levels, each with 3 waves of enemies converging from every side:

- **Zombie** (100 pts) — slow, hits hard up close
- **Runner** (150 pts) — fast and frail
- **Soldier** (250 pts) — keeps its distance and shoots back
- **Tank** (400 pts) — slow, heavily armored
- **The Machine** (2000 pts) — level 5 boss: radial bullet sprays, charge attacks, spawns minions

Enemies sometimes drop medkits (+30 HP) or a machine-gun powerup (10 s of
rapid fire). High score is saved locally.

## Debug/test URL params

`?autostart=1` skip menu · `&level=N` jump to level N · `&wave=N` jump to wave ·
`&sim=S` fast-forward S seconds · `&fire=1` hold fire during sim · `&nospawn=1` empty waves

## Credits

Sprites: [Kenney — Top-down Shooter pack](https://kenney.nl/assets/top-down-shooter) (CC0).
Sound effects are synthesized at runtime with the Web Audio API.
