import { build } from 'vite';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Builds the page into a temporary folder and compares it with the committed
// ../staffing byte for byte. Exits non-zero on any missing, extra or changed file.
const root = fileURLToPath(new URL('..', import.meta.url));
const deployed = fileURLToPath(new URL('../../staffing', import.meta.url));

async function files(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) out.push(relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'));
  }
  return out.sort();
}

const outDir = await mkdtemp(join(tmpdir(), 'staffing-verify-'));
try {
  await build({ root, logLevel: 'warn', build: { outDir, emptyOutDir: true } });
  const built = await files(outDir);
  const committed = await files(deployed);
  const problems = [
    ...built.filter((file) => !committed.includes(file)).map((file) => `missing from staffing/: ${file}`),
    ...committed.filter((file) => !built.includes(file)).map((file) => `not produced by the build: ${file}`),
  ];
  for (const file of built.filter((name) => committed.includes(name))) {
    const [a, b] = await Promise.all([readFile(join(outDir, file)), readFile(join(deployed, file))]);
    if (!a.equals(b)) problems.push(`differs: ${file}`);
  }
  if (problems.length) {
    console.error(`staffing/ does not match a fresh build (${problems.length} problem(s)):`);
    for (const problem of problems) console.error(`  ${problem}`);
    console.error('Run `npm run build:site` and commit staffing/ with the source change.');
    process.exitCode = 1;
  } else {
    console.log(`staffing/ matches a fresh build: ${built.length} files, byte-identical.`);
  }
} finally {
  await rm(outDir, { recursive: true, force: true });
}
