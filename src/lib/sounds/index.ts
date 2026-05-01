'use client';

export type SoundType =
  | 'off'
  | 'chime'
  | 'marimba'
  | 'bell'
  | 'pluck'
  | 'softbeep';

export const SOUND_OPTIONS: { id: SoundType; labelEn: string; labelRu: string }[] = [
  { id: 'off', labelEn: 'Off', labelRu: 'Без звука' },
  { id: 'chime', labelEn: 'Chime', labelRu: 'Колокольчик' },
  { id: 'marimba', labelEn: 'Marimba', labelRu: 'Маримба' },
  { id: 'bell', labelEn: 'Bell', labelRu: 'Колокол' },
  { id: 'pluck', labelEn: 'Pluck', labelRu: 'Щипок' },
  { id: 'softbeep', labelEn: 'Soft beep', labelRu: 'Тихий бип' },
];

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Play a single sine tone with smooth attack and exponential decay. */
function tone(
  audio: AudioContext,
  freq: number,
  start: number,
  duration: number,
  peak = 0.18,
  type: OscillatorType = 'sine',
) {
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(peak, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  o.connect(g).connect(audio.destination);
  o.start(start);
  o.stop(start + duration + 0.05);
}

export function playSound(type: SoundType) {
  if (type === 'off') return;
  const audio = getCtx();
  if (!audio) return;
  const t = audio.currentTime;

  switch (type) {
    case 'chime': {
      // Two-note ascending chime: A5 → E6.
      tone(audio, 880, t, 1.4, 0.18);
      tone(audio, 1318.5, t + 0.12, 1.6, 0.14);
      return;
    }
    case 'marimba': {
      // Soft major chord (C5 - E5 - G5), short decay, triangle wave.
      tone(audio, 523.25, t, 0.45, 0.15, 'triangle');
      tone(audio, 659.25, t + 0.05, 0.5, 0.13, 'triangle');
      tone(audio, 783.99, t + 0.1, 0.55, 0.12, 'triangle');
      return;
    }
    case 'bell': {
      // Long bell: fundamental + harmonic, slow exponential decay.
      tone(audio, 660, t, 2.5, 0.16);
      tone(audio, 1320, t, 2.0, 0.08);
      tone(audio, 1980, t, 1.5, 0.04);
      return;
    }
    case 'pluck': {
      // Short pluck: filtered noise + tone.
      tone(audio, 587.33, t, 0.25, 0.14, 'triangle');
      tone(audio, 880, t + 0.04, 0.18, 0.1, 'triangle');
      return;
    }
    case 'softbeep': {
      // Two short identical beeps.
      tone(audio, 740, t, 0.18, 0.16);
      tone(audio, 740, t + 0.22, 0.18, 0.14);
      return;
    }
  }
}
