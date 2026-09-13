interface RhythmForgeBridge {
  onLanguageChange: (callback: (language: 'zh' | 'en') => void) => () => void;
  onSaveProject: (callback: () => void) => () => void;
  onExportMp3: (callback: () => void) => () => void;
  onProjectCommand: (callback: (command: string) => void) => () => void;
  openProject: () => Promise<{ content: string; path: string } | null>;
  saveProject: (content: string, name: string, saveAs: boolean) => Promise<string | null>;
  newProject: () => void;
  setDirty: (dirty: boolean) => void;
  closeSaved: () => void;
  setLanguage: (language: 'zh' | 'en') => void;
}

declare global {
  interface Window {
    rhythmForge?: RhythmForgeBridge;
  }
}

export {};
