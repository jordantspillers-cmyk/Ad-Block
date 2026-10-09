// Packages the extension into dist/tubeshield-<version>.zip, ready to upload
// to the Chrome Web Store. Run: npm run build
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (manifest.version !== pkg.version) {
  console.error(`Version mismatch: manifest.json ${manifest.version}, package.json ${pkg.version}`);
  process.exit(1);
}

// Only what the browser needs goes in the zip.
const INCLUDE = ['manifest.json', 'icons', 'options', 'popup', 'rules', 'src'];
for (const p of INCLUDE) {
  if (!existsSync(join(root, p))) throw new Error(`missing ${p}`);
}

const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });
const out = join(dist, `tubeshield-${manifest.version}.zip`);
rmSync(out, { force: true });
execFileSync('zip', ['-r', '-X', '-q', out, ...INCLUDE, '-x', '*.DS_Store'], { cwd: root, stdio: 'inherit' });
console.log(`Built ${out}`);
