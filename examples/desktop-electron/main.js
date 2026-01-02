const { app, BrowserWindow } = require('electron');
const path = require('node:path');

// Load environment variables from .env file if it exists
try {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (_e) {
  // dotenv is optional, continue without it
}

function createWindow() {
  const win = new BrowserWindow({
    width: 500,
    height: 700,
    minWidth: 400,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    backgroundColor: '#0d1b2a',
    titleBarStyle: 'hiddenInset',
    vibrancy: 'dark',
    show: false, // Don't show until ready
  });

  // Show window when ready to prevent visual flash
  win.once('ready-to-show', () => {
    win.show();
  });

  win.loadFile('index.html');

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }
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
