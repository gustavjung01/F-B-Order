const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const _pngToIco = require('png-to-ico');
const pngToIco = (_pngToIco && _pngToIco.default) ? _pngToIco.default : _pngToIco;

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function resize(src, size, dest) {
  await sharp(src).resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toFile(dest);
}

async function main() {
  const workspaceRoot = path.resolve(__dirname, '..', '..');
  const src = path.join(workspaceRoot, '..', 'design', 'brand', 'bepsi-approved-app-icon.png');
  if (!fs.existsSync(src)) {
    console.error('SOURCE_NOT_FOUND', src);
    process.exit(2);
  }

  const outDir = path.join(workspaceRoot, 'public', 'icons');
  await ensureDir(outDir);

  try {
    await resize(src, 192, path.join(outDir, 'icon-192.png'));
    await resize(src, 512, path.join(outDir, 'icon-512.png'));
    await resize(src, 512, path.join(outDir, 'maskable-512.png'));
    await resize(src, 180, path.join(outDir, 'apple-touch-icon.png'));
    await resize(src, 32, path.join(outDir, 'favicon-32.png'));
    await resize(src, 16, path.join(outDir, 'favicon-16.png'));

    const icoBuffer = await pngToIco([path.join(outDir, 'favicon-16.png'), path.join(outDir, 'favicon-32.png')]);
    fs.writeFileSync(path.join(workspaceRoot, 'public', 'favicon.ico'), icoBuffer);

    console.log('ICONS_GENERATED');
  } catch (err) {
    console.error('ERROR', err);
    process.exit(1);
  }
}

main();
