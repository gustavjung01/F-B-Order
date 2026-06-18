const path = require('path');
const fs = require('fs');
const JimpModule = require('jimp');
const pngToIco = require('png-to-ico');

const JimpRead = JimpModule.read || (JimpModule.default && JimpModule.default.read) || JimpModule;

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function resize(src, size, dest) {
  const image = await JimpRead(src);
  const horizontal = (JimpModule.HORIZONTAL_ALIGN_CENTER !== undefined) ? JimpModule.HORIZONTAL_ALIGN_CENTER : (JimpModule.constants && JimpModule.constants.HORIZONTAL_ALIGN_CENTER);
  const vertical = (JimpModule.VERTICAL_ALIGN_MIDDLE !== undefined) ? JimpModule.VERTICAL_ALIGN_MIDDLE : (JimpModule.constants && JimpModule.constants.VERTICAL_ALIGN_MIDDLE);
  if (typeof image.contain === 'function') {
    image.contain(size, size, horizontal | vertical);
  } else if (typeof image.cover === 'function') {
    image.cover(size, size);
  }
  if (typeof image.writeAsync === 'function') {
    await image.writeAsync(dest);
  } else if (typeof image.getBuffer === 'function') {
    const buf = await image.getBufferAsync(JimpModule.MIME_PNG);
    fs.writeFileSync(dest, buf);
  }
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
