import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../src/', import.meta.url);

test('source modules stay in feature folders and below the reviewed size ceiling', async () => {
  const entries = await readdir(root, { withFileTypes: true });
  assert.deepEqual(
    entries
      .filter((entry) => entry.isFile() && /\.(?:m?js|ts)$/.test(entry.name))
      .map((entry) => entry.name),
    [],
    'Put implementation modules in their owning feature folder.',
  );
  const files = await readdir(root, { recursive: true });
  const oversized = [];
  for (const file of files.filter((file) => /\.m?js$/.test(file))) {
    const source = await readFile(
      new URL(file.replaceAll('\\', '/'), root),
      'utf8',
    );
    const lines = source.trimEnd().split(/\r?\n/).length;
    if (lines > 1000) oversized.push(`${file}: ${lines} lines`);
  }
  assert.deepEqual(
    oversized,
    [],
    `Split ownership before adding more code to ${fileURLToPath(root)}.`,
  );
});
