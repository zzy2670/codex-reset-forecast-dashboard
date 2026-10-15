const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('dashboard', {
  get: () => ipcRenderer.invoke('dashboard:get'),
  refresh: () => ipcRenderer.invoke('dashboard:refresh'),
  pause: () => ipcRenderer.invoke('dashboard:pause'),
  openLink: url => ipcRenderer.invoke('dashboard:link',url),
  connectQuota: () => ipcRenderer.invoke('dashboard:connect-quota'),
  cancelQuotaLogin: () => ipcRenderer.invoke('dashboard:cancel-quota-login'),
  refreshQuota: () => ipcRenderer.invoke('dashboard:quota'),
  saveSettings: patch => ipcRenderer.invoke('dashboard:settings',patch),
  testNotification: () => ipcRenderer.invoke('dashboard:test-notification'),
  readEvents: () => ipcRenderer.invoke('dashboard:read-events'),
  window: action => ipcRenderer.invoke('dashboard:window',action),
  quit: () => ipcRenderer.invoke('dashboard:quit'),
  ready: () => ipcRenderer.invoke('dashboard:ready'),
  onState: callback => { const listener=(_event,state)=>callback(state); ipcRenderer.on('dashboard:state',listener); return () => ipcRenderer.removeListener('dashboard:state',listener); }
});
