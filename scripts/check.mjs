import { readdir, readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
const scripts = [];
async function visit(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${item.name}`;
    if (item.isDirectory()) await visit(path);
    else if (/\.(m?js)$/.test(item.name)) scripts.push(path);
  }
}
for (const dir of ['dist', 'scripts', 'tests']) await visit(dir);
for (const file of scripts) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status) throw new Error(`${file}: ${result.stderr}`);
  const content = await readFile(file, 'utf8');
  for (const match of content.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) await access(resolve(dirname(file), match[1]));
}
const html = await readFile('dist/index.html', 'utf8');
for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) if (!match[1].startsWith('#')) await access(resolve('dist', match[1]));
console.log(`Checked syntax and local dependencies of ${scripts.length} JavaScript files; HTML assets resolve.`);
