// Image loading + sprite metadata + draw helpers.
// Sprites come from Kenney's CC0 "Top-down Shooter" pack. All characters face
// right (angle 0 = east); pivot is the body center in sprite pixels, muzzle is
// the gun tip relative to that pivot.
const ASSETS = {
  images: {},
  load(names, done) {
    let remaining = names.length;
    names.forEach((name) => {
      const img = new Image();
      img.onload = img.onerror = () => { if (--remaining === 0) done(); };
      img.src = 'assets/' + name + '.png';
      this.images[name] = img;
    });
  },
};

// pivot: rotation center in sprite px. muzzle: gun tip relative to pivot.
const SPR = {
  playerGun:     { img: 'player_gun',      pivot: [16.5, 21.5], muzzle: [32.5, 8.0] },
  playerMachine: { img: 'player_machine',  pivot: [16.5, 21.5], muzzle: [32.5, 8.5] },
  playerStand:   { img: 'player_stand',    pivot: [16.5, 21.5] },
  zombie:        { img: 'zombie_hold',     pivot: [16.0, 21.5] },
  zombieStand:   { img: 'zombie_stand',    pivot: [16.0, 21.5] },
  runner:        { img: 'runner_hold',     pivot: [16.0, 21.5] },
  runnerStand:   { img: 'runner_stand',    pivot: [16.0, 21.5] },
  soldier:       { img: 'soldier_gun',     pivot: [16.5, 21.5], muzzle: [35.5, 9.5] },
  soldierMg:     { img: 'soldier_machine', pivot: [16.5, 21.5], muzzle: [35.5, 9.5] },
  robot:         { img: 'robot_machine',   pivot: [16.5, 21.5], muzzle: [32.5, 8.5] },
  robotHold:     { img: 'robot_hold',      pivot: [16.0, 21.5] },
  pickupMachine: { img: 'pickup_machine',  pivot: [16.5, 5.0] },
  pickupGun:     { img: 'pickup_gun',      pivot: [9.5, 5.0] },
};

// Cache of recolored sprite copies (hit flash, boss tint).
const TINTS = {};
function tintedImage(imgName, color, alpha) {
  const key = imgName + '|' + color + '|' + alpha;
  if (TINTS[key]) return TINTS[key];
  const src = ASSETS.images[imgName];
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  TINTS[key] = c;
  return c;
}

// Draw a sprite def at world (x, y) rotated to `angle`, scaled.
// `tint` optionally swaps in a recolored copy: {color, alpha}.
function drawSprite(ctx, def, x, y, angle, scale, tint) {
  const img = tint
    ? tintedImage(def.img, tint.color, tint.alpha)
    : ASSETS.images[def.img];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.drawImage(img, -def.pivot[0], -def.pivot[1]);
  ctx.restore();
}

// World-space position of a sprite's muzzle tip.
function muzzlePos(def, x, y, angle, scale) {
  const mx = def.muzzle[0] * scale;
  const my = def.muzzle[1] * scale;
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: x + mx * c - my * s, y: y + mx * s + my * c };
}
