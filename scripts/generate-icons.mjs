/**
 * Generates app icons from the logo SVG.
 * Outputs: assets/icon.ico (Windows), assets/icon.png (Linux)
 * Run with: node scripts/generate-icons.mjs
 */

import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ASSETS = join(ROOT, 'assets');

mkdirSync(ASSETS, { recursive: true });

// The logo SVG — 36x36 viewBox scaled up
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="none">
  <rect width="36" height="36" rx="9" fill="#7c6ff7"/>
  <path d="M10 11h8a5 5 0 0 1 0 10h-4v4H10V11Z" fill="#fff"/>
  <circle cx="26" cy="25" r="3" fill="#4ade80"/>
</svg>`;

const svgBuffer = Buffer.from(SVG);

// Sizes needed for a proper Windows .ico
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

console.log('Generating PNG layers...');
const pngBuffers = await Promise.all(
  ICO_SIZES.map(size =>
    sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toBuffer()
  )
);

// Save 512x512 PNG for Linux/general use
console.log('Saving icon.png (512x512)...');
await sharp(svgBuffer)
  .resize(512, 512)
  .png()
  .toFile(join(ASSETS, 'icon.png'));

// Build .ico from all PNG sizes
console.log('Building icon.ico...');
const icoBuffer = await pngToIco(pngBuffers);
writeFileSync(join(ASSETS, 'icon.ico'), icoBuffer);

console.log('Done!');
console.log('  assets/icon.ico  — Windows installer icon');
console.log('  assets/icon.png  — Linux / general use');
