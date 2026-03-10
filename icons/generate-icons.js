/**
 * TubePilot Icon Generator — 3C Minimal Bold
 * Dark center (#1a1a1a), thick red gradient ring (#e63946 → #cc0000),
 * red (#cc0000) play triangle.
 *
 * Usage: node icons/generate-icons.js
 * Requires: npm install @napi-rs/canvas
 */

const { createCanvas } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

function draw3C(canvas) {
  const sz = canvas.width;
  const ctx = canvas.getContext('2d');
  const cx = sz / 2, cy = sz / 2, r = sz * 0.44;

  // Dark fill
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1a1a';
  ctx.fill();

  // Thick red gradient ring
  const ringW = sz * 0.07;
  const ringGrad = ctx.createLinearGradient(0, 0, sz, sz);
  ringGrad.addColorStop(0, '#e63946');
  ringGrad.addColorStop(1, '#cc0000');
  ctx.beginPath();
  ctx.arc(cx, cy, r - ringW / 2, 0, Math.PI * 2);
  ctx.strokeStyle = ringGrad;
  ctx.lineWidth = ringW;
  ctx.stroke();

  // Large red play triangle
  const triR = r * 0.42;
  const offsetX = sz * 0.035;
  ctx.beginPath();
  ctx.moveTo(cx + triR + offsetX, cy);
  ctx.lineTo(cx - triR * 0.55 + offsetX, cy - triR * 0.9);
  ctx.lineTo(cx - triR * 0.55 + offsetX, cy + triR * 0.9);
  ctx.closePath();
  ctx.fillStyle = '#cc0000';
  ctx.fill();
}

const iconsDir = path.dirname(__filename);
const docsDir = path.join(iconsDir, '..', 'docs');

const sizes = [
  { size: 128, file: 'icon128.png' },
  { size: 48,  file: 'icon48.png' },
  { size: 16,  file: 'icon16.png' },
];

for (const { size, file } of sizes) {
  const canvas = createCanvas(size, size);
  draw3C(canvas);
  const outPath = path.join(iconsDir, file);
  fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
  console.log(`  wrote ${outPath} (${size}x${size})`);
}

// fab-icon.png = copy of 48px
const fab48 = createCanvas(48, 48);
draw3C(fab48);
const fabPath = path.join(iconsDir, 'fab-icon.png');
fs.writeFileSync(fabPath, fab48.toBuffer('image/png'));
console.log(`  wrote ${fabPath} (48x48 fab)`);

// docs/icon.png = copy of 128px
const docs128 = createCanvas(128, 128);
draw3C(docs128);
const docsPath = path.join(docsDir, 'icon.png');
fs.writeFileSync(docsPath, docs128.toBuffer('image/png'));
console.log(`  wrote ${docsPath} (128x128 docs)`);

console.log('\nAll icons generated successfully.');
