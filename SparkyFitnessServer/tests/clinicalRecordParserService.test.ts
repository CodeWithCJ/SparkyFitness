import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseClinicalRecordBuffer,
  extractCcdaXml,
  parseHl7Timestamp,
} from '../services/clinicalRecordParserService.js';

describe('Clinical Record Parser Service', () => {
  it('parses HL7 timestamps correctly with and without timezone offsets', () => {
    const t1 = parseHl7Timestamp('20230514103000-0500');
    expect(t1).not.toBeNull();
    expect(t1?.isoDate).toBe('2023-05-14');
    expect(t1?.recordedAt).toBe('2023-05-14T10:30:00-05:00');

    const t2 = parseHl7Timestamp('20240101');
    expect(t2).not.toBeNull();
    expect(t2?.isoDate).toBe('2024-01-01');
    expect(t2?.recordedAt).toBe('2024-01-01T00:00:00Z');
  });

  it('extracts vitals and labs from synthetic sample XML', () => {
    const xmlPath = path.resolve(
      __dirname,
      'fixtures/sample_mychart_vitals_and_labs.xml'
    );
    if (!fs.existsSync(xmlPath)) {
      console.warn(
        'Fixture sample_mychart_vitals_and_labs.xml not found, skipping'
      );
      return;
    }
    const xmlContent = fs.readFileSync(xmlPath, 'utf-8');
    const result = extractCcdaXml(xmlContent);

    expect(result.vitals.length).toBeGreaterThan(0);
    expect(result.labs.length).toBeGreaterThan(0);

    // Verify BP vitals
    const systolic = result.vitals.find((v) => v.kind === 'systolic');
    expect(systolic).toBeDefined();
    expect(systolic?.value).toBe(122);
    expect(systolic?.unit).toBe('mmHg');

    const diastolic = result.vitals.find((v) => v.kind === 'diastolic');
    expect(diastolic).toBeDefined();
    expect(diastolic?.value).toBe(78);

    // Verify Weight normalization
    const weight = result.vitals.find((v) => v.kind === 'weight');
    expect(weight).toBeDefined();
    expect(weight?.unit).toBe('kg');
    // 165.5 lbs in kg is ~75.07 kg
    expect(weight?.value).toBeCloseTo(75.07, 1);

    // Verify Labs
    const glucose = result.labs.find((l) => l.markerName === 'Glucose');
    expect(glucose).toBeDefined();
    expect(glucose?.valueNumeric).toBe(92);
    expect(glucose?.refRangeLow).toBe(70);
    expect(glucose?.refRangeHigh).toBe(99);
  });

  it('extracts records from Lucy .zip archive package', () => {
    const zipPath = path.resolve(
      __dirname,
      'fixtures/sample_mychart_lucy_export.zip'
    );
    if (!fs.existsSync(zipPath)) {
      console.warn(
        'Fixture sample_mychart_lucy_export.zip not found, skipping'
      );
      return;
    }
    const buf = fs.readFileSync(zipPath);
    const pkg = parseClinicalRecordBuffer(
      buf,
      'sample_mychart_lucy_export.zip'
    );

    expect(pkg.sourceDocuments.length).toBeGreaterThan(0);
    expect(pkg.vitals.length).toBeGreaterThan(0);
    expect(pkg.labs.length).toBeGreaterThan(0);
  });
});
