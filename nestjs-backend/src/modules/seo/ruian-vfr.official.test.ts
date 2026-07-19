import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRuianVfrError, validateVfrImportResult } from './ruian-vfr.errors';
import { resolveSaxModule } from './ruian-vfr.sax';
import { RuianVfrImportSession } from './ruian-vfr.import-session';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  CSU_DATASTAT_DEFAULTS,
  RUIAN_VFR_DAILY_ATOM_URL,
  RUIAN_VFR_MONTHLY_BASE_URL,
  RUIAN_VFR_STATE_FILE_TOKEN,
} from './ruian-vfr.official.constants';
import { isDeltaVfrFilename, isStateVfrFilename } from './ruian-vfr.discovery';
import { streamParseVfrXmlFile, vfrRecordToImportRow } from './ruian-vfr.stream-parser';
import { CsuDataStatService } from './csu-datastat.service';

test('official RUIAN endpoints are preset', () => {
  assert.equal(RUIAN_VFR_MONTHLY_BASE_URL, 'https://services.cuzk.gov.cz/vfr');
  assert.equal(RUIAN_VFR_DAILY_ATOM_URL, 'https://atom.cuzk.gov.cz/RUIAN-S-K-Z/RUIAN-S-K-Z.xml');
});

test('official CSU DataStat endpoints are preset', () => {
  assert.equal(CSU_DATASTAT_DEFAULTS.baseUrl, 'https://data.csu.gov.cz/api/dotaz/v1');
  assert.equal(CSU_DATASTAT_DEFAULTS.catalogUrl, 'https://data.csu.gov.cz/api/katalog/v1');
  assert.equal(CSU_DATASTAT_DEFAULTS.datasetCode, 'OBY01');
});

test('isStateVfrFilename detects ST_UKSG and xml.zip variant', () => {
  assert.ok(isStateVfrFilename('20240501_ST_UKSG.zip'));
  assert.ok(isStateVfrFilename('20260531_ST_UKSG.xml.zip'));
  assert.ok(!isStateVfrFilename('20240501_ST_ZZSG.zip'));
});

test('isDeltaVfrFilename detects ZZSG', () => {
  assert.ok(isDeltaVfrFilename('20240502_ST_ZZSG.zip'));
  assert.ok(!isDeltaVfrFilename('20240501_ST_UKSG.zip'));
});

test('validateVfrImportResult rejects zero parsed/inserted/updated/skipped', () => {
  const res = validateVfrImportResult({ parsed: 0, inserted: 0, updated: 0, skipped: 0 });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.status, 'EMPTY_IMPORT');
    assert.match(res.error, /žádné zpracovatelné záznamy/i);
  }
});

test('validateVfrImportResult accepts skipped records', () => {
  const res = validateVfrImportResult({ parsed: 0, inserted: 0, updated: 0, skipped: 3 });
  assert.equal(res.ok, true);
});

test('vfrRecordToImportRow maps Obec with parent codes', () => {
  const row = vfrRecordToImportRow({
    elementType: 'Obec',
    officialCode: '554782',
    name: 'Praha',
    parentOfficialCode: '3100',
    districtOfficialCode: '3100',
    regionOfficialCode: '19',
    latitude: 50.08,
    longitude: 14.42,
  });
  assert.ok(row);
  assert.equal(row!.kind, 'OBEC');
  assert.equal(row!.officialCode, '554782');
  assert.equal(row!.name, 'Praha');
  assert.equal(row!.latitude, 50.08);
});

test('vfrRecordToImportRow imports Obec without GPS', () => {
  const row = vfrRecordToImportRow({
    elementType: 'Obec',
    officialCode: '500101',
    name: 'Brašec',
  });
  assert.ok(row);
  assert.equal(row!.latitude, null);
});

test('CsuDataStatService.parsePopulationCsv pairs by official code', () => {
  const svc = new CsuDataStatService({} as never);
  const csv = 'kod_obec;nazev;obyvatel\n554782;Praha;1397880\n500011;Praha 1;12345\n';
  const rows = svc.parsePopulationCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.officialCode, '554782');
  assert.equal(rows[0]!.population, 1397880);
  assert.equal(rows[1]!.officialCode, '500011');
});

test('formatRuianVfrError maps ENOENT to readable message', () => {
  const info = formatRuianVfrError(Object.assign(new Error('no such file'), { code: 'ENOENT' }));
  assert.match(info.userMessage, /nenalezen|disku/i);
});

test('resolveSaxModule exposes createStream', () => {
  const sax = resolveSaxModule();
  assert.equal(typeof sax.createStream, 'function');
});

