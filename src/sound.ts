// Sonido sintetizado con Web Audio, sin archivos: un siseo de arena que sigue a la
// cantidad de arena en movimiento, un «tin» cuando se posa el grano del día y un
// acorde para los hitos. Desactivado por defecto; el navegador solo deja empezar a
// sonar tras un gesto del usuario.

type AudioCtor = typeof AudioContext;

export class SandSound {
  enabled = false;
  private ctx: AudioContext | null = null;
  private hiss: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private level = 0;

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) this.unlock();
    else if (this.ctx && this.hiss) {
      this.hiss.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      this.level = 0;
    }
  }

  /** Llamar desde un gesto del usuario (clic, toque) para poder empezar a sonar. */
  unlock(): void {
    if (!this.enabled) return;
    this.ensure();
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => undefined);
  }

  /** 0..1: cuánta arena se está moviendo ahora mismo. */
  setActivity(a: number): void {
    const { ctx, hiss, filter } = this;
    if (!this.enabled || !ctx || !hiss || !filter || ctx.state !== 'running') return;
    const x = Math.max(0, Math.min(1, a));
    const target = Math.sqrt(x) * 0.16;
    if (Math.abs(target - this.level) < 0.004) return;
    this.level = target;
    hiss.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
    filter.frequency.setTargetAtTime(2200 + x * 3000, ctx.currentTime, 0.1);
  }

  /** Un grano que se posa: un «tin» corto y cristalino. */
  tink(strength = 1): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const [freq, amp] of [
      [1760, 1],
      [2640, 0.45],
      [3960, 0.2],
    ]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09 * amp * strength, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.5);
    }
  }

  /** Un hito: un arpegio ascendente. */
  chime(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.02;
    [659.25, 830.61, 987.77, 1318.51].forEach((freq, i) => {
      const t = t0 + i * 0.11;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1.2);
    });
  }

  private ready(): AudioContext | null {
    return this.enabled && this.ctx && this.ctx.state === 'running' ? this.ctx : null;
  }

  private ensure(): void {
    if (this.ctx) return;
    const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
    const AC = w.AudioContext ?? w.webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      // Ruido blanco en bucle, filtrado para que suene a arena y no a radio mal sintonizada.
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 3000;
      filter.Q.value = 0.8;
      const hiss = ctx.createGain();
      hiss.gain.value = 0;
      src.connect(filter).connect(hiss).connect(ctx.destination);
      src.start();
      this.ctx = ctx;
      this.filter = filter;
      this.hiss = hiss;
    } catch {
      // Sin Web Audio la app sigue igual, solo que en silencio.
    }
  }
}
