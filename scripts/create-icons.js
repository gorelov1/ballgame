/**
 * scripts/create-icons.js
 * Creates minimal valid PNG launcher icons for the Android build.
 * Writes to both:
 *   - res/android/  (source of truth, declared in config.xml)
 *   - platforms/android/.../res/  (direct injection for current build)
 *
 * Run with: node scripts/create-icons.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

// Minimal valid 1x1 white PNG
const MINIMAL_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';

const iconSizes = [
  { dir: 'mipmap-mdpi',    density: 'mdpi'    },
  { dir: 'mipmap-hdpi',    density: 'hdpi'    },
  { dir: 'mipmap-xhdpi',   density: 'xhdpi'   },
  { dir: 'mipmap-xxhdpi',  density: 'xxhdpi'  },
  { dir: 'mipmap-xxxhdpi', density: 'xxxhdpi' },
];

const root    = path.join(__dirname, '..');
const resBase = path.join(root, 'platforms', 'android', 'app', 'src', 'main', 'res');
const srcBase = path.join(root, 'res', 'android');

const pngBuf = Buffer.from(MINIMAL_PNG_B64, 'base64');

for (const { dir, density } of iconSizes) {
  // Write to platforms/ (for current build)
  const platformDir = path.join(resBase, dir);
  fs.mkdirSync(platformDir, { recursive: true });
  fs.writeFileSync(path.join(platformDir, 'ic_launcher.png'), pngBuf);

  // Write to res/android/ (source, picked up by config.xml)
  const srcDir = path.join(srcBase, density);
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(path.join(srcDir, 'ic_launcher.png'), pngBuf);

  console.log('Created icon for', density);
}

console.log('Done.');
