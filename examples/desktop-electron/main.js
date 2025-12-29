const { app, BrowserWindow } = require('electron');
const _path = require('node:path');

function createWindow() {
  const win = new BrowserWindow({
    width: 450,
    height: 650,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    backgroundColor: '#1e3a5f',
    titleBarStyle: 'hiddenInset',
    vibrancy: 'dark',
  });

  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
