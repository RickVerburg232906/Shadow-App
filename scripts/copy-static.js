import fs from 'fs';
import path from 'path';

const root = process.cwd();
const dist = path.join(root, 'dist');

function copyIfExists(srcRel, destRel) {
  const src = path.join(root, srcRel);
  const dest = path.join(dist, destRel);
  try {
    if (!fs.existsSync(src)) return;
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      // copy directory recursively
      fs.mkdirSync(dest, { recursive: true });
      for (const name of fs.readdirSync(src)) {
        copyIfExists(path.join(srcRel, name), path.join(destRel, name));
      }
    } else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      console.log('Copied', srcRel, '→', destRel);
    }
  } catch (e) {
    console.error('Failed to copy', srcRel, e);
  }
}

// Files and folders to copy to dist root
const toCopy = [
  'sw.js',
  'manifest.webmanifest',
  'assets'
];

for (const item of toCopy) copyIfExists(item, item);

// Create a minimal favicon if none exists to avoid 404s
const faviconSrc = path.join(root, 'favicon.ico');
const faviconDest = path.join(dist, 'favicon.ico');
if (!fs.existsSync(faviconDest)) {
  if (fs.existsSync(faviconSrc)) {
    fs.copyFileSync(faviconSrc, faviconDest);
    console.log('Copied favicon.ico');
  } else {
    // create a 1x1 transparent ICO (simple binary)
    const ico = Buffer.from([
      0x00,0x00,0x01,0x00,0x01,0x00,0x10,0x10,0x00,0x00,0x01,0x00,0x04,0x00,0x28,0x01,
      0x00,0x00,0x16,0x00,0x00,0x00,0x28,0x00,0x00,0x00,0x10,0x00,0x00,0x00,0x10,0x00,
      0x00,0x00,0x01,0x00,0x04,0x00,0x00,0x00,0x00,0x00,0x80,0x00,0x00,0x00,0x12,0x0B,
      0x00,0x00,0x12,0x0B,0x00,0x00,0x00,0x00,0x00,0x00
    ]);
    try {
      fs.writeFileSync(faviconDest, ico);
      console.log('Created placeholder favicon.ico');
    } catch (e) { console.error('favicon create failed', e); }
  }
}
