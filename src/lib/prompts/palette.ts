/** Soft "Web 2.0" pastel accents per category index. */
export type CatPalette = {
  /** Small dot indicator (subtle hue) */
  dot: string;
  /** Background when chip is active (low-saturation pastel) */
  activeBg: string;
  /** Text color when chip is active (deep tone, readable on pastel) */
  activeText: string;
};

const PALETTES: CatPalette[] = [
  {
    dot: 'bg-pink-400/70',
    activeBg: 'bg-pink-200/70 dark:bg-pink-900/30',
    activeText: 'text-pink-900 dark:text-pink-200',
  },
  {
    dot: 'bg-sky-400/70',
    activeBg: 'bg-sky-200/70 dark:bg-sky-900/30',
    activeText: 'text-sky-900 dark:text-sky-200',
  },
  {
    dot: 'bg-amber-400/70',
    activeBg: 'bg-amber-200/70 dark:bg-amber-900/30',
    activeText: 'text-amber-900 dark:text-amber-200',
  },
  {
    dot: 'bg-emerald-400/70',
    activeBg: 'bg-emerald-200/70 dark:bg-emerald-900/30',
    activeText: 'text-emerald-900 dark:text-emerald-200',
  },
  {
    dot: 'bg-violet-400/70',
    activeBg: 'bg-violet-200/70 dark:bg-violet-900/30',
    activeText: 'text-violet-900 dark:text-violet-200',
  },
  {
    dot: 'bg-orange-400/70',
    activeBg: 'bg-orange-200/70 dark:bg-orange-900/30',
    activeText: 'text-orange-900 dark:text-orange-200',
  },
  {
    dot: 'bg-teal-400/70',
    activeBg: 'bg-teal-200/70 dark:bg-teal-900/30',
    activeText: 'text-teal-900 dark:text-teal-200',
  },
  {
    dot: 'bg-rose-400/70',
    activeBg: 'bg-rose-200/70 dark:bg-rose-900/30',
    activeText: 'text-rose-900 dark:text-rose-200',
  },
  {
    dot: 'bg-lime-400/70',
    activeBg: 'bg-lime-200/70 dark:bg-lime-900/30',
    activeText: 'text-lime-900 dark:text-lime-200',
  },
  {
    dot: 'bg-fuchsia-400/70',
    activeBg: 'bg-fuchsia-200/70 dark:bg-fuchsia-900/30',
    activeText: 'text-fuchsia-900 dark:text-fuchsia-200',
  },
];

export function paletteFor(categoryIndex: number): CatPalette {
  return PALETTES[categoryIndex % PALETTES.length];
}
