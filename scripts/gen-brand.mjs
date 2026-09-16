// Renders the favicon set, the web-app icons and the Open Graph card from
// web/public/favicon.svg and the studio screenshot. Outputs are committed under
// web/public; rerun after changing the mark or the screenshot.
import fs from 'node:fs';
import sharp from 'sharp';

const out = 'web/public';
const mark = fs.readFileSync(`${out}/favicon.svg`);
const icon = (size) => sharp(mark, { density: (72 * size) / 64 }).resize(size, size).png();

for (const [name, size] of [['favicon-96x96', 96], ['apple-touch-icon', 180], ['icon-192', 192], ['icon-512', 512]]) {
  await icon(size).toFile(`${out}/${name}.png`);
}

// Maskable icon: the mark sits in the safe zone (inner 80%) on a solid tile.
const maskable = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="512" height="512">
  <rect width="24" height="24" fill="#fff"/>
  <path d="M3 10v4m4-8v12m5-16v20m5-16v12m4-8v4" transform="translate(5.4 5.4) scale(.55)" fill="none" stroke="#d56498" stroke-width="3.2" stroke-linecap="round"/>
</svg>`);
await sharp(maskable).png().toFile(`${out}/icon-maskable-512.png`);

// favicon.ico with PNG entries (16, 32, 48), which every current browser reads.
const entries = await Promise.all([16, 32, 48].map(async (size) => ({ size, png: await icon(size).toBuffer() })));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(entries.length, 4);
let offset = 6 + 16 * entries.length;
const dir = entries.map(({ size, png }) => {
  const d = Buffer.alloc(16);
  d.writeUInt8(size, 0); d.writeUInt8(size, 1); d.writeUInt8(0, 2); d.writeUInt8(0, 3);
  d.writeUInt16LE(1, 4); d.writeUInt16LE(32, 6); d.writeUInt32LE(png.length, 8); d.writeUInt32LE(offset, 12);
  offset += png.length;
  return d;
});
fs.writeFileSync(`${out}/favicon.ico`, Buffer.concat([header, ...dir, ...entries.map((e) => e.png)]));

// Open Graph card: title block on the left, the studio screenshot on the right.
const W = 1200, H = 630;
const shotW = 660, shotH = Math.round((shotW * 1000) / 1600), shotX = 600, shotY = 150;
const card = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffdcec"/><stop offset=".46" stop-color="#f4e8fb"/><stop offset="1" stop-color="#ddecff"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <g transform="translate(72 84) scale(3)">
    <rect x=".5" y=".5" width="23" height="23" rx="5.5" fill="#fff" stroke="#4ba8ea" stroke-width=".5"/>
    <path d="M3 10v4m4-8v12m5-16v20m5-16v12m4-8v4" transform="translate(3.6 3.6) scale(.7)" fill="none" stroke="#d56498" stroke-width="3.2" stroke-linecap="round"/>
  </g>
  <g font-family="Noto Sans CJK JP" fill="#27374c">
    <text x="72" y="266" font-size="92" font-weight="700" letter-spacing="-3">Koenami</text>
    <text x="72" y="334" font-size="44" font-weight="700">声の練習</text>
    <text x="72" y="410" font-size="27" fill="#3f4a62">見本の声を聴いて録音し、</text>
    <text x="72" y="452" font-size="27" fill="#3f4a62">高さや響きを地図で見比べる</text>
    <text x="72" y="562" font-size="26" font-weight="500" fill="#1a78c2">koe.transnavi.jp</text>
  </g>
</svg>`);
const frame = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${shotW}" height="${shotH}"><rect width="${shotW}" height="${shotH}" rx="18" fill="#fff"/></svg>`);
const shot = await sharp('docs/images/studio-light.png').resize(shotW, shotH)
  .composite([{ input: frame, blend: 'dest-in' }]).png().toBuffer();
const border = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${shotW + 4}" height="${shotH + 4}"><rect x="1" y="1" width="${shotW + 2}" height="${shotH + 2}" rx="20" fill="none" stroke="#4ba8ea" stroke-opacity=".6" stroke-width="2"/></svg>`);
await sharp(card).composite([
  { input: shot, left: shotX, top: shotY },
  { input: border, left: shotX - 2, top: shotY - 2 },
]).png({ compressionLevel: 9 }).toFile(`${out}/og-image.png`);
console.log('brand assets written to', out);
