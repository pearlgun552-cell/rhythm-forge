import type { Project } from '../types/music';
import { useSyncExternalStore } from 'react';

export interface ImportedSample {
  data: ArrayBuffer;
  name: string;
  mimeType: string;
}

/**
 * Holds an optional user-imported audio sample that overrides the built-in
 * base sample for the sampled instrument. Kept in memory for the session so
 * arbitrary file sizes do not risk overflowing localStorage.
 */
class SampleStore {
  private imported: ImportedSample | null = null;
  private listeners = new Set<() => void>();

  getImported = (): ImportedSample | null => this.imported;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setImported(sample: ImportedSample | null): void {
    this.imported = sample;
    this.listeners.forEach((listener) => listener());
  }
}

export const sampleStore = new SampleStore();

export function useImportedSample(): ImportedSample | null {
  return useSyncExternalStore(sampleStore.subscribe, sampleStore.getImported);
}

export function encodeSample(sample: ImportedSample | null): Project['importedSample'] {
  if (!sample) return undefined;
  const bytes = new Uint8Array(sample.data);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { name: sample.name, mimeType: sample.mimeType, base64: btoa(binary) };
}
export function decodeSample(sample: Project['importedSample']): ImportedSample | null {
  if (!sample) return null;
  const binary = atob(sample.base64);
  return { name: sample.name, mimeType: sample.mimeType, data: Uint8Array.from(binary, c => c.charCodeAt(0)).buffer };
}
