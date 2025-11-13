// src/types/trailer.ts
// Shared types for trailer planning (beats + shots)

export interface TrailerBeatAudio {
  type: string; // "vo" | "dialogue" | "sfx" | "music"
  line?: string;
  who?: string;
  description?: string;
}

export interface TrailerBeatTextCard {
  text: string;
  style?: string;
}

export interface TrailerBeat {
  id: string;
  role: string; // e.g. "hook" | "world" | "character" | "problem" | "escalation" | "twist" | "button"
  time_start: number;
  time_end: number;
  visual_intent: string;
  shot_type?: string;
  source?: string;
  audio?: TrailerBeatAudio | null;
  text_card?: TrailerBeatTextCard | null;
}

export interface TrailerShot {
  id: number;
  beat_id?: string;
  prompt: string;
  negative?: string;
  width?: number;
  height?: number;
  fps?: number;
  length_frames?: number;
}

export interface TrailerMusicSection {
  id: string;
  start: number;
  end: number;
  mood: string;
}

export interface TrailerPlan {
  title?: string;
  duration_sec: number;
  tone?: string[];
  music?: {
    sections?: TrailerMusicSection[];
    notes?: string;
  };
  beats: TrailerBeat[];
  shots: TrailerShot[];
}