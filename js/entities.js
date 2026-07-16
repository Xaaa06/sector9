// Entities: player, enemies (incl. boss), bullets, particles, pickups.
// The Kenney characters are single-pose sprites, so all "animation" is
// composed in code: rotation to face a target, animated feet + body bob for
// walking, recoil + muzzle flash for shooting, tint flash for damage,
// particle bursts for deaths.

function rand(a, b) { return a + Math.random() * (b - a); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }

// --- Walking feet: two dark pads stepping alternately along the facing axis.
function drawFeet(ctx, x, y, angle, phase, scale, moving) {
  const step = moving ? Math.sin(phase) * 6 * scale : 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(25,25,30,0.85)';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(step * side, side * 7 * scale, 5 * scale, 3.5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawShadow(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(x, y + 4, r * 1.05, r * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ---------------------------------------------------------------- Player
class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.r = 15;
    this.scale = 0.9;
    this.speed = 230;
    this.maxHp = 100;
    this.hp = this.maxHp;
    this.aim = 0;
    this.fireCd = 0;
    this.iframes = 0;
    this.flashT = 0;       // muzzle flash timer
    this.recoil = 0;
    this.feetPhase = 0;
    this.moving = false;
    this.weapon = 'pistol'; // 'pistol' | 'machine'
    this.machineT = 0;      // machine-gun powerup time left
  }

  spriteDef() { return this.weapon === 'machine' ? SPR.playerMachine : SPR.playerGun; }

  update(dt, game) {
    const input = game.input;
    let dx = 0, dy = 0;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;
    if (dx || dy) {
      const len = Math.hypot(dx, dy);
      this.x += (dx / len) * this.speed * dt;
      this.y += (dy / len) * this.speed * dt;
      this.feetPhase += dt * 13;
      this.moving = true;
    } else {
      this.moving = false;
    }
    const a = game.arena;
    this.x = clamp(this.x, a.x + this.r, a.x + a.w - this.r);
    this.y = clamp(this.y, a.y + this.r, a.y + a.h - this.r);

    this.aim = Math.atan2(input.mouseY - this.y, input.mouseX - this.x);

    this.fireCd -= dt;
    this.iframes = Math.max(0, this.iframes - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.recoil = Math.max(0, this.recoil - dt * 30);

    if (this.machineT > 0) {
      this.machineT -= dt;
      if (this.machineT <= 0) this.weapon = 'pistol';
    }

    if (input.mouseDown && this.fireCd <= 0) this.fire(game);
  }

  fire(game) {
    const mg = this.weapon === 'machine';
    this.fireCd = mg ? 0.09 : 0.22;
    this.flashT = 0.05;
    this.recoil = 2.5;
    const def = this.spriteDef();
    const m = muzzlePos(def, this.x, this.y, this.aim, this.scale);
    const spread = mg ? rand(-0.06, 0.06) : rand(-0.02, 0.02);
    const ang = this.aim + spread;
    game.bullets.push(new Bullet(m.x, m.y, ang, 700, mg ? 20 : 34, true));
    // ejected shell casing
    game.particles.push({
      x: m.x, y: m.y,
      vx: Math.cos(ang + Math.PI / 2) * rand(60, 120) + rand(-20, 20),
      vy: Math.sin(ang + Math.PI / 2) * rand(60, 120) + rand(-20, 20),
      life: rand(0.3, 0.5), maxLife: 0.5, size: 3, color: '#d8b04a',
    });
    mg ? SFX.shootMg() : SFX.shoot();
  }

  takeDamage(dmg, game) {
    if (this.iframes > 0 || this.hp <= 0) return;
    this.hp -= dmg;
    this.iframes = 0.9;
    game.shake(6);
    game.hurtFlash = 0.35;
    spawnBurst(game.particles, this.x, this.y, '#d43a3a', 10, 150);
    SFX.hurt();
  }

  draw(ctx) {
    // blink while invulnerable
    if (this.iframes > 0 && Math.floor(this.iframes * 12) % 2 === 0) return;
    drawShadow(ctx, this.x, this.y, this.r);
    drawFeet(ctx, this.x, this.y, this.aim, this.feetPhase, this.scale, this.moving);
    const bob = this.moving ? Math.sin(this.feetPhase * 0.5) * 0.04 : 0;
    const kick = this.recoil * this.scale;
    const bx = this.x - Math.cos(this.aim) * kick;
    const by = this.y - Math.sin(this.aim) * kick;
    drawSprite(ctx, this.spriteDef(), bx, by, this.aim + bob, this.scale);
    if (this.flashT > 0) drawMuzzleFlash(ctx, this.spriteDef(), bx, by, this.aim, this.scale);
  }
}

function drawMuzzleFlash(ctx, def, x, y, angle, scale) {
  const m = muzzlePos(def, x, y, angle, scale);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(m.x, m.y);
  ctx.rotate(angle + rand(-0.2, 0.2));
  const s = rand(0.8, 1.3) * scale;
  ctx.fillStyle = 'rgba(255,240,160,0.95)';
  ctx.beginPath();
  ctx.moveTo(14 * s, 0);
  ctx.lineTo(2 * s, 4 * s); ctx.lineTo(-2 * s, 0); ctx.lineTo(2 * s, -4 * s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,170,60,0.8)';
  ctx.beginPath();
  ctx.arc(2 * s, 0, 4.5 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- Bullets
class Bullet {
  constructor(x, y, angle, speed, dmg, friendly) {
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.r = friendly ? 4 : 5;
    this.dmg = dmg;
    this.friendly = friendly;
    this.life = 1.6;
    this.dead = false;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (this.friendly) {
      // yellow tracer
      ctx.strokeStyle = 'rgba(255,215,94,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(this.x - this.vx * 0.018, this.y - this.vy * 0.018);
      ctx.lineTo(this.x, this.y);
      ctx.stroke();
      ctx.fillStyle = '#fff8d0';
      ctx.beginPath();
      ctx.arc(this.x, this.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(255,90,50,0.35)';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff6a3a';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r - 1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- Enemies
const ENEMY_TYPES = {
  zombie: {
    hp: 100, speed: 55, r: 15, touchDmg: 12, score: 100, scale: 0.9,
    sprite: 'zombie', corpse: 'zombieStand', blood: '#6f9c3f', wobble: 0.12,
  },
  runner: {
    hp: 60, speed: 140, r: 13, touchDmg: 8, score: 150, scale: 0.82,
    sprite: 'runner', corpse: 'runnerStand', blood: '#4d9c58', wobble: 0.06,
  },
  soldier: {
    hp: 120, speed: 75, r: 15, touchDmg: 10, score: 250, scale: 0.9,
    sprite: 'soldier', corpse: 'soldier', blood: '#b03030',
    ranged: { range: 270, fireDelay: 1.6, bulletSpeed: 330, dmg: 10 },
  },
  tank: {
    hp: 260, speed: 42, r: 17, touchDmg: 20, score: 400, scale: 1.05,
    sprite: 'robot', corpse: 'robotHold', blood: '#8fa0aa',
  },
  boss: {
    hp: 1600, speed: 40, r: 36, touchDmg: 25, score: 2000, scale: 2.0,
    sprite: 'robot', corpse: 'robotHold', blood: '#c26030', boss: true,
    tint: { color: '#c02818', alpha: 0.4 },
  },
};

class Enemy {
  constructor(type, x, y) {
    const t = ENEMY_TYPES[type];
    this.type = type;
    this.def = t;
    this.x = x; this.y = y;
    this.r = t.r;
    this.scale = t.scale;
    this.hp = t.hp;
    this.maxHp = t.hp;
    this.speed = t.speed * rand(0.88, 1.12);
    this.angle = 0;
    this.feetPhase = rand(0, 6);
    this.moving = true;
    this.flashT = 0;
    this.touchCd = 0;
    this.fireCd = t.ranged ? rand(0.8, t.ranged.fireDelay) : 0;
    this.flashMuzzle = 0;
    this.dead = false;
    // boss state
    this.sprayCd = 3.0;
    this.chargeCd = 6.0;
    this.chargeT = 0;
    this.minionCd = 9.0;
  }

  update(dt, game) {
    const p = game.player;
    this.angle = Math.atan2(p.y - this.y, p.x - this.x);
    this.flashT = Math.max(0, this.flashT - dt);
    this.touchCd = Math.max(0, this.touchCd - dt);

    if (this.def.boss) { this.updateBoss(dt, game); return; }

    const a = game.arena;
    const inside = this.x > a.x && this.x < a.x + a.w && this.y > a.y && this.y < a.y + a.h;
    const d = dist(this.x, this.y, p.x, p.y);
    let move = true;

    if (this.def.ranged && inside) {
      const rg = this.def.ranged;
      if (d < rg.range) {
        move = false;
        this.fireCd -= dt;
        if (this.fireCd <= 0 && p.hp > 0) {
          this.fireCd = rg.fireDelay * rand(0.9, 1.15);
          const m = muzzlePos(SPR[this.def.sprite], this.x, this.y, this.angle, this.scale);
          game.bullets.push(new Bullet(m.x, m.y, this.angle + rand(-0.05, 0.05), rg.bulletSpeed, rg.dmg, false));
          this.flashMuzzle = 0.05;
          SFX.enemyShoot();
        }
      }
    }

    if (move) {
      const wob = this.def.wobble ? Math.sin(this.feetPhase * 0.7) * this.def.wobble : 0;
      const ang = this.angle + wob;
      this.x += Math.cos(ang) * this.speed * dt;
      this.y += Math.sin(ang) * this.speed * dt;
      this.feetPhase += dt * this.speed * 0.11;
      this.moving = true;
    } else {
      this.moving = false;
    }
    if (this.flashMuzzle) this.flashMuzzle = Math.max(0, this.flashMuzzle - dt);
  }

  updateBoss(dt, game) {
    const p = game.player;
    const enraged = this.hp < this.maxHp * 0.5;
    const spd = (enraged ? 60 : this.speed);

    this.chargeT = Math.max(0, this.chargeT - dt);
    const cur = this.chargeT > 0 ? spd * 4.5 : spd;
    this.x += Math.cos(this.angle) * cur * dt;
    this.y += Math.sin(this.angle) * cur * dt;
    this.feetPhase += dt * cur * 0.06;
    this.moving = true;

    const a = game.arena;
    this.x = clamp(this.x, a.x + this.r, a.x + a.w - this.r);
    this.y = clamp(this.y, a.y + this.r, a.y + a.h - this.r);

    this.sprayCd -= dt;
    if (this.sprayCd <= 0) {
      this.sprayCd = enraged ? 2.4 : 3.5;
      const n = 18;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + rand(-0.05, 0.05);
        game.bullets.push(new Bullet(this.x, this.y, ang, 250, 10, false));
      }
      game.shake(4);
      SFX.enemyDie();
    }
    this.chargeCd -= dt;
    if (this.chargeCd <= 0) {
      this.chargeCd = enraged ? 5.5 : 8;
      this.chargeT = 1.0;
      SFX.wave();
    }
    this.minionCd -= dt;
    if (this.minionCd <= 0 && game.enemies.length < 12) {
      this.minionCd = 9;
      game.spawnEnemyAtEdge('zombie');
      game.spawnEnemyAtEdge('zombie');
    }
  }

  hit(dmg, angle, game) {
    this.hp -= dmg;
    this.flashT = 0.07;
    if (!this.def.boss) {
      this.x += Math.cos(angle) * 3;
      this.y += Math.sin(angle) * 3;
    }
    spawnBurst(game.particles, this.x, this.y, this.def.blood, 5, 120);
    SFX.hit();
    if (this.hp <= 0) this.die(game);
  }

  die(game) {
    this.dead = true;
    spawnBurst(game.particles, this.x, this.y, this.def.blood, this.def.boss ? 60 : 18, this.def.boss ? 320 : 190);
    spawnBurst(game.particles, this.x, this.y, '#2a2a2e', 8, 120);
    game.corpses.push({
      def: SPR[this.def.corpse], x: this.x, y: this.y,
      angle: this.angle + rand(-0.6, 0.6), scale: this.scale, t: 7,
    });
    game.addScore(this.def.score, this.x, this.y);
    game.onEnemyKilled(this);
    if (this.def.boss) game.shake(14);
    SFX.enemyDie();
  }

  draw(ctx) {
    drawShadow(ctx, this.x, this.y, this.r);
    drawFeet(ctx, this.x, this.y, this.angle, this.feetPhase, this.scale, this.moving);
    const bob = this.moving ? Math.sin(this.feetPhase * 0.5) * 0.05 : 0;
    const def = SPR[this.def.sprite];
    const tint = this.flashT > 0 ? { color: '#ffffff', alpha: 0.85 } : this.def.tint;
    drawSprite(ctx, def, this.x, this.y, this.angle + bob, this.scale, tint);
    if (this.flashMuzzle > 0 && def.muzzle) drawMuzzleFlash(ctx, def, this.x, this.y, this.angle, this.scale);
  }
}

// ---------------------------------------------------------------- Particles
function spawnBurst(list, x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const ang = rand(0, Math.PI * 2);
    const sp = rand(speed * 0.25, speed);
    list.push({
      x, y,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      life: rand(0.25, 0.6), maxLife: 0.6,
      size: rand(2, 4.5), color,
    });
  }
}

function updateParticles(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const pt = list[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.90;
    pt.vy *= 0.90;
    pt.life -= dt;
    if (pt.life <= 0) list.splice(i, 1);
  }
}

function drawParticles(ctx, list) {
  for (const pt of list) {
    ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
    ctx.fillStyle = pt.color;
    const s = pt.size;
    ctx.fillRect(pt.x - s / 2, pt.y - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- Pickups
class Pickup {
  constructor(type, x, y) {
    this.type = type; // 'health' | 'machine'
    this.x = x; this.y = y;
    this.r = 13;
    this.t = 0;
    this.life = 11;
    this.dead = false;
  }
  update(dt) {
    this.t += dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
  draw(ctx) {
    // blink when about to disappear
    if (this.life < 3 && Math.floor(this.life * 6) % 2 === 0) return;
    const bobY = this.y + Math.sin(this.t * 3.5) * 2.5;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = this.type === 'health' ? 'rgba(90,220,120,0.18)' : 'rgba(255,200,80,0.18)';
    ctx.beginPath();
    ctx.arc(this.x, bobY, 15 + Math.sin(this.t * 5) * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (this.type === 'health') {
      // retro medkit: white box, red cross
      ctx.fillStyle = '#e8e8e0';
      ctx.fillRect(this.x - 9, bobY - 8, 18, 16);
      ctx.fillStyle = '#c8332a';
      ctx.fillRect(this.x - 2.5, bobY - 6, 5, 12);
      ctx.fillRect(this.x - 6.5, bobY - 2, 13, 4);
    } else {
      drawSprite(ctx, SPR.pickupMachine, this.x, bobY, Math.sin(this.t * 1.5) * 0.25 - 0.5, 1.0);
    }
  }
}
