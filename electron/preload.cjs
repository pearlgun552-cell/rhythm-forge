const { contextBridge, ipcRenderer } = require('electron');

// Safe, minimal bridge between the sandboxed renderer and the main process.
// Only the channels the app needs are exposed.
contextBridge.exposeInMainWorld('rhythmForge', {
  onLanguageChange: (callback) => {
    const handler = (_event, language) => callback(language);
    ipcRenderer.on('menu:language', handler);
    return () => ipcRenderer.removeListener('menu:language', handler);
  },
  onSaveProject: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('menu:save-project', handler);
    return () => ipcRenderer.removeListener('menu:save-project', handler);
  },
  onExportMp3: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('menu:export-mp3', handler);
    return () => ipcRenderer.removeListener('menu:export-mp3', handler);
  },
  setLanguage: (language) => ipcRenderer.send('app:language', language),
});