test('RuianVfrImportSession tracks progress phases', () => {
  const session = new RuianVfrImportSession();
  session.log('discover', 'Načítám stavový soubor...');
  session.log('download', 'Stahuji...');
  assert.equal(session.progressPct, 15);
  session.log('done', 'Hotovo.');
  assert.equal(session.progressPct, 100);
  assert.ok(session.entries.length >= 3);
});

test('streamParseVfrXmlFile parses Obec elements with attributes', async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<VymennyFormat>
  <Obec Kod="554782" Nazev="Praha" KodOkresu="3100" KodVusc="19"/>
  <Obec Kod="500011" Nazev="Praha 1" KodOkresu="3100" KodVusc="19"/>
</VymennyFormat>`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-test-'));
  const xmlPath = path.join(tmp, 'sample.xml');
  fs.writeFileSync(xmlPath, xml, 'utf8');
  const collected: string[] = [];
  const result = await streamParseVfrXmlFile(xmlPath, async (rows) => {
    for (const r of rows) collected.push(r.officialCode);
  });
  assert.equal(result.total, 2);
  assert.equal(result.stats.obce, 2);
  assert.deepEqual(collected, ['554782', '500011']);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('streamParseVfrXmlFile parses vf:Obec with child elements and namespaces', async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<VymennyFormat xmlns:vf="http://www.cuzk.cz/schemas/vfr/vf" xmlns:obi="http://www.cuzk.cz/schemas/vfr/obi" xmlns:oki="http://www.cuzk.cz/schemas/vfr/oki">
  <vf:Obec>
    <obi:Kod>500101</obi:Kod>
    <obi:Nazev>Brašec</obi:Nazev>
    <obi:Okres><oki:Kod>3403</oki:Kod></obi:Okres>
  </vf:Obec>
  <vf:Obec>
    <obi:Kod>554782</obi:Kod>
    <obi:Nazev>Praha</obi:Nazev>
    <obi:Okres><oki:Kod>3100</oki:Kod></obi:Okres>
  </vf:Obec>
</VymennyFormat>`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-ns-'));
  const xmlPath = path.join(tmp, 'ns.xml');
  fs.writeFileSync(xmlPath, xml, 'utf8');
  const rows: Array<{ code: string; district?: string | null }> = [];
  const result = await streamParseVfrXmlFile(xmlPath, async (batch) => {
    for (const r of batch) {
      rows.push({ code: r.officialCode, district: r.districtOfficialCode });
    }
  });
  assert.equal(result.total, 2);
  assert.equal(result.diagnostics.parsedMunicipalities, 2);
  assert.equal(rows[0]!.code, '500101');
  assert.equal(rows[0]!.district, '3403');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('streamParseVfrXmlFile supports resume via skipUntil', async () => {
  const xml = `<?xml version="1.0"?><root>
  <Obec Kod="1" Nazev="A"/>
  <Obec Kod="2" Nazev="B"/>
  <Obec Kod="3" Nazev="C"/>
</root>`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-skip-'));
  const xmlPath = path.join(tmp, 'skip.xml');
  fs.writeFileSync(xmlPath, xml, 'utf8');
  const codes: string[] = [];
  await streamParseVfrXmlFile(
    xmlPath,
    async (rows) => {
      codes.push(...rows.map((r) => r.officialCode));
    },
    { skipUntil: 2 },
  );
  assert.deepEqual(codes, ['3']);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('streamParseVfrXmlFile test import limits municipalities', async () => {
  const parts = Array.from({ length: 5 }, (_, i) => `<Obec Kod="${i + 1}" Nazev="O${i + 1}"/>`).join('');
  const xml = `<?xml version="1.0"?><root>${parts}</root>`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-limit-'));
  const xmlPath = path.join(tmp, 'limit.xml');
  fs.writeFileSync(xmlPath, xml, 'utf8');
  const result = await streamParseVfrXmlFile(
    xmlPath,
    async () => undefined,
    { maxRecords: 3, filterElementType: 'Obec' },
  );
  assert.equal(result.total, 3);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('validateDownloadedFile rejects tiny files', async () => {
  const { validateDownloadedFile } = await import('./ruian-vfr.archive');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-tiny-'));
  const p = path.join(tmp, 'tiny.zip');
  fs.writeFileSync(p, Buffer.from('tiny'));
  assert.throws(() => validateDownloadedFile(p), /malý|prázdný/i);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('formatRuianVfrError handles axios HTTP 400', () => {
  const info = formatRuianVfrError({
    isAxiosError: true,
    message: 'Request failed with status code 400',
    response: { status: 400, data: { detail: 'Neplatný kód výběru' } },
  });
  assert.match(info.userMessage, /HTTP 400/);
});
