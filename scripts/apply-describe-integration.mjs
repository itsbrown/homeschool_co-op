#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';

const testsRoot = join(import.meta.dirname, '..', 'server', 'tests');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

function helpersImportPath(file) {
  const rel = relative(testsRoot, dirname(file));
  const up = rel ? '../'.repeat(rel.split('/').length) : './';
  return `${up}helpers/integrationDb`;
}

for (const file of walk(testsRoot)) {
  let src = readFileSync(file, 'utf8');
  if (!src.includes('testDb') && !src.includes("from '../../helpers/testDatabase'")) continue;
  if (src.includes('describeIntegration')) continue;
  if (!src.includes("@jest/globals")) continue;

  const imp = helpersImportPath(file);
  src = src.replace(
    /(import \{[^}]+\} from '@jest\/globals';)/,
    `$1\nimport { describeIntegration } from '${imp}';`,
  );

  const match = src.match(/^describe\(/m);
  if (!match || match.index === undefined) continue;
  src =
    src.slice(0, match.index) +
    'describeIntegration(' +
    src.slice(match.index + 'describe('.length);

  writeFileSync(file, src, 'utf8');
  console.log('patched', relative(testsRoot, file));
}
