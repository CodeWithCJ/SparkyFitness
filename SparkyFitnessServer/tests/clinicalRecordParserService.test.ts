import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseClinicalRecordBuffer,
  extractCcdaXml,
  parseHl7Timestamp,
  normalizeVitalValue,
} from '../services/clinicalRecordParserService.js';

describe('Clinical Record Parser Service', () => {
  it('rejects prototype properties and invalid units in vital normalization', () => {
    expect(normalizeVitalValue('weight', 70, 'constructor')).toBeNull();
    expect(normalizeVitalValue('weight', 70, 'toString')).toBeNull();
    expect(normalizeVitalValue('height', 175, '__proto__')).toBeNull();
    expect(normalizeVitalValue('weight', 70, 'kg')).toBe(70);
  });
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
    const buf = fs.readFileSync(zipPath);
    const pkg = parseClinicalRecordBuffer(
      buf,
      'sample_mychart_lucy_export.zip'
    );

    expect(pkg.sourceDocuments.length).toBeGreaterThan(0);
    expect(pkg.vitals.length).toBeGreaterThan(0);
    expect(pkg.labs.length).toBeGreaterThan(0);
  });

  it('skips negated and non-completed observations', () => {
    const xml = `
      <ClinicalDocument xmlns="urn:hl7-org:v3">
        <component>
          <structuredBody>
            <component>
              <section>
                <templateId root="2.16.840.1.113883.10.20.22.2.4.1"/>
                <title>Vital Signs</title>
                <entry>
                  <observation classCode="OBS" moodCode="EVN" negationInd="true">
                    <templateId root="2.16.840.1.113883.10.20.22.4.27"/>
                    <code code="8867-4" displayName="Heart rate"/>
                    <statusCode code="completed"/>
                    <effectiveTime value="20261023100000"/>
                    <value unit="/min" value="80"/>
                  </observation>
                </entry>
                <entry>
                  <observation classCode="OBS" moodCode="EVN">
                    <templateId root="2.16.840.1.113883.10.20.22.4.27"/>
                    <code code="8867-4" displayName="Heart rate"/>
                    <statusCode code="cancelled"/>
                    <effectiveTime value="20261023100000"/>
                    <value unit="/min" value="75"/>
                  </observation>
                </entry>
                <entry>
                  <observation classCode="OBS" moodCode="EVN">
                    <templateId root="2.16.840.1.113883.10.20.22.4.27"/>
                    <code code="8867-4" displayName="Heart rate"/>
                    <statusCode code="completed"/>
                    <effectiveTime value="20261023100000"/>
                    <value unit="/min" value="72"/>
                  </observation>
                </entry>
              </section>
            </component>
          </structuredBody>
        </component>
      </ClinicalDocument>
    `;

    const res = extractCcdaXml(xml);
    expect(res.vitals).toHaveLength(1);
    expect(res.vitals[0].value).toBe(72);
  });
});
