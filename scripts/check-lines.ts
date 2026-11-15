import { readdirSync, statSync, readFileSync } from 'fs';
import { join } from 'path';

const MAX_LINES = 300;
const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.agents',
  'coverage',
  '.output'
]);

const ALLOWED_EXTS = new Set([
  '.ts',
  '.js',
  '.tsx',
  '.jsx',
  '.vue',
  '.svelte',
  '.json',
  '.md'
]);

function getFiles(dir: string, fileList: string[] = []): string[] {
  const items = readdirSync(dir);
  for (const item of items) {
    if (IGNORED_DIRS.has(item)) continue;
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      getFiles(fullPath, fileList);
    } else {
      const ext = item.slice(item.lastIndexOf('.'));
      if (ALLOWED_EXTS.has(ext) && item !== 'bun.lock') {
        fileList.push(fullPath);
      }
    }
  }
  return fileList;
}

const rootDir = process.cwd();
const allFiles = getFiles(rootDir);
const violations: Array<{ file: string; lines: number }> = [];

for (const file of allFiles) {
  const content = readFileSync(file, 'utf-8');
  const lineCount = content.split('\n').length;
  if (lineCount > MAX_LINES) {
    const relPath = file.replace(`${rootDir}/`, '');
    violations.push({ file: relPath, lines: lineCount });
  }
}

console.log('\n📊 XorinDB Code Length Audit (> 300 lines)');
console.log('────────────────────────────────────────────────────────');

if (violations.length === 0) {
  console.log(`✅ All files are strictly under ${MAX_LINES} lines! Clean & modular codebase.`);
} else {
  console.log(`⚠️  Found ${violations.length} file(s) exceeding ${MAX_LINES} lines:\n`);
  violations.sort((a, b) => b.lines - a.lines);
  for (const v of violations) {
    console.log(`  ❌ ${v.lines} lines: ${v.file}`);
  }
  console.log('────────────────────────────────────────────────────────\n');
}
