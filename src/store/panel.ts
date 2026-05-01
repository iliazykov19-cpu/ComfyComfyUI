'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CardColor } from '@/lib/panel/colors';
import type { SoundType } from '@/lib/sounds';

export type SeedControl = 'fixed' | 'randomize' | 'increment' | 'decrement';

export type ColumnCount = 1 | 2 | 3;

type PanelState = {
  values: Record<string, unknown>;
  seedControls: Record<string, SeedControl>;
  nodeOrder: string[];
  nodeColors: Record<string, CardColor>;
  columns: ColumnCount;
  /** Empty array = show all. Otherwise list of nodeIds to show in RunCard results. */
  outputFilters: string[];
  /** Single source for the floating preview (PiP / pinned). 'all' or nodeId. */
  pipOutputFilter: string;
  promptTargets: string[]; // exposed keys that receive prompt builder text
  soundOnFinish: SoundType;
  setValue: (key: string, v: unknown) => void;
  setSeedControl: (key: string, c: SeedControl) => void;
  setNodeOrder: (order: string[]) => void;
  setNodeColor: (nodeId: string, color: CardColor) => void;
  setColumns: (n: ColumnCount) => void;
  toggleOutputFilter: (nodeId: string) => void;
  setOutputFilters: (ids: string[]) => void;
  setPipOutputFilter: (s: string) => void;
  togglePromptTarget: (key: string) => void;
  setPromptTargets: (keys: string[]) => void;
  setSoundOnFinish: (s: SoundType) => void;
  resetValues: () => void;
  resetLayout: () => void;
};

export const usePanelStore = create<PanelState>()(
  persist(
    (set) => ({
      values: {},
      seedControls: {},
      nodeOrder: [],
      nodeColors: {},
      columns: 2,
      outputFilters: [],
      pipOutputFilter: 'all',
      promptTargets: [],
      soundOnFinish: 'chime',
      setValue: (key, v) =>
        set((s) => ({ values: { ...s.values, [key]: v } })),
      setSeedControl: (key, c) =>
        set((s) => ({ seedControls: { ...s.seedControls, [key]: c } })),
      setNodeOrder: (order) => set({ nodeOrder: order }),
      setNodeColor: (nodeId, color) =>
        set((s) => ({
          nodeColors: { ...s.nodeColors, [nodeId]: color },
        })),
      setColumns: (n) => set({ columns: n }),
      toggleOutputFilter: (nodeId) =>
        set((s) => ({
          outputFilters: s.outputFilters.includes(nodeId)
            ? s.outputFilters.filter((x) => x !== nodeId)
            : [...s.outputFilters, nodeId],
        })),
      setOutputFilters: (ids) => set({ outputFilters: ids }),
      setPipOutputFilter: (s) => set({ pipOutputFilter: s }),
      togglePromptTarget: (key) =>
        set((s) => ({
          promptTargets: s.promptTargets.includes(key)
            ? s.promptTargets.filter((k) => k !== key)
            : [...s.promptTargets, key],
        })),
      setPromptTargets: (keys) => set({ promptTargets: keys }),
      setSoundOnFinish: (s) => set({ soundOnFinish: s }),
      resetValues: () => set({ values: {}, seedControls: {} }),
      resetLayout: () => set({ nodeOrder: [], nodeColors: {} }),
    }),
    { name: 'comfy-panel-values' },
  ),
);
