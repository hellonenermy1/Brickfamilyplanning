import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const roots = ['app/src', 'src', 'web', 'schema', 'scripts', '.github/workflows'];
const rootFiles = [
  'app/build.gradle.kts', 'build.gradle.kts', 'settings.gradle.kts', 'gradle.properties',
  'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.web.json',
  'wrangler.template.jsonc', '.gitignore'
];
const allowed = new Set(['.kt','.xml','.ts','.mjs','.js','.sql','.yml','.yaml','.json','.jsonc','.kts','.properties','.md','.css']);
const files = [];

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))) {
    const p = path.join(dir, entry.name).replaceAll('\\','/');
    if (entry.isDirectory()) await walk(p);
    else if (entry.isFile() && allowed.has(path.extname(entry.name))) files.push(p);
  }
}
for (const root of roots) await walk(root);
for (const file of rootFiles) if (await fs.stat(file).then(s=>s.isFile()).catch(()=>false)) files.push(file);

const unique = [...new Set(files)].sort();
if (unique.length < 40) throw new Error(`source inventory unexpectedly small: ${unique.length} files`);
const productionPrefixes = ['app/src/main/','src/','web/'];
const unresolved = [];
const privateKeys = [];
const inventory = [];
for (const file of unique) {
  const data = await fs.readFile(file);
  if (!data.length) throw new Error(`empty source/config file: ${file}`);
  const text = data.toString('utf8');
  const lines = text.split(/\r?\n/).length;
  const sha256 = crypto.createHash('sha256').update(data).digest('hex');
  inventory.push({ path:file, bytes:data.length, lines, sha256 });
  if (productionPrefixes.some(prefix => file.startsWith(prefix))) {
    text.split(/\r?\n/).forEach((line, index) => {
      if (/\b(TODO|FIXME|HACK|XXX)\b/i.test(line)) unresolved.push(`${file}:${index+1}: ${line.trim().slice(0,160)}`);
    });
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) privateKeys.push(file);
  }
}
if (unresolved.length) throw new Error(`unresolved production markers found:\n${unresolved.join('\n')}`);
if (privateKeys.length) throw new Error(`private key material found in source: ${privateKeys.join(', ')}`);

const gitSha = process.env.GITHUB_SHA || execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const totals = inventory.reduce((a,f)=>({ files:a.files+1, bytes:a.bytes+f.bytes, lines:a.lines+f.lines }), {files:0,bytes:0,lines:0});
const manifest = {
  format:'brick-phase6-source-inventory-v1',
  generatedAt:new Date().toISOString(),
  gitSha,
  totals,
  files:inventory
};
await fs.writeFile('phase6-source-inventory.json', JSON.stringify(manifest,null,2));
console.log(`Phase 6 source inventory OK: ${totals.files} files, ${totals.lines} lines, ${totals.bytes} bytes`);
