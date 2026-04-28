/**
 * scripts/serve.js — minimal static file server for browser development.
 * Serves the www/ directory on http://localhost:8080
 * Run with: node scripts/serve.js
 */

'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT    = 8080;
const WWW_DIR = path.join(__dirname, '..', 'www');

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  let urlPath = req.url === '/' ? '/index.html' : req.url;
  // Strip query strings
  urlPath = urlPath.split('?')[0];

  const filePath = path.join(WWW_DIR, urlPath);
  const ext      = path.extname(filePath);
  const mime     = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`Not found: ${urlPath}`);
      return;
    }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\nBall Bounce Game dev server running at:\n`);
  console.log(`  http://localhost:${PORT}\n`);
  console.log(`Open that URL in Chrome and use your mouse to draw platforms.\n`);
  console.log(`Press Ctrl+C to stop.\n`);
});
