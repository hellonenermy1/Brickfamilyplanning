import fs from 'node:fs/promises';

const sourceUrl = new URL('./install-private-map.mjs', import.meta.url);
const generatedUrl = new URL('./.install-private-map-development.generated.mjs', import.meta.url);
let source = await fs.readFile(sourceUrl, 'utf8');

const replacements = [
  ["const MAP_BUCKET = 'brick-family-v1-maps';", "const MAP_BUCKET = 'brick-family-v1-dev-maps';"],
  ["if (!(await fs.stat('wrangler.jsonc').catch(() => null))) throw new Error('wrangler.jsonc is missing. Run npm run setup first.');", "if (!(await fs.stat('wrangler.development.jsonc').catch(() => null))) throw new Error('wrangler.development.jsonc is missing. Run the development setup first.');"],
  ["'--config', 'wrangler.jsonc'", "'--config', 'wrangler.development.jsonc'"],
  ["example: r2:brick-family-v1-maps", "example: r2:brick-family-v1-dev-maps"],
  ["const statePath = 'setup-state.json';", "const statePath = 'setup-development-state.json';"]
];

for (const [needle, replacement] of replacements) {
  if (!source.includes(needle)) throw new Error(`Development map patch target missing: ${needle.slice(0, 80)}`);
  source = source.replaceAll(needle, replacement);
}

await fs.writeFile(generatedUrl, source, 'utf8');
try {
  await import(`${generatedUrl.href}?v=${Date.now()}`);
} finally {
  await fs.rm(generatedUrl, { force: true });
}
