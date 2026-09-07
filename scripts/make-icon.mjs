import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { PROJECT_ROOT, readConfiguration, resolveCustomAsset, writeProjectFile } from './customize-config.mjs';

const ICO_SIZES = [256, 128, 64, 48, 32, 16];
const EXTENSION_SIZES = [128, 48, 32, 16];
const config = readConfiguration();
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

// A marca padrão é vetorial e neutra; imagens personalizadas conservam as próprias cores.
const defaultMark = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">' +
  '<rect x="48" y="48" width="928" height="928" rx="230" fill="#12243b"/>' +
  '<path d="M302 330h190a92 92 0 0 1 92 92v180" fill="none" stroke="' + config.theme.accent + '" stroke-width="80" stroke-linecap="round"/>' +
  '<path d="M722 694H532a92 92 0 0 1-92-92V422" fill="none" stroke="#f3f7ff" stroke-width="80" stroke-linecap="round"/>' +
  '<circle cx="302" cy="330" r="73" fill="#f3f7ff"/><circle cx="722" cy="694" r="73" fill="' + config.theme.accent + '"/>' +
  '</svg>'
);

async function loadImage(relative) {
  const file = resolveCustomAsset(relative, PROJECT_ROOT);
  const input = sharp(file ? readFileSync(file) : defaultMark, { limitInputPixels: 16 * 1024 * 1024 });
  const info = await input.metadata();
  if (file && !['png', 'jpeg', 'webp'].includes(info.format)) throw new Error('Use uma imagem PNG, JPEG ou WebP.');
  if ((info.pages ?? 1) !== 1) throw new Error('Use uma imagem estática para o ícone ou logo.');
  return input.rotate();
}

function pngAt(input, size) {
  return input.clone().resize(size, size, { fit: 'contain', background: transparent }).png({ compressionLevel: 9 }).toBuffer();
}

function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((item) => item.png)]);
}

const appImage = await loadImage(config.icon);
const extensionImage = config.extensionIcon ? await loadImage(config.extensionIcon) : appImage;
const logoImage = config.logo ? await loadImage(config.logo) : appImage;
const icoImages = await Promise.all(ICO_SIZES.map(async (size) => ({ size, png: await pngAt(appImage, size) })));
const preview = await pngAt(appImage, 256);
const outputs = new Map([
  ['build/icon.ico', encodeIco(icoImages)],
  ['build/icon.png', await pngAt(appImage, 1024)],
  ['build/icon-preview.png', preview],
  ['build/runtime-icon.png', preview],
  ['build/brand-logo.png', await pngAt(logoImage, 1024)]
]);
for (const size of EXTENSION_SIZES) outputs.set('extension/icons/icon' + size + '.png', await pngAt(extensionImage, size));
for (const [relative, content] of outputs) writeProjectFile(relative, content);
console.log('Ícones do aplicativo, do instalador, da extensão e logo preparados.');
