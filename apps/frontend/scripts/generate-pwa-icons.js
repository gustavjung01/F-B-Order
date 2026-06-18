const path = require('path');
const fs = require('fs');
let Jimp;
try {
  Jimp = require('jimp');
} catch (e) {
  // try dynamic import fallback
  Jimp = (await import('jimp')).default || (await import('jimp'));
}
// some distributions export functions on default
const JimpRead = Jimp.read || (Jimp.default && Jimp.default.read) || Jimp;
const pngToIco = require('png-to-ico');

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function resize(src, size, dest) {
  const image = await JimpRead(src);
  const horizontal = (Jimp.HORIZONTAL_ALIGN_CENTER !== undefined) ? Jimp.HORIZONTAL_ALIGN_CENTER : Jimp.constants.HORIZONTAL_ALIGN_CENTER;
  const vertical = (Jimp.VERTICAL_ALIGN_MIDDLE !== undefined) ? Jimp.VERTICAL_ALIGN_MIDDLE : Jimp.constants.VERTICAL_ALIGN_MIDDLE;
  if (typeof image.contain === 'function') {
    image.contain(size, size, horizontal | vertical);
  } else if (typeof image.cover === 'function') {
    image.cover(size, size);
  }
  if (typeof image.writeAsync === 'function') {
    await image.writeAsync(dest);
  } else if (typeof image.getBuffer === 'function') {
    const buf = await image.getBufferAsync(Jimp.MIME_PNG);
    require('fs').writeFileSync(dest, buf);
  }
}

async function main() {
  const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
  const src = path.join(workspaceRoot, 'design', 'brand', 'bepsi-approved-app-icon.png');
  if (!fs.existsSync(src)) {
    console.error('SOURCE_NOT_FOUND', src);
    process.exit(2);
  }

  const outDir = path.join(workspaceRoot, 'apps', 'frontend', 'public', 'icons');
  await ensureDir(outDir);

  const sizes = [192, 512, 180, 32, 16];
  try {
    await resize(src, 192, path.join(outDir, 'icon-192.png'));
    await resize(src, 512, path.join(outDir, 'icon-512.png'));
    await resize(src, 512, path.join(outDir, 'maskable-512.png'));
    await resize(src, 180, path.join(outDir, 'apple-touch-icon.png'));
    await resize(src, 32, path.join(outDir, 'favicon-32.png'));
    await resize(src, 16, path.join(outDir, 'favicon-16.png'));

    // create favicon.ico from 16 & 32
    const icoBuffer = await pngToIco([path.join(outDir, 'favicon-16.png'), path.join(outDir, 'favicon-32.png')]);
    fs.writeFileSync(path.join(workspaceRoot, 'apps', 'frontend', 'public', 'favicon.ico'), icoBuffer);

    console.log('ICONS_GENERATED');
  } catch (err) {
    console.error('ERROR', err);
    process.exit(1);
  }
}

main();
