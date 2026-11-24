import type { KeyChoice, Mode } from './types';

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
/** Conventional tonic spellings */
export const TONIC_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export const SCALES: Record<Mode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

const FLAT_KEYS: Record<Mode, number[]> = { major: [5, 10, 3, 8, 1, 6], minor: [2, 7, 0, 5, 10, 3] };
const prefersFlats = (k: KeyChoice) => FLAT_KEYS[k.mode].includes(k.tonic);

export const pcName = (pc: number, key: KeyChoice) => (prefersFlats(key) ? FLATS : SHARPS)[((pc % 12) + 12) % 12];
export const keyName = (k: KeyChoice) => `${TONIC_NAMES[k.tonic]} ${k.mode}`;
/** compact form for file names, e.g. "Amin", "Fsmaj" */
export const keyShort = (k: KeyChoice) => `${TONIC_NAMES[k.tonic].replace('#', 's')}${k.mode === 'major' ? 'maj' : 'min'}`;
export const sameKey = (a: KeyChoice | null, b: KeyChoice | null) => !!a && !!b && a.tonic === b.tonic && a.mode === b.mode;

/** Camelot wheel code used by DJs/producers: 8A = A minor, 8B = C major. */
export function camelot(k: KeyChoice): string {
  const majorTonic = k.mode === 'major' ? k.tonic : (k.tonic + 3) % 12;
  const n = (((majorTonic * 7) % 12) + 7) % 12 + 1;
  return `${n}${k.mode === 'major' ? 'B' : 'A'}`;
}

export const scaleNotes = (k: KeyChoice) => SCALES[k.mode].map((iv) => (k.tonic + iv) % 12);

export function sharedNotes(a: KeyChoice, b: KeyChoice) {
  const sb = new Set(scaleNotes(b));
  return scaleNotes(a).filter((pc) => sb.has(pc)).length;
}

export const relativeKey = (k: KeyChoice): KeyChoice =>
  k.mode === 'major' ? { tonic: (k.tonic + 9) % 12, mode: 'minor' } : { tonic: (k.tonic + 3) % 12, mode: 'major' };

export interface RelatedKey {
  key: KeyChoice;
  label: string;
  hint: string;
}

/** Keys that mix well with `k`, in plain language. */
export function relatedKeys(k: KeyChoice): RelatedKey[] {
  const other: Mode = k.mode === 'major' ? 'minor' : 'major';
  const up: KeyChoice = { tonic: (k.tonic + 7) % 12, mode: k.mode };
  const down: KeyChoice = { tonic: (k.tonic + 5) % 12, mode: k.mode };
  return [
    { key: relativeKey(k), label: `relative ${other}`, hint: `same notes · ${other === 'minor' ? 'darker' : 'brighter'} mood` },
    { key: up, label: 'one step up', hint: 'fifth up · brighter, smooth' },
    { key: down, label: 'one step down', hint: 'fourth up · warmer, smooth' },
    { key: relativeKey(up), label: 'up + mood flip', hint: `close · ${other} flavour` },
    { key: relativeKey(down), label: 'down + mood flip', hint: `close · ${other} flavour` },
    { key: { tonic: k.tonic, mode: other }, label: 'same root, flip', hint: 'parallel · dramatic shift' },
  ];
}

export type Quality = 'maj' | 'min' | 'dim';

export interface ScaleChord {
  root: number;
  quality: Quality;
  name: string;
  numeral: string;
}

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/** The 7 chords built from the scale, with roman numerals. */
export function scaleChords(k: KeyChoice): ScaleChord[] {
  const s = SCALES[k.mode];
  return s.map((_, i) => {
    const root = (k.tonic + s[i]) % 12;
    const third = (s[(i + 2) % 7] - s[i] + 12) % 12;
    const fifth = (s[(i + 4) % 7] - s[i] + 12) % 12;
    const quality: Quality = third === 4 ? 'maj' : fifth === 6 ? 'dim' : 'min';
    const suffix = quality === 'maj' ? '' : quality === 'min' ? 'm' : '°';
    const numeral = quality === 'maj' ? NUMERALS[i] : NUMERALS[i].toLowerCase() + (quality === 'dim' ? '°' : '');
    return { root, quality, name: pcName(root, k) + suffix, numeral };
  });
}
