import { useSyncExternalStore } from 'react';
import { messages, type Language, type MessageKey } from './messages';

const STORAGE_KEY = 'rhythm-forge-language';

function loadStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'zh') return stored;
  } catch {
    // Ignore storage errors and fall through to the default.
  }
  return 'zh';
}

export class LanguageStore {
  private language: Language = loadStoredLanguage();
  private listeners = new Set<() => void>();

  getLanguage = (): Language => this.language;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setLanguage = (language: Language): void => {
    this.language = language;
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Non-fatal if storage is unavailable.
    }
    this.listeners.forEach((listener) => listener());
  };
}

export const languageStore = new LanguageStore();

export interface UseLanguage {
  language: Language;
  t: (key: MessageKey) => string;
  setLanguage: (language: Language) => void;
}

export function useLanguage(): UseLanguage {
  const language = useSyncExternalStore(languageStore.subscribe, languageStore.getLanguage);
  const t = (key: MessageKey): string => messages[language][key] ?? key;
  return { language, t, setLanguage: languageStore.setLanguage };
}

export type { Language, MessageKey };
export { messages };
