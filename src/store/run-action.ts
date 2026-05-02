'use client';

import { create } from 'zustand';

type State = {
  run: (() => void | Promise<void>) | null;
  busy: boolean;
  canRun: boolean;
  setRun: (fn: (() => void | Promise<void>) | null) => void;
  setBusy: (busy: boolean) => void;
  setCanRun: (canRun: boolean) => void;
};

export const useRunAction = create<State>((set) => ({
  run: null,
  busy: false,
  canRun: false,
  setRun: (fn) => set({ run: fn }),
  setBusy: (busy) => set({ busy }),
  setCanRun: (canRun) => set({ canRun }),
}));
