// Retro chiptune-style sound effects, all synthesized with the Web Audio API.
// No audio files. The AudioContext is created lazily on the first user gesture
// (browsers block autoplay before that).
const SFX = (() => {
  let ctx = null;
  let master = null;
  let muted = false;
  try { muted = localStorage.getItem('sector9_muted') === '1'; } catch (e) {}

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.4;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // One synthesized "voice": an oscillator sweeping f0 -> f1 with a decay envelope.
  function tone(type, f0, f1, dur, vol, delay) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  let noiseBuf = null;
  function noise(dur, vol, delay, cutoff) {
    if (!ctx || muted) return;
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime + (delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff || 1800;
    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  return {
    unlock() { ensure(); },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem('sector9_muted', muted ? '1' : '0'); } catch (e) {}
      if (master) master.gain.value = muted ? 0 : 0.4;
      return muted;
    },
    isMuted() { return muted; },

    click()    { if (ensure()) tone('square', 900, 600, 0.06, 0.25); },
    shoot()    { if (ensure()) { tone('square', 850, 220, 0.09, 0.30); noise(0.05, 0.15, 0, 3500); } },
    shootMg()  { if (ensure()) { tone('square', 1100, 300, 0.06, 0.22); noise(0.04, 0.12, 0, 4000); } },
    hit()      { if (ensure()) tone('triangle', 260, 140, 0.06, 0.30); },
    enemyShoot(){ if (ensure()) tone('square', 480, 150, 0.08, 0.16); },
    enemyDie() { if (ensure()) { tone('square', 320, 60, 0.22, 0.30); noise(0.18, 0.25, 0, 1200); } },
    hurt()     { if (ensure()) { tone('sawtooth', 180, 55, 0.28, 0.40); noise(0.15, 0.2, 0, 900); } },
    pickup()   { if (ensure()) { tone('square', 520, 520, 0.07, 0.25); tone('square', 780, 780, 0.09, 0.25, 0.07); } },
    powerup()  { if (ensure()) { [440, 550, 660, 880].forEach((f, i) => tone('square', f, f, 0.09, 0.25, i * 0.07)); } },
    wave()     { if (ensure()) { tone('square', 330, 330, 0.09, 0.22); tone('square', 494, 494, 0.12, 0.22, 0.09); } },
    levelUp()  { if (ensure()) { [392, 494, 587, 784].forEach((f, i) => tone('square', f, f, 0.12, 0.28, i * 0.10)); } },
    bossAlarm(){ if (ensure()) { for (let i = 0; i < 3; i++) { tone('sawtooth', 420, 420, 0.16, 0.3, i * 0.3); tone('sawtooth', 300, 300, 0.16, 0.3, i * 0.3 + 0.16); } } },
    gameOver() { if (ensure()) { [392, 330, 262, 196].forEach((f, i) => tone('square', f, f * 0.97, 0.24, 0.3, i * 0.22)); } },
    win()      { if (ensure()) { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone('square', f, f, 0.15, 0.28, i * 0.13)); } },
  };
})();
