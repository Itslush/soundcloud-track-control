import type { TempoProfile } from './tempo-editor';
export interface TempoSet {
  v: 1;
  tracks: TempoProfile[];
  overlaps: number[];
}
export function adjustedDuration(profile: TempoProfile): number;
export function validateTempoSet(
  value: unknown,
  parseTrack: (path: string) => string,
): TempoSet;
export function encodeTempoSet(value: TempoSet): string;
export function decodeTempoSet(
  code: string,
  parseTrack: (path: string) => string,
): TempoSet;
export function tempoSetLink(value: TempoSet, website: string): string;
