import fs from 'node:fs';
import path from 'node:path';

const roots = ['src', 'web'];
const prohibited = [
  { label: 'TODO(', test: (text) => text.includes('TODO(') },
  { label: 'NotImplemented', test: (text) => text.includes('NotImplemented') },
  { label: 'throw new Error TODO', test: (text) => /throw\s+new\s+Error\s*\(\s*["']TODO/i.test(text) },
  { label: 'placeholder only', test: (text) => /placeholder only/i.test(text) },
  { label: 'hardcoded success', test: (text) => /hardcoded success/i.test(text) },
];

const files = [];
for (const root of roots) walk(root);

const failures = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const marker of prohibited) {
    if (marker.test(text)) failures.push(`${file}: ${marker.label}`);
  }
}

if (failures.length) {
  console.error('P8B unresolved production placeholder/fake-handler markers:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`P8B placeholder/fake-handler scan passed across ${files.length} production source files`);

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && /\.(?:ts|tsx|js|mjs|html|css|jsonc?)$/i.test(entry.name)) files.push(full);
  }
}
