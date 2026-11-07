const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('clooteeDesktop', Object.freeze({
  recover: () => ipcRenderer.invoke('clootee:recover')
}));
