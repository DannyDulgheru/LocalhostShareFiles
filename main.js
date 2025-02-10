// main.js
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const path = require('path');
const os = require('os');
const express = require('express');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const mime = require('mime-types');
const fs = require('fs');
const fetch = require('node-fetch');


// ---------- Utility: Get local IP ----------
function getLocalIP() {
  const nets = os.networkInterfaces();
  let ipAddress = '127.0.0.1';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
         ipAddress = net.address;
         break;
      }
    }
    if (ipAddress !== '127.0.0.1') break;
  }
  return ipAddress;
}

// ---------- Global configuration ----------
const PORT = 5000;
let sharedFiles = {}; // Mapping: shareId -> filePath

// ---------- Set up Express server ----------
const expressApp = express();
expressApp.use(express.json());

// POST /register: Register a file for sharing.
expressApp.post('/register', (req, res) => {
  const { filepath } = req.body;
  if (!filepath || !fs.existsSync(filepath)) {
    return res.status(400).json({ error: 'File does not exist' });
  }
  const shareId = uuidv4();
  sharedFiles[shareId] = filepath;
  const localIP = getLocalIP();
  const shareUrl = `http://${localIP}:${PORT}/share/${shareId}`;
  console.log(`Registered file: ${filepath}`);
  console.log(`Share URL: ${shareUrl}`);
  res.json({ url: shareUrl });
});

// GET /file/:shareId: Return file inline (for preview).
expressApp.get('/file/:shareId', (req, res) => {
  const shareId = req.params.shareId;
  const filepath = sharedFiles[shareId];
  if (!filepath || !fs.existsSync(filepath)) {
    return res.status(404).send('File not found');
  }
  res.sendFile(filepath);
});

// GET /download/:shareId: Download the file.
expressApp.get('/download/:shareId', (req, res) => {
  const shareId = req.params.shareId;
  const filepath = sharedFiles[shareId];
  if (!filepath || !fs.existsSync(filepath)) {
    return res.status(404).send('File not found');
  }
  res.download(filepath);
});

// GET /share/:shareId: Return an HTML preview page.
expressApp.get('/share/:shareId', (req, res) => {
  const shareId = req.params.shareId;
  const filepath = sharedFiles[shareId];
  if (!filepath || !fs.existsSync(filepath)) {
    return res.status(404).send('File not found');
  }
  const filename = path.basename(filepath);
  const mimeType = mime.lookup(filepath) || 'application/octet-stream';

  // Common CSS styling.
  const commonCSS = `
    <style>
      body { font-family: Arial, sans-serif; background-color: #f2f2f2; margin: 0; padding: 0; }
      .container { text-align: center; margin: 50px auto; max-width: 800px; background-color: #fff;
                   padding: 20px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
      .download-button { display: inline-block; padding: 10px 20px; margin-top: 20px;
                         background-color: #007BFF; color: #fff; text-decoration: none; border-radius: 4px;
                         transition: background-color 0.3s ease; }
      .download-button:hover { background-color: #0056b3; }
    </style>
  `;

  let html = '';
  if (mimeType.startsWith('video')) {
    html = `
      <html>
      <head><title>Preview: ${filename}</title>${commonCSS}</head>
      <body>
        <div class="container">
          <h1>Preview: ${filename}</h1>
          <video controls style="max-width:100%; height:auto;">
            <source src="/file/${shareId}" type="${mimeType}">
            Your browser does not support the video tag.
          </video>
          <br>
          <a href="/download/${shareId}" class="download-button">Download file</a>
        </div>
      </body>
      </html>
    `;
  } else if (mimeType.startsWith('audio')) {
    html = `
      <html>
      <head><title>Preview: ${filename}</title>${commonCSS}</head>
      <body>
        <div class="container">
          <h1>Preview: ${filename}</h1>
          <audio controls style="width:100%;">
            <source src="/file/${shareId}" type="${mimeType}">
            Your browser does not support the audio element.
          </audio>
          <br>
          <a href="/download/${shareId}" class="download-button">Download file</a>
        </div>
      </body>
      </html>
    `;
  } else if (mimeType.startsWith('image')) {
    html = `
      <html>
      <head><title>Preview: ${filename}</title>${commonCSS}</head>
      <body>
        <div class="container">
          <h1>Preview: ${filename}</h1>
          <img src="/file/${shareId}" alt="Image preview" style="max-width:100%; height:auto;">
          <br>
          <a href="/download/${shareId}" class="download-button">Download file</a>
        </div>
      </body>
      </html>
    `;
  } else if (mimeType.startsWith('text')) {
    let content = '';
    try {
      content = fs.readFileSync(filepath, 'utf-8');
    } catch(e) {
      content = 'Could not read file.';
    }
    html = `
      <html>
      <head><title>Preview: ${filename}</title>${commonCSS}</head>
      <body>
        <div class="container">
          <h1>Preview: ${filename}</h1>
          <pre style="text-align:left; white-space: pre-wrap;">${content}</pre>
          <br>
          <a href="/download/${shareId}" class="download-button">Download file</a>
        </div>
      </body>
      </html>
    `;
  } else {
    html = `
      <html>
      <head><title>${filename}</title>${commonCSS}</head>
      <body>
        <div class="container">
          <h1>${filename}</h1>
          <br>
          <a href="/download/${shareId}" class="download-button">Download file</a>
        </div>
      </body>
      </html>
    `;
  }
  res.send(html);
});

// GET /history: Return JSON array of all shared files.
expressApp.get('/history', (req, res) => {
  const localIP = getLocalIP();
  let history = [];
  for (const shareId in sharedFiles) {
    const filepath = sharedFiles[shareId];
    const fileName = path.basename(filepath);
    const shareUrl = `http://${localIP}:${PORT}/share/${shareId}`;
    history.push({ shareId, fileName, shareUrl });
  }
  res.json(history);
});

// Start the Express server.
const server = http.createServer(expressApp);
server.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
});

// ---------- Electron Main Process: Create the BrowserWindow ----------
let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      // For simplicity, enable nodeIntegration (note: check Electron security guidelines)
      nodeIntegration: true,
      contextIsolation: false,
    }
  });
  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // Quit on non-macOS platforms.
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ---------- IPC Handlers ----------

// Open a file–selection dialog and share the selected file.
ipcMain.handle('share-file', async (event) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  const filePath = result.filePaths[0];
  // Call the local /register endpoint using our dynamic fetch.
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filepath: filePath })
    });
    const data = await response.json();
    return { filePath, shareUrl: data.url };
  } catch (err) {
    throw err;
  }
});

// Return the shared files history.
ipcMain.handle('get-history', async (event) => {
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/history`);
    return await response.json();
  } catch (err) {
    return [];
  }
});

// Delete a shared file entry.
ipcMain.handle('delete-share', async (event, shareId) => {
  if (sharedFiles.hasOwnProperty(shareId)) {
    delete sharedFiles[shareId];
  }
  return true;
});

// Open an external link.
ipcMain.handle('open-link', async (event, link) => {
  shell.openExternal(link);
  return true;
});

// Copy text (link) to the clipboard.
ipcMain.handle('copy-link', async (event, link) => {
  clipboard.writeText(link);
  return true;
});
