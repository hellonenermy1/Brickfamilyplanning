import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const source = await fs.readFile('src/parent-v4.ts', 'utf8');
const match = source.match(/<script\s+type=["']module["']>([\s\S]*?)<\/script>/);
if (!match) throw new Error('Could not find parent dashboard module script');
const file = path.join(os.tmpdir(), `brick-parent-${process.pid}.mjs`);
await fs.writeFile(file, match[1], 'utf8');
const exitCode = await new Promise((resolve, reject) => {
  const p = spawn(process.execPath, ['--check', file], { stdio: 'inherit' });
  p.on('error', reject);
  p.on('exit', code => resolve(code ?? 1));
});
await fs.rm(file, { force: true });
if (exitCode !== 0) throw new Error(`Parent dashboard module syntax check failed (${exitCode})`);
console.log('Parent dashboard embedded module syntax OK');
