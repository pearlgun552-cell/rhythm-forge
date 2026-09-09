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
