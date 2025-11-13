"use client";
import { create } from "zustand";

type ScreenplayState = {
  text: string;
  set: (t: string) => void;
  patch: (fn: (t: string) => string) => void;
};

export const useScreenplayStore = create<ScreenplayState>((set, get) => ({
  text: "",
  set: (t) => set({ text: t }),
  patch: (fn) => set({ text: fn(get().text) }),
}));