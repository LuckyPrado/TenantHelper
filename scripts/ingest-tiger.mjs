/**
 * Loads ZORI and the rent-stabilized list into Tiger Data.
 *
 * Idempotent: re-running upserts rather than duplicating. Run with
 *   npm run ingest
 */
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

process.loadEnvFile('.env.local');

const ZORI_URL =
  'https://files.zillowstatic.com/research/public_csvs/zori/Zip_zori_uc_sfrcondomfr_sm_month.csv';
const STABILIZED_URL =
  'https://media.githubusercontent.com/media/firstmovernyc/nyc-rent-stabilized-listings/main/5_coordinates_complete/listing_with_coordinates_complete.csv';

const NYC_ZIP = /^1[01]\d{3}$/;
const BOROUGH_CODES = { manhattan: '1', bronx: '2', brooklyn: '3', queens: '4', 'staten island': '5' };

/** Quote-aware: ZORI's Metro column contains a comma inside quotes. */
function splitCsvLine(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i += 1; } else q = !q;
    } else if (ch === ',' && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function connectionString() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is not set');
  return raw.includes('uselibpqcompat') ? raw : raw + (raw.includes('?') ? '&' : '?') + 'uselibpqcompat=true';
}

async function fetchText(url, label) {
  const t0 = Date.now();
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  const text = await res.text();
  if (text.startsWith('version https://git-lfs')) throw new Error(`${label}: got a Git LFS pointer, not data`);
  console.log(`  fetched ${label}: ${(text.length / 1e6).toFixed(1)}MB in ${Date.now() - t0}ms`);
  return text;
}

/** Inserts in chunks; a single statement with 30k rows exceeds the parameter limit. */
async function insertChunked(client, label, rows, columns, toParams, conflict) {
  const CHUNK = 1000;
  let done = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const values = [];
    const params = [];
    slice.forEach((row, n) => {
      const p = toParams(row);
      values.push(`(${p.map((_, k) => `$${n * p.length + k + 1}`).join(',')})`);
      params.push(...p);
    });
    await client.query(
      `INSERT INTO ${label} (${columns}) VALUES ${values.join(',')} ${conflict}`,
      params,
    );
    done += slice.length;
    process.stdout.write(`\r  inserted ${done}/${rows.length}`);
  }
  process.stdout.write('\n');
}

const client = new Client({ connectionString: connectionString(), connectionTimeoutMillis: 20_000 });
await client.connect();
console.log('connected to Tiger Data');

console.log('\napplying schema...');
await client.query(fs.readFileSync(path.join('lib', 'tiger', 'schema.sql'), 'utf8'));
console.log('  schema applied');

// --- ZORI ------------------------------------------------------------------
console.log('\ningesting ZORI...');
const zoriCsv = await fetchText(ZORI_URL, 'ZORI');
{
  const lines = zoriCsv.split('\n');
  const header = splitCsvLine(lines[0]);
  const months = header.slice(9);
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    if (!lines[i]?.trim()) continue;
    const f = splitCsvLine(lines[i]);
    const zip = f[2];
    if (!NYC_ZIP.test(zip)) continue;
    for (let m = 0; m < months.length; m += 1) {
      const raw = f[9 + m];
      if (raw === undefined || raw === '') continue;
      const rent = Number(raw);
      if (!Number.isFinite(rent) || rent <= 0) continue;
      rows.push([zip, months[m], rent]);
    }
  }
  console.log(`  ${rows.length} NYC rent points`);
  await insertChunked(client, 'zori', rows, 'zip, month, rent', (r) => r,
    'ON CONFLICT (zip, month) DO UPDATE SET rent = EXCLUDED.rent');
}

// --- stabilized ------------------------------------------------------------
console.log('\ningesting stabilized list...');
const stabCsv = await fetchText(STABILIZED_URL, 'stabilized list');
{
  const lines = stabCsv.split('\n');
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toUpperCase());
  const iB = header.indexOf('BOROUGH'), iBl = header.indexOf('BLOCK'),
        iL = header.indexOf('LOT'), iS = header.indexOf('STATUS1');
  const seen = new Map();
  for (let i = 1; i < lines.length; i += 1) {
    if (!lines[i]?.trim()) continue;
    const f = splitCsvLine(lines[i]);
    const boro = BOROUGH_CODES[(f[iB] ?? '').trim().toLowerCase()];
    const block = Number(f[iBl]), lot = Number(f[iL]);
    if (!boro || !Number.isInteger(block) || !Number.isInteger(lot)) continue;
    if (block <= 0 || lot <= 0 || block > 99999 || lot > 9999) continue;
    const bbl = `${boro}${String(block).padStart(5, '0')}${String(lot).padStart(4, '0')}`;
    if (!seen.has(bbl)) seen.set(bbl, (f[iS] ?? '').trim() || null);
  }
  const rows = [...seen].map(([bbl, cls]) => [bbl, cls]);
  console.log(`  ${rows.length} stabilized buildings`);
  await insertChunked(client, 'stabilized', rows, 'bbl, building_class', (r) => r,
    'ON CONFLICT (bbl) DO UPDATE SET building_class = EXCLUDED.building_class');
}

console.log('\nrefreshing continuous aggregate...');
await client.query("CALL refresh_continuous_aggregate('zori_yearly', NULL, NULL)");

const counts = await client.query(
  'SELECT (SELECT count(*) FROM zori) zori, (SELECT count(*) FROM stabilized) stab, (SELECT count(*) FROM zori_yearly) yearly',
);
console.log('\ndone:', counts.rows[0]);
await client.end();
