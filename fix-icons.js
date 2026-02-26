const sharp = require('sharp');
const path = require('path');

async function fixIcons() {
  const src = path.join(__dirname, 'icons', 'icon128.png');

  // Read and trim transparent edges to get just the circle
  const trimmed = await sharp(src).trim().toBuffer();
  const meta = await sharp(trimmed).metadata();
  console.log(`Trimmed size: ${meta.width}x${meta.height}`);

  // Scale trimmed circle to fill 128x128 (cover mode clips edges)
  const sizes = [128, 48, 16];
  for (const size of sizes) {
    const out = path.join(__dirname, 'icons', `icon${size}.png`);
    await sharp(trimmed)
      .resize(size, size, { fit: 'cover' })
      .png()
      .toFile(out);
    console.log(`Wrote ${out}`);
  }

  // Also update docs icon if it exists
  const docsIcon = path.join(__dirname, 'docs', 'icon.png');
  try {
    await sharp(trimmed)
      .resize(128, 128, { fit: 'cover' })
      .png()
      .toFile(docsIcon);
    console.log(`Wrote ${docsIcon}`);
  } catch (e) {
    // docs/icon.png may not exist, that's fine
  }

  console.log('\nDone! Icons now fill the entire area.');
}

fixIcons().catch(console.error);
