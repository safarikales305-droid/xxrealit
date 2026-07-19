import test from 'node:test';
import assert from 'node:assert/strict';
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

test('isStateVfrFilename detects ST_UKSG', () => {
  assert.ok(isStateVfrFilename('20240501_ST_UKSG.zip'));
  assert.ok(!isStateVfrFilename('20240501_ST_ZZSG.zip'));
});

test('isDeltaVfrFilename detects ZZSG', () => {
  assert.ok(isDeltaVfrFilename('20240502_ST_ZZSG.zip'));
  assert.ok(!isDeltaVfrFilename('20240501_ST_UKSG.zip'));
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

test('CsuDataStatService.parsePopulationCsv pairs by official code', () => {
  const svc = new CsuDataStatService({} as never);
  const csv = 'kod_obec;nazev;obyvatel\n554782;Praha;1397880\n500011;Praha 1;12345\n';
  const rows = svc.parsePopulationCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.officialCode, '554782');
  assert.equal(rows[0]!.population, 1397880);
  assert.equal(rows[1]!.officialCode, '500011');
});

test('streamParseVfrXmlFile parses Obec elements without loading full file to RAM', async () => {
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
