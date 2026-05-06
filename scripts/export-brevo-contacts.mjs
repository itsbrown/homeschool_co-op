#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const API_KEY = process.env.BREVO_API_KEY;
if (!API_KEY) {
  console.error('Missing BREVO_API_KEY environment variable');
  process.exit(1);
}

const FIXED_COLS = [
  'id',
  'email',
  'emailBlacklisted',
  'smsBlacklisted',
  'createdAt',
  'modifiedAt',
  'listIds',
];

const OUTPUT_PATH = 'exports/brevo-contacts.csv';
const LIMIT = 1000;

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  let s;
  if (Array.isArray(val)) {
    s = val.join('|');
  } else if (typeof val === 'object') {
    s = JSON.stringify(val);
  } else {
    s = String(val);
  }
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

async function fetchPage(offset) {
  const url = `https://api.brevo.com/v3/contacts?limit=${LIMIT}&offset=${offset}`;
  const res = await fetch(url, {
    headers: {
      'api-key': API_KEY,
      'accept': 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo API error ${res.status}: ${body}`);
  }
  return res.json();
}

async function main() {
  const all = [];
  let offset = 0;
  let pages = 0;
  while (true) {
    const data = await fetchPage(offset);
    const contacts = data.contacts || [];
    pages += 1;
    all.push(...contacts);
    console.log(`Page ${pages}: fetched ${contacts.length} (offset ${offset}, total so far ${all.length})`);
    if (contacts.length < LIMIT) break;
    offset += LIMIT;
  }

  const attrKeys = new Set();
  for (const c of all) {
    if (c.attributes && typeof c.attributes === 'object') {
      for (const k of Object.keys(c.attributes)) attrKeys.add(k);
    }
  }
  const attrCols = Array.from(attrKeys).sort();
  const headers = [...FIXED_COLS, ...attrCols];

  const lines = [headers.map(csvEscape).join(',')];
  for (const c of all) {
    const row = [
      c.id,
      c.email,
      c.emailBlacklisted,
      c.smsBlacklisted,
      c.createdAt,
      c.modifiedAt,
      c.listIds,
      ...attrCols.map((k) => (c.attributes ? c.attributes[k] : undefined)),
    ];
    lines.push(row.map(csvEscape).join(','));
  }

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, lines.join('\n') + '\n', 'utf8');

  console.log(`\nDone.`);
  console.log(`Total contacts: ${all.length}`);
  console.log(`Pages fetched: ${pages}`);
  console.log(`Attribute columns: ${attrCols.length}`);
  console.log(`Output: ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
