interface RhythmForgeBridge {
  onLanguageChange: (callback: (language: 'zh' | 'en') => void) => () => void;
  onSaveProject: (callback: () => void) => () => void;
  onExportMp3: (callback: () => void) => () => void;
  setLanguage: (language: 'zh' | 'en') => void;
}

declare global {
  interface Window {
    rhythmForge?: RhythmForgeBridge;
  }
}

export {};
