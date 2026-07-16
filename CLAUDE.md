# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SECTOR 9 — a retro 2D top-down browser shooter. Vanilla JS + Canvas, **no build step, no dependencies, no test framework**. The game must keep working when opened directly via `file://` (double-clicking `index.html`), which imposes hard constraints:

- No ES modules — files are plain `<script>` tags loaded in dependency order in `index.html` (audio → assets → entities → levels → game). Everything is shared through globals.
- No `fetch()`, no `getImageData()`/`toDataURL()` (canvas is tainted by file:// images), no CDN/external fonts. Images load via `Image` objects only; sounds are synthesized with Web Audio.

## Commands

```powershell
# Run the game
Start-Process index.html

# Syntax-check after editing (only automated check available)
Get-ChildItem js\*.js | ForEach-Object { node --check $_.FullName }
```

### Verifying changes headlessly

Game states can be screenshotted with headless Chrome. Two Windows-specific gotchas: use `Start-Process -Wait` (a bare `&` invocation returns before Chrome finishes and parallel runs race on the profile — screenshots silently fail), and give each run its own `--user-data-dir`. `--virtual-time-budget` does not advance `performance.now()`, so use the `?sim=N` param to step game time instead.

```powershell
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
Start-Process -Wait -FilePath $chrome -ArgumentList @('--headless','--disable-gpu',
  "--user-data-dir=$env:TEMP\prof$(Get-Random)",'--window-size=1000,700',
  '--virtual-time-budget=3000',"--screenshot=$env:TEMP\shot.png",
  '"file:///C:/Users/wongj/OneDrive/Documents/AI_test/topdown-shooter/index.html?autostart=1&sim=7&fire=1"')
```

Debug URL params (handled in `game.js` boot + `confirmAction`): `?autostart=1` skip menu, `&level=N`/`&wave=N` jump ahead (level 5 wave 3 = boss), `&sim=S` synchronously step S seconds of gameplay on load, `&fire=1` hold fire during sim, `&nospawn=1` empty all waves (marches through to the win screen). A runtime JS error paints a red banner on the canvas and sets `document.title` to `SECTOR 9 [ERR]`. `window.G` exposes the full game state in the console.

## Git workflow (standing user instruction)

Commit with a clear message and push to `origin` (private repo `github.com/Xaaa06/sector9`, branch `main`) after every meaningful change. The user relies on this history to roll back.

## Architecture

`js/game.js` is the orchestrator: an IIFE owning the canvas, input listeners, the state machine (`loading → menu → intro → playing ⇄ paused → clear → next level … gameover/win`), wave spawning, all collision resolution, HUD/screen rendering, and prerendered layers (floor+walls `bgCanvas`, vignette, scanlines — rebuilt only in `buildLayers()`). Global game state lives in its `G` object.

Entities (`js/entities.js`) never touch the DOM or global state directly — they receive the `G` object ("game") in `update(dt, game)` and call back into `game.shake / addScore / onEnemyKilled / spawnEnemyAtEdge` and push into `game.bullets/particles/corpses`. All enemy behavior is data-driven from `ENEMY_TYPES` (one `Enemy` class; `boss: true` routes to `updateBoss`). Balance numbers (hp/speed/score/damage/drop rates) live in `ENEMY_TYPES`, `Player`, and the drop rolls in `G.onEnemyKilled`.

Sprites are single-pose PNGs from Kenney's CC0 pack (facing right = angle 0); all animation is code-composed (rotation, feet + bob, muzzle flash, white-tint hit flash via `tintedImage`, particle deaths). Per-sprite pivot/muzzle offsets are declared in `SPR` (`js/assets.js`) — if a sprite is added, it needs an entry there, in `IMAGE_NAMES` (`game.js`), and a PNG in `assets/`.

Progression content is declarative: `js/levels.js` is just `LEVELS = [{name, waves: [{enemyType: count}, …]}, …]`. Adding a level or rebalancing waves requires no logic changes; level-clear bonus and spawn stagger scale off the level index in `game.js`.

`localStorage` keys: `sector9_hs` (high score), `sector9_muted`.
