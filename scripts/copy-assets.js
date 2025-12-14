
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const srcDir = path.join(rootDir, 'src');
const distDir = path.join(rootDir, 'dist');

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('Copying assets...');

// Copy migrations
const migrationsSrc = path.join(srcDir, 'db', 'migrations');
const migrationsDest = path.join(distDir, 'db', 'migrations');
if (fs.existsSync(migrationsSrc)) {
    copyDir(migrationsSrc, migrationsDest);
    console.log('Migrations copied.');
} else {
    console.warn('Migrations directory not found:', migrationsSrc);
}

// Copy provider templates
const templatesSrc = path.join(srcDir, 'providers', 'templates');
const templatesDest = path.join(distDir, 'providers', 'templates');
if (fs.existsSync(templatesSrc)) {
    copyDir(templatesSrc, templatesDest);
    console.log('Provider templates copied.');
} else {
    console.warn('Templates directory not found:', templatesSrc);
}

console.log('Assets copy complete.');
