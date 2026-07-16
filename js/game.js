// SECTOR 9 — main loop, state machine, input, spawning, collisions, HUD.
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const WALL = 32;
  const arena = { x: WALL, y: WALL, w: W - WALL * 2, h: H - WALL * 2 };
  const CRATES = [
    { x: 116, y: 116, r: 25, rot: 0.15 },
    { x: W - 116, y: 116, r: 25, rot: -0.4 },
    { x: 116, y: H - 116, r: 25, rot: 0.9 },
    { x: W - 116, y: H - 116, r: 25, rot: -0.1 },
  ];
  const MUTE_RECT = { x: W - 54, y: H - 46, w: 40, h: 34 };
  const FONT = '"Courier New", ui-monospace, monospace';

  // ------------------------------------------------------------- input
  const input = { left: false, right: false, up: false, down: false, mouseX: W / 2 + 140, mouseY: H / 2 - 60, mouseDown: false };

  function keyFlag(code, val) {
    switch (code) {
      case 'ArrowLeft': case 'KeyA': input.left = val; return true;
      case 'ArrowRight': case 'KeyD': input.right = val; return true;
      case 'ArrowUp': case 'KeyW': input.up = val; return true;
      case 'ArrowDown': case 'KeyS': input.down = val; return true;
    }
    return false;
  }

  window.addEventListener('keydown', (e) => {
    SFX.unlock();
    if (keyFlag(e.code, true)) { e.preventDefault(); return; }
    if (e.code === 'KeyM') { SFX.toggleMute(); return; }
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (G.state === 'playing') { G.state = 'paused'; SFX.click(); }
      else if (G.state === 'paused') { G.state = 'playing'; SFX.click(); }
      else if (G.state === 'gameover' && e.code === 'Escape') { goMenu(); }
      return;
    }
    if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); confirmAction(); }
  });
  window.addEventListener('keyup', (e) => keyFlag(e.code, false));

  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  }
  canvas.addEventListener('mousemove', (e) => {
    const p = toCanvas(e);
    input.mouseX = p.x; input.mouseY = p.y;
  });
  canvas.addEventListener('mousedown', (e) => {
    SFX.unlock();
    const p = toCanvas(e);
    input.mouseX = p.x; input.mouseY = p.y;
    if (p.x >= MUTE_RECT.x && p.x <= MUTE_RECT.x + MUTE_RECT.w &&
        p.y >= MUTE_RECT.y && p.y <= MUTE_RECT.y + MUTE_RECT.h) {
      SFX.toggleMute(); SFX.click();
      return;
    }
    input.mouseDown = true;
    confirmAction();
  });
  window.addEventListener('mouseup', () => { input.mouseDown = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ------------------------------------------------------------- game state
  let highScore = 0;
  try { highScore = +localStorage.getItem('sector9_hs') || 0; } catch (e) {}

  const G = {
    state: 'loading',
    time: 0,
    stateT: 0,
    player: null,
    enemies: [], bullets: [], particles: [], corpses: [], pickups: [], popups: [],
    levelIdx: 0, waveIdx: 0,
    spawnQueue: [], spawnT: 0, waveGapT: 0,
    score: 0,
    newRecord: false,
    shakeT: 0, shakeMag: 0,
    hurtFlash: 0,
    bannerT: 0, bannerText: '', bannerSub: '',
    bossRef: null,
    arena, input,

    shake(mag) { this.shakeMag = Math.max(this.shakeMag, mag); this.shakeT = 0.3; },

    addScore(n, x, y) {
      this.score += n;
      this.popups.push({ x, y: y - 14, text: '+' + n, life: 0.9, maxLife: 0.9 });
    },

    onEnemyKilled(e) {
      if (e.def.boss) {
        this.bossRef = null;
        // the machine goes down: every remaining hostile detonates with it
        for (const other of this.enemies) {
          if (other !== e && !other.dead) { other.hp = 0; other.die(this); }
        }
        return;
      }
      const p = Math.random();
      if (p < 0.10) this.pickups.push(new Pickup('health', e.x, e.y));
      else if (p < 0.17) this.pickups.push(new Pickup('machine', e.x, e.y));
    },

    spawnEnemyAtEdge(type) {
      const t = ENEMY_TYPES[type];
      const side = Math.floor(rand(0, 4));
      let x, y;
      if (side === 0) { x = rand(arena.x + 40, arena.x + arena.w - 40); y = arena.y + t.r + 4; }
      else if (side === 1) { x = rand(arena.x + 40, arena.x + arena.w - 40); y = arena.y + arena.h - t.r - 4; }
      else if (side === 2) { x = arena.x + t.r + 4; y = rand(arena.y + 40, arena.y + arena.h - 40); }
      else { x = arena.x + arena.w - t.r - 4; y = rand(arena.y + 40, arena.y + arena.h - 40); }
      if (t.boss) { x = W / 2; y = arena.y + 90; }
      const e = new Enemy(type, x, y);
      this.enemies.push(e);
      spawnBurst(this.particles, x, y, t.boss ? '#ff5030' : '#8fd7ff', t.boss ? 40 : 12, t.boss ? 260 : 140);
      if (t.boss) { this.bossRef = e; this.shake(10); }
      return e;
    },
  };
  window.G = G; // console-debug handle

  // Test/debug hooks: ?autostart=1  ?level=3  ?wave=2  ?nospawn=1
  const params = new URLSearchParams(location.search);
  const testLevel = clamp((+params.get('level') || 1) - 1, 0, LEVELS.length - 1);
  const testWave = clamp((+params.get('wave') || 1) - 1, 0, 2);
  const noSpawn = params.get('nospawn') === '1';

  let lastError = null;
  window.onerror = (msg, src, line) => {
    lastError = msg + ' @ ' + (src || '').split('/').pop() + ':' + line;
    document.title = 'SECTOR 9 [ERR]';
  };

  // ------------------------------------------------------------- flow
  function confirmAction() {
    switch (G.state) {
      case 'menu': SFX.click(); startGame(params.get('level') ? testLevel : 0); break;
      case 'intro': beginWave(params.get('wave') && G.levelIdx === testLevel ? testWave : 0); break;
      case 'clear': if (G.stateT > 0.5) nextLevel(); break;
      case 'gameover': if (G.stateT > 0.8) { SFX.click(); startGame(0); } break;
      case 'win': if (G.stateT > 0.8) { SFX.click(); goMenu(); } break;
      case 'paused': G.state = 'playing'; break;
    }
  }

  function goMenu() { G.state = 'menu'; G.stateT = 0; }

  function startGame(levelIdx) {
    G.score = 0;
    G.newRecord = false;
    G.player = new Player(W / 2, H / 2);
    startLevel(levelIdx);
  }

  function startLevel(i) {
    G.levelIdx = i;
    G.enemies = []; G.bullets = []; G.pickups = []; G.corpses = []; G.popups = [];
    G.bossRef = null;
    G.state = 'intro';
    G.stateT = 0;
    SFX.wave();
  }

  function beginWave(w) {
    G.state = 'playing';
    G.stateT = 0;
    G.waveIdx = w;
    G.spawnQueue = [];
    const wave = LEVELS[G.levelIdx].waves[w];
    for (const type in wave) for (let i = 0; i < wave[type]; i++) G.spawnQueue.push(type);
    // shuffle so mixed waves interleave
    for (let i = G.spawnQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [G.spawnQueue[i], G.spawnQueue[j]] = [G.spawnQueue[j], G.spawnQueue[i]];
    }
    if (noSpawn) G.spawnQueue = [];
    G.spawnT = 0.4;
    const boss = 'boss' in wave;
    G.bannerText = boss ? 'WARNING' : 'WAVE ' + (w + 1) + '/' + LEVELS[G.levelIdx].waves.length;
    G.bannerSub = boss ? 'HUGE SIGNAL APPROACHING' : '';
    G.bannerT = boss ? 2.4 : 1.6;
    boss ? SFX.bossAlarm() : SFX.wave();
  }

  function levelCleared() {
    G.state = 'clear';
    G.stateT = 0;
    G.levelBonus = 300 + G.levelIdx * 200;
    G.score += G.levelBonus;
    SFX.levelUp();
  }

  function nextLevel() {
    if (G.levelIdx + 1 < LEVELS.length) startLevel(G.levelIdx + 1);
    else winGame();
  }

  function winGame() {
    G.state = 'win';
    G.stateT = 0;
    saveScore();
    SFX.win();
  }

  function gameOver() {
    G.state = 'gameover';
    G.stateT = 0;
    spawnBurst(G.particles, G.player.x, G.player.y, '#d43a3a', 40, 260);
    G.shake(12);
    saveScore();
    SFX.gameOver();
  }

  function saveScore() {
    if (G.score > highScore) {
      highScore = G.score;
      G.newRecord = true;
      try { localStorage.setItem('sector9_hs', String(highScore)); } catch (e) {}
    }
  }

  // ------------------------------------------------------------- update
  function update(dt) {
    G.time += dt;
    G.stateT += dt;
    G.shakeT = Math.max(0, G.shakeT - dt);
    if (G.shakeT <= 0) G.shakeMag = 0;
    G.hurtFlash = Math.max(0, G.hurtFlash - dt * 1.4);
    G.bannerT = Math.max(0, G.bannerT - dt);

    if (G.state === 'playing') updatePlaying(dt);
    else if (G.state === 'intro') {
      if (G.stateT > 2.2) beginWave(params.get('wave') && G.levelIdx === testLevel ? testWave : 0);
    } else if (G.state === 'clear') {
      updateParticles(G.particles, dt);
      if (G.stateT > 2.8) nextLevel();
    } else if (G.state === 'gameover' || G.state === 'win') {
      updateParticles(G.particles, dt);
    }
    updatePopups(dt);
    updateCorpses(dt);
  }

  function updatePlaying(dt) {
    const P = G.player;
    P.update(dt, G);

    // staggered wave spawning
    if (G.spawnQueue.length > 0) {
      G.spawnT -= dt;
      if (G.spawnT <= 0) {
        G.spawnEnemyAtEdge(G.spawnQueue.pop());
        G.spawnT = clamp(0.5 - G.levelIdx * 0.06, 0.18, 0.5);
      }
    }

    for (const e of G.enemies) e.update(dt, G);
    for (const b of G.bullets) b.update(dt);
    for (const pk of G.pickups) pk.update(dt);
    updateParticles(G.particles, dt);

    resolveCollisions(dt);

    // prune the dead
    G.enemies = G.enemies.filter((e) => !e.dead);
    G.bullets = G.bullets.filter((b) => !b.dead);
    G.pickups = G.pickups.filter((pk) => !pk.dead);

    if (P.hp <= 0) { gameOver(); return; }

    // wave / level completion
    if (G.spawnQueue.length === 0 && G.enemies.length === 0) {
      G.waveGapT += dt;
      if (G.waveGapT > 1.0) {
        G.waveGapT = 0;
        if (G.waveIdx + 1 < LEVELS[G.levelIdx].waves.length) beginWave(G.waveIdx + 1);
        else levelCleared();
      }
    } else {
      G.waveGapT = 0;
    }
  }

  function circlePush(e, cx, cy, cr) {
    const d = dist(e.x, e.y, cx, cy);
    const min = cr + e.r;
    if (d < min && d > 0.001) {
      const f = (min - d) / d;
      e.x += (e.x - cx) * f;
      e.y += (e.y - cy) * f;
    }
  }

  function resolveCollisions(dt) {
    const P = G.player;

    // bullets: walls, crates, targets
    for (const b of G.bullets) {
      if (b.dead) continue;
      if (b.x < arena.x + 2 || b.x > arena.x + arena.w - 2 || b.y < arena.y + 2 || b.y > arena.y + arena.h - 2) {
        b.dead = true;
        spawnBurst(G.particles, b.x, b.y, '#9a6a3a', 3, 60);
        continue;
      }
      let hitCrate = false;
      for (const c of CRATES) {
        if (dist(b.x, b.y, c.x, c.y) < c.r) {
          b.dead = true; hitCrate = true;
          spawnBurst(G.particles, b.x, b.y, '#b08040', 4, 80);
          break;
        }
      }
      if (hitCrate) continue;

      if (b.friendly) {
        for (const e of G.enemies) {
          if (e.dead) continue;
          if (dist(b.x, b.y, e.x, e.y) < b.r + e.r) {
            b.dead = true;
            e.hit(b.dmg, Math.atan2(b.vy, b.vx), G);
            break;
          }
        }
      } else if (P.hp > 0 && dist(b.x, b.y, P.x, P.y) < b.r + P.r - 2) {
        b.dead = true;
        P.takeDamage(b.dmg, G);
      }
    }

    // enemy contact damage + knockback
    for (const e of G.enemies) {
      if (e.dead) continue;
      if (e.touchCd <= 0 && dist(e.x, e.y, P.x, P.y) < e.r + P.r - 2) {
        e.touchCd = 0.9;
        P.takeDamage(e.def.touchDmg, G);
        const ang = Math.atan2(P.y - e.y, P.x - e.x);
        P.x += Math.cos(ang) * 10;
        P.y += Math.sin(ang) * 10;
      }
    }

    // enemy separation (boss shoves, others share the push)
    for (let i = 0; i < G.enemies.length; i++) {
      for (let j = i + 1; j < G.enemies.length; j++) {
        const a = G.enemies[i], b2 = G.enemies[j];
        const d = dist(a.x, a.y, b2.x, b2.y);
        const min = a.r + b2.r;
        if (d < min && d > 0.001) {
          const push = (min - d) / d * 0.5;
          const wa = a.def.boss ? 0 : 1, wb = b2.def.boss ? 0 : 1;
          a.x -= (b2.x - a.x) * push * wa; a.y -= (b2.y - a.y) * push * wa;
          b2.x += (b2.x - a.x) * push * wb; b2.y += (b2.y - a.y) * push * wb;
        }
      }
    }

    // crates block movement
    for (const c of CRATES) {
      circlePush(P, c.x, c.y, c.r);
      for (const e of G.enemies) circlePush(e, c.x, c.y, c.r);
    }

    // pickups
    for (const pk of G.pickups) {
      if (!pk.dead && dist(pk.x, pk.y, P.x, P.y) < pk.r + P.r) {
        pk.dead = true;
        if (pk.type === 'health') {
          P.hp = Math.min(P.maxHp, P.hp + 30);
          G.popups.push({ x: P.x, y: P.y - 24, text: '+30 HP', life: 0.9, maxLife: 0.9 });
          SFX.pickup();
        } else {
          P.weapon = 'machine';
          P.machineT = 10;
          G.popups.push({ x: P.x, y: P.y - 24, text: 'MACHINE GUN!', life: 1.1, maxLife: 1.1 });
          SFX.powerup();
        }
      }
    }
  }

  function updatePopups(dt) {
    for (let i = G.popups.length - 1; i >= 0; i--) {
      const p = G.popups[i];
      p.y -= 30 * dt;
      p.life -= dt;
      if (p.life <= 0) G.popups.splice(i, 1);
    }
  }

  function updateCorpses(dt) {
    for (let i = G.corpses.length - 1; i >= 0; i--) {
      G.corpses[i].t -= dt;
      if (G.corpses[i].t <= 0) G.corpses.splice(i, 1);
    }
  }

  // ------------------------------------------------------------- prerendered layers
  let bgCanvas, vigCanvas, scanCanvas;

  function mulberry32(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildLayers() {
    // floor + walls
    bgCanvas = document.createElement('canvas');
    bgCanvas.width = W; bgCanvas.height = H;
    const g = bgCanvas.getContext('2d');
    const rng = mulberry32(9);
    // weighted toward the subtle accents (dot, ring); line markings stay rare
    const accents = ['floor_m4', 'floor_m4', 'floor_m4', 'floor_m3', 'floor_m3', 'floor_m1', 'floor_m2'];
    const TS = 64;
    for (let gy = 0; gy < H / TS; gy++) {
      for (let gx = 0; gx < W / TS; gx++) {
        let img = ASSETS.images.floor;
        const roll = rng();
        if (roll < 0.05) img = ASSETS.images[accents[Math.floor(rng() * accents.length)]];
        const rot = Math.floor(rng() * 4) * Math.PI / 2;
        g.save();
        g.translate(gx * TS + TS / 2, gy * TS + TS / 2);
        g.rotate(rot);
        g.drawImage(img, -TS / 2, -TS / 2, TS, TS);
        g.restore();
      }
    }
    // ambient dirt blotches
    for (let i = 0; i < 26; i++) {
      g.fillStyle = 'rgba(0,0,0,' + (0.04 + rng() * 0.07) + ')';
      g.beginPath();
      g.ellipse(rng() * W, rng() * H, 14 + rng() * 46, 10 + rng() * 30, rng() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // brick wall ring
    const wallImg = ASSETS.images.wall;
    for (let x = 0; x < W; x += WALL) {
      g.drawImage(wallImg, x, 0, WALL, WALL);
      g.drawImage(wallImg, x, H - WALL, WALL, WALL);
    }
    for (let y = 0; y < H; y += WALL) {
      g.drawImage(wallImg, 0, y, WALL, WALL);
      g.drawImage(wallImg, W - WALL, y, WALL, WALL);
    }
    // inner wall shadow
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 6;
    g.strokeRect(WALL + 3, WALL + 3, arena.w - 6, arena.h - 6);
    // crates (baked; they never move)
    for (const c of CRATES) {
      g.save();
      g.translate(c.x, c.y);
      g.rotate(c.rot);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.ellipse(3, 5, c.r + 3, c.r, 0, 0, Math.PI * 2);
      g.fill();
      g.drawImage(ASSETS.images.crate, -c.r - 2, -c.r - 2, (c.r + 2) * 2, (c.r + 2) * 2);
      g.restore();
    }

    // vignette
    vigCanvas = document.createElement('canvas');
    vigCanvas.width = W; vigCanvas.height = H;
    const vg = vigCanvas.getContext('2d');
    const grad = vg.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.95);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.5)');
    vg.fillStyle = grad;
    vg.fillRect(0, 0, W, H);

    // scanlines
    scanCanvas = document.createElement('canvas');
    scanCanvas.width = W; scanCanvas.height = H;
    const sg = scanCanvas.getContext('2d');
    sg.fillStyle = 'rgba(0,0,0,0.10)';
    for (let y = 0; y < H; y += 3) sg.fillRect(0, y, W, 1);
  }

  // ------------------------------------------------------------- text helpers
  function txt(str, x, y, size, color, align, shadow) {
    ctx.font = '700 ' + size + 'px ' + FONT;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    if (shadow !== false) {
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillText(str, x + Math.max(1, size * 0.06), y + Math.max(1, size * 0.06));
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function dimScreen(alpha) {
    ctx.fillStyle = 'rgba(5,7,12,' + alpha + ')';
    ctx.fillRect(0, 0, W, H);
  }

  // ------------------------------------------------------------- draw
  function draw() {
    ctx.save();
    if (G.shakeMag > 0) {
      ctx.translate(rand(-G.shakeMag, G.shakeMag) * (G.shakeT / 0.3), rand(-G.shakeMag, G.shakeMag) * (G.shakeT / 0.3));
    }

    ctx.drawImage(bgCanvas, 0, 0);

    if (G.state !== 'menu') drawWorld();

    ctx.restore();

    switch (G.state) {
      case 'menu': drawMenu(); break;
      case 'intro': drawIntro(); break;
      case 'playing': drawHud(); break;
      case 'paused': drawHud(); drawPaused(); break;
      case 'clear': drawHud(); drawClear(); break;
      case 'gameover': drawGameOver(); break;
      case 'win': drawWin(); break;
    }

    ctx.drawImage(vigCanvas, 0, 0);
    ctx.drawImage(scanCanvas, 0, 0);

    // hurt flash
    if (G.hurtFlash > 0) {
      ctx.fillStyle = 'rgba(200,30,30,' + (G.hurtFlash * 0.35) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    drawMuteIcon();
    drawCrosshair();

    if (lastError) {
      ctx.fillStyle = 'rgba(120,0,0,0.9)';
      ctx.fillRect(8, 8, W - 16, 26);
      txt('JS ERROR: ' + lastError, 14, 21, 13, '#fff', 'left');
    }
  }

  function drawWorld() {
    // corpses fade out on the floor
    for (const c of G.corpses) {
      ctx.globalAlpha = clamp(c.t / 2, 0, 0.85);
      drawSprite(ctx, c.def, c.x, c.y, c.angle, c.scale);
    }
    ctx.globalAlpha = 1;

    for (const pk of G.pickups) pk.draw(ctx);
    for (const e of G.enemies) e.draw(ctx);
    if (G.player && G.state !== 'gameover') G.player.draw(ctx);
    for (const b of G.bullets) b.draw(ctx);
    drawParticles(ctx, G.particles);

    // floating score popups
    for (const p of G.popups) {
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      txt(p.text, p.x, p.y, 14, '#ffd75e');
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------- HUD
  function drawHud() {
    const P = G.player;
    // health bar
    txt('HP', 44, 22, 13, '#8fa3b8', 'left');
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(70, 14, 184, 16);
    const pct = clamp(P.hp / P.maxHp, 0, 1);
    ctx.fillStyle = pct > 0.5 ? '#57c458' : pct > 0.25 ? '#d8b04a' : '#d43a3a';
    ctx.fillRect(72, 16, 180 * pct, 12);
    ctx.strokeStyle = '#3a4656';
    ctx.strokeRect(70.5, 14.5, 184, 16);

    // machine-gun timer
    if (P.machineT > 0) {
      txt('MG', 44, 42, 13, '#ffd75e', 'left');
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(70, 35, 124, 10);
      ctx.fillStyle = '#ffd75e';
      ctx.fillRect(72, 37, 120 * clamp(P.machineT / 10, 0, 1), 6);
    }

    // level / wave
    const lv = LEVELS[G.levelIdx];
    txt('LEVEL ' + (G.levelIdx + 1) + '/' + LEVELS.length + '  ·  WAVE ' + (G.waveIdx + 1) + '/' + lv.waves.length, W / 2, 22, 15, '#c8d4e0');
    const left = G.enemies.length + G.spawnQueue.length;
    if (left > 0) txt('HOSTILES: ' + left, W / 2, 42, 12, '#78859a');

    // score
    txt('SCORE ' + G.score, W - 44, 16, 15, '#ffd75e', 'right');
    txt('HI ' + Math.max(highScore, G.score), W - 44, 36, 12, '#78859a', 'right');

    // boss bar
    if (G.bossRef && !G.bossRef.dead) {
      const b = G.bossRef;
      const bw = 420;
      txt('THE MACHINE', W / 2, H - 52, 13, '#ff6a3a');
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(W / 2 - bw / 2, H - 42, bw, 14);
      ctx.fillStyle = '#c02818';
      ctx.fillRect(W / 2 - bw / 2 + 2, H - 40, (bw - 4) * clamp(b.hp / b.maxHp, 0, 1), 10);
      ctx.strokeStyle = '#5a2018';
      ctx.strokeRect(W / 2 - bw / 2 + 0.5, H - 42 + 0.5, bw, 14);
    }

    // wave banner
    if (G.bannerT > 0) {
      const a = clamp(G.bannerT / 0.4, 0, 1);
      ctx.globalAlpha = a;
      const warn = G.bannerText === 'WARNING';
      txt(G.bannerText, W / 2, H / 2 - 46, 44, warn ? '#ff4030' : '#e8eef4');
      if (G.bannerSub) txt(G.bannerSub, W / 2, H / 2 - 8, 18, '#ffb090');
      ctx.globalAlpha = 1;
    }

    txt('[P] PAUSE  [M] MUTE', 44, H - 20, 11, '#5a6678', 'left');
  }

  function drawCrosshair() {
    const x = input.mouseX, y = input.mouseY;
    ctx.strokeStyle = 'rgba(255,235,200,0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.moveTo(x + dx * 5, y + dy * 5);
      ctx.lineTo(x + dx * 12, y + dy * 12);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,120,60,0.9)';
    ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  }

  function drawMuteIcon() {
    const r = MUTE_RECT;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = '#3a4656';
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
    const cx = r.x + r.w / 2 - 4, cy = r.y + r.h / 2;
    ctx.fillStyle = '#c8d4e0';
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy - 4); ctx.lineTo(cx - 2, cy - 4); ctx.lineTo(cx + 3, cy - 9);
    ctx.lineTo(cx + 3, cy + 9); ctx.lineTo(cx - 2, cy + 4); ctx.lineTo(cx - 6, cy + 4);
    ctx.closePath();
    ctx.fill();
    if (SFX.isMuted()) {
      ctx.strokeStyle = '#d43a3a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx + 7, cy - 7); ctx.lineTo(cx + 15, cy + 7);
      ctx.moveTo(cx + 15, cy - 7); ctx.lineTo(cx + 7, cy + 7);
      ctx.stroke();
      ctx.lineWidth = 1;
    } else {
      ctx.strokeStyle = '#c8d4e0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx + 6, cy, 5, -0.9, 0.9);
      ctx.arc(cx + 6, cy, 9, -0.9, 0.9);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  // ------------------------------------------------------------- screens
  function drawMenu() {
    dimScreen(0.55);
    const pulse = 1 + Math.sin(G.time * 2.2) * 0.02;
    ctx.save();
    ctx.translate(W / 2, 150);
    ctx.scale(pulse, pulse);
    txt('SECTOR 9', 0, 0, 84, '#ff7a30');
    ctx.restore();
    txt('A RETRO TOP-DOWN SHOOTER', W / 2, 208, 16, '#8fa3b8');

    // hero: the operative tracks your mouse
    const aim = Math.atan2(input.mouseY - 300, input.mouseX - W / 2);
    drawShadow(ctx, W / 2, 300, 18);
    drawSprite(ctx, SPR.playerGun, W / 2, 300, aim, 1.3);

    // enemy lineup with bounties
    const lineup = [
      [SPR.zombie, 'ZOMBIE', '100'],
      [SPR.runner, 'RUNNER', '150'],
      [SPR.soldier, 'SOLDIER', '250'],
      [SPR.robot, 'TANK', '400'],
    ];
    lineup.forEach(([def, name, pts], i) => {
      const x = W / 2 - 270 + i * 180;
      drawSprite(ctx, def, x, 392, Math.PI / 2 + Math.sin(G.time * 2 + i) * 0.15, 0.95);
      txt(name, x, 432, 12, '#c8d4e0');
      txt(pts + ' PTS', x, 448, 11, '#78859a');
    });

    txt('ARROWS / WASD — MOVE      MOUSE — AIM      CLICK — SHOOT', W / 2, 500, 14, '#c8d4e0');
    txt('CLEAR ALL 5 LEVELS · DESTROY THE MACHINE', W / 2, 524, 12, '#78859a');

    if (Math.floor(G.time * 1.6) % 2 === 0) txt('CLICK TO DEPLOY', W / 2, 572, 22, '#ffd75e');
    if (highScore > 0) txt('HIGH SCORE  ' + highScore, W / 2, 604, 13, '#8fa3b8');
  }

  function drawIntro() {
    dimScreen(0.6);
    txt('LEVEL ' + (G.levelIdx + 1), W / 2, H / 2 - 60, 28, '#8fa3b8');
    txt(LEVELS[G.levelIdx].name, W / 2, H / 2, 52, '#ff7a30');
    if (Math.floor(G.stateT * 3) % 2 === 0) txt('GET READY', W / 2, H / 2 + 64, 18, '#e8eef4');
  }

  function drawClear() {
    dimScreen(0.45);
    txt('LEVEL ' + (G.levelIdx + 1) + ' CLEAR', W / 2, H / 2 - 50, 48, '#57c458');
    txt('LEVEL BONUS  +' + G.levelBonus, W / 2, H / 2 + 6, 20, '#ffd75e');
    txt('SCORE  ' + G.score, W / 2, H / 2 + 38, 16, '#c8d4e0');
  }

  function drawPaused() {
    dimScreen(0.55);
    txt('PAUSED', W / 2, H / 2 - 16, 48, '#e8eef4');
    txt('[P] RESUME', W / 2, H / 2 + 36, 16, '#8fa3b8');
  }

  function drawGameOver() {
    dimScreen(0.65);
    txt('MISSION FAILED', W / 2, H / 2 - 70, 56, '#d43a3a');
    txt('SCORE  ' + G.score, W / 2, H / 2 - 4, 22, '#ffd75e');
    if (G.newRecord) txt('NEW RECORD!', W / 2, H / 2 + 30, 18, '#57c458');
    else txt('HIGH SCORE  ' + highScore, W / 2, H / 2 + 30, 14, '#8fa3b8');
    if (G.stateT > 0.8 && Math.floor(G.time * 1.6) % 2 === 0) {
      txt('CLICK TO RETRY', W / 2, H / 2 + 84, 20, '#e8eef4');
    }
    txt('[ESC] MENU', W / 2, H / 2 + 116, 12, '#78859a');
  }

  function drawWin() {
    dimScreen(0.6);
    txt('SECTOR CLEARED', W / 2, H / 2 - 80, 56, '#57c458');
    txt('THE MACHINE IS DOWN. NICE SHOOTING.', W / 2, H / 2 - 24, 16, '#c8d4e0');
    txt('FINAL SCORE  ' + G.score, W / 2, H / 2 + 16, 24, '#ffd75e');
    if (G.newRecord) txt('NEW RECORD!', W / 2, H / 2 + 52, 18, '#ffd75e');
    else if (highScore > 0) txt('HIGH SCORE  ' + highScore, W / 2, H / 2 + 52, 14, '#8fa3b8');
    if (G.stateT > 0.8 && Math.floor(G.time * 1.6) % 2 === 0) {
      txt('CLICK FOR MENU', W / 2, H / 2 + 104, 20, '#e8eef4');
    }
  }

  // ------------------------------------------------------------- boot
  const IMAGE_NAMES = [
    'player_gun', 'player_machine', 'player_stand',
    'zombie_hold', 'zombie_stand', 'runner_hold', 'runner_stand',
    'soldier_gun', 'soldier_machine', 'robot_machine', 'robot_hold',
    'pickup_machine', 'pickup_gun',
    'floor', 'floor_m1', 'floor_m2', 'floor_m3', 'floor_m4', 'wall', 'crate',
  ];

  function drawLoading() {
    ctx.fillStyle = '#0a0d12';
    ctx.fillRect(0, 0, W, H);
    txt('LOADING...', W / 2, H / 2, 24, '#8fa3b8');
  }

  drawLoading();
  ASSETS.load(IMAGE_NAMES, () => {
    buildLayers();
    G.state = 'menu';
    if (params.get('autostart') === '1') startGame(testLevel);
    // Headless-test hook: ?sim=N steps N seconds of gameplay synchronously
    // (virtual time in headless Chrome doesn't advance performance.now()).
    const simT = +params.get('sim') || 0;
    if (simT > 0) {
      if (params.get('fire') === '1') input.mouseDown = true;
      for (let i = 0; i < simT * 60; i++) update(1 / 60);
      input.mouseDown = false;
    }
  });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (G.state !== 'loading') {
      update(dt);
      draw();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
