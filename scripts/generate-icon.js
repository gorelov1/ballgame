/**
 * scripts/generate-icon.js
 * Generates a proper Ball Bounce Game launcher icon as PNG files.
 * Uses the 'canvas' npm package to draw the icon programmatically.
 *
 * Run: node scripts/generate-icon.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

// Try to use the canvas package; fall back to writing a hand-crafted PNG
let createCanvas;
try {
  ({ createCanvas } = require('canvas'));
} catch (_) {
  createCanvas = null;
}

// Icon sizes needed for Android
const SIZES = [
  { density: 'mdpi',    px: 48  },
  { density: 'hdpi',    px: 72  },
  { density: 'xhdpi',   px: 96  },
  { density: 'xxhdpi',  px: 144 },
  { density: 'xxxhdpi', px: 192 },
];

const root = path.join(__dirname, '..');

function writeIcon(buf, density) {
  const srcDir      = path.join(root, 'res', 'android', density);
  const platformDir = path.join(root, 'platforms', 'android', 'app', 'src', 'main', 'res', `mipmap-${density}`);
  fs.mkdirSync(srcDir,      { recursive: true });
  fs.mkdirSync(platformDir, { recursive: true });
  fs.writeFileSync(path.join(srcDir,      'ic_launcher.png'), buf);
  fs.writeFileSync(path.join(platformDir, 'ic_launcher.png'), buf);
  console.log(`Written ${density} (${buf.length} bytes)`);
}

if (createCanvas) {
  // ── Draw a proper icon with the canvas package ──────────────────────────
  for (const { density, px } of SIZES) {
    const canvas = createCanvas(px, px);
    const ctx    = canvas.getContext('2d');
    const r      = px / 2;

    // Background: dark blue gradient
    const bg = ctx.createLinearGradient(0, 0, 0, px);
    bg.addColorStop(0, '#0a0a2e');
    bg.addColorStop(1, '#1a1a4e');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(0, 0, px, px, px * 0.18);
    ctx.fill();

    // Platform line (white, angled)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = Math.max(2, px * 0.06);
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(px * 0.15, px * 0.72);
    ctx.lineTo(px * 0.55, px * 0.58);
    ctx.stroke();

    // Second platform
    ctx.beginPath();
    ctx.moveTo(px * 0.45, px * 0.42);
    ctx.lineTo(px * 0.85, px * 0.28);
    ctx.stroke();

    // Ball (white circle with glow)
    const ballR = px * 0.13;
    const ballX = px * 0.38;
    const ballY = px * 0.48;
    ctx.shadowColor = '#88ccff';
    ctx.shadowBlur  = px * 0.12;
    ctx.fillStyle   = '#ffffff';
    ctx.beginPath();
    ctx.arc(ballX, ballY, ballR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Gem (gold diamond)
    const gx = px * 0.72;
    const gy = px * 0.65;
    const gs = px * 0.08;
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.moveTo(gx,      gy - gs);
    ctx.lineTo(gx + gs, gy);
    ctx.lineTo(gx,      gy + gs);
    ctx.lineTo(gx - gs, gy);
    ctx.closePath();
    ctx.fill();

    writeIcon(canvas.toBuffer('image/png'), density);
  }
  console.log('\nIcons generated with canvas package.');

} else {
  // ── Fallback: embed a hand-crafted 192x192 PNG as base64 ────────────────
  // This is a real 192x192 PNG with a dark background, white ball, and line.
  // Generated offline and embedded here so no external tools are needed.
  console.log('canvas package not found — install it for a better icon:');
  console.log('  npm install canvas');
  console.log('\nFalling back to a simple coloured PNG...');

  // Build a minimal but valid coloured PNG programmatically (pure Node.js)
  // We'll create a simple 192x192 dark-blue PNG with no external deps.
  function buildSimplePNG(width, height, r, g, b) {
    const { deflateSync } = require('zlib');

    function crc32(buf) {
      let crc = 0xFFFFFFFF;
      const table = [];
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        table[i] = c;
      }
      for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
      return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function chunk(type, data) {
      const typeBytes = Buffer.from(type, 'ascii');
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
      const crcBuf = Buffer.concat([typeBytes, data]);
      const crcVal = Buffer.alloc(4); crcVal.writeUInt32BE(crc32(crcBuf));
      return Buffer.concat([len, typeBytes, data, crcVal]);
    }

    // IHDR
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width,  0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8]  = 8;  // bit depth
    ihdr[9]  = 2;  // colour type: RGB
    ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

    // Raw image data: each row = filter byte (0) + RGB pixels
    const rowSize = 1 + width * 3;
    const raw = Buffer.alloc(height * rowSize);
    for (let y = 0; y < height; y++) {
      raw[y * rowSize] = 0; // filter: None
      for (let x = 0; x < width; x++) {
        const off = y * rowSize + 1 + x * 3;
        // Dark blue background
        let pr = 10, pg = 10, pb = 46;
        // White ball in centre-left area
        const cx = width * 0.38, cy = height * 0.48, cr = width * 0.13;
        const dx = x - cx, dy = y - cy;
        if (dx*dx + dy*dy < cr*cr) { pr = 255; pg = 255; pb = 255; }
        // White platform line
        const lx1 = width*0.15, ly1 = height*0.72, lx2 = width*0.55, ly2 = height*0.58;
        const ldx = lx2-lx1, ldy = ly2-ly1, llen = Math.sqrt(ldx*ldx+ldy*ldy);
        const t = Math.max(0, Math.min(1, ((x-lx1)*ldx+(y-ly1)*ldy)/(llen*llen)));
        const dist = Math.sqrt(Math.pow(x-lx1-t*ldx,2)+Math.pow(y-ly1-t*ldy,2));
        if (dist < width*0.04) { pr = 255; pg = 255; pb = 255; }
        // Gold gem
        const gx2 = width*0.72, gy2 = height*0.65, gs = width*0.08;
        if (Math.abs(x-gx2)+Math.abs(y-gy2) < gs) { pr = 255; pg = 215; pb = 0; }
        raw[off] = pr; raw[off+1] = pg; raw[off+2] = pb;
      }
    }

    const idat = deflateSync(raw);
    const sig  = Buffer.from([137,80,78,71,13,10,26,10]);
    return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
  }

  for (const { density, px } of SIZES) {
    const buf = buildSimplePNG(px, px, 10, 10, 46);
    writeIcon(buf, density);
  }
  console.log('\nSimple PNG icons generated.');
}
