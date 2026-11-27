import { parseZipArchive } from '../utils/zipUtils.js';
import {
  parseXml,
  findDescendantsByLocalName,
  findFirstChildByLocalName,
  getElementText,
} from '../utils/xmlParser.js';

export interface ParsedVital {
  kind:
    | 'systolic'
    | 'diastolic'
    | 'heart_rate'
    | 'weight'
    | 'height'
    | 'spo2'
    | 'temperature';
  sparkyType: string;
  value: number;
  unit: string;
  rawDate: string;
  isoDate: string; // YYYY-MM-DD
  recordedAt: string; // ISO 8601 UTC
}

export interface ParsedLab {
  markerName: string;
  loinc?: string;
  entryDate: string; // YYYY-MM-DD
  recordedAt: string; // ISO 8601
  valueNumeric?: number;
  valueText?: string;
  unit?: string;
  refRangeLow?: number;
  refRangeHigh?: number;
  labName?: string;
  notes?: string;
}

export interface ClinicalRecordPackage {
  vitals: ParsedVital[];
  labs: ParsedLab[];
  sourceDocuments: string[];
}

export const LOINC_TO_VITAL_KIND: Record<string, ParsedVital['kind']> = {
  '8480-6': 'systolic',
  '8462-4': 'diastolic',
  '8867-4': 'heart_rate',
  '29463-7': 'weight',
  '3141-9': 'weight',
  '8302-2': 'height',
  '59408-5': 'spo2',
  '2708-6': 'spo2',
  '8310-5': 'temperature',
};

export const LOINC_TO_LAB_NAME: Record<string, string> = {
  '2951-2': 'Sodium',
  '2823-3': 'Potassium',
  '2075-0': 'Chloride',
  '2028-9': 'CO2',
  '2160-0': 'Creatinine',
  '3094-0': 'Blood Urea Nitrogen',
  '17861-6': 'Calcium, Total',
  '2345-7': 'Glucose',
  '6690-2': 'WBC Count',
  '789-8': 'RBC Count',
  '718-7': 'Hemoglobin',
  '4544-3': 'Hematocrit',
  '787-2': 'MCV',
  '785-6': 'MCH',
  '786-4': 'MCHC',
  '788-0': 'RDW',
  '777-3': 'Platelets',
  '32623-1': 'MPV',
  '770-8': '% Neutrophils',
  '736-9': '% Lymphocytes',
  '5905-5': '% Monocytes',
  '711-2': '% Eosinophils',
  '704-7': '% Basophils',
  '751-8': 'Abs Neutrophils',
  '731-0': 'Abs Lymphocytes',
  '742-7': 'Abs Monocytes',
  '713-8': 'Abs Eosinophils',
  '706-2': 'Abs Basophils',
  '2093-3': 'Cholesterol',
  '2571-8': 'Triglycerides',
  '13457-7': 'Cholesterol, LDL (Calculated)',
  '2085-9': 'Cholesterol, HDL',
  '13458-5': 'Cholesterol, vLDL',
  '1751-7': 'Albumin',
  '2885-2': 'Total Protein',
  '10834-0': 'Globulin',
  '1759-0': 'Albumin/Globulin Ratio',
  '1920-8': 'Aspartate Aminotransferase (AST)',
  '1742-6': 'Alanine Aminotransferase (ALT)',
  '6768-6': 'Alkaline Phosphatase',
  '1975-2': 'Bilirubin, Total',
  '1968-7': 'Bilirubin, Direct',
  '77348-1': 'Tacrolimus',
  '11277-1': 'Protein, Urine',
  '2161-8': 'Creatinine, Urine',
  '33037-3': 'eCrCl (Rx) - Adults',
};

const IGNORED_LAB_NAMES = new Set([
  'units',
  'procedure only',
  'specimen receive',
  'annotation comment',
  'unsuccessful attempt',
  'lab interpretation',
  'fasting status',
  'order panel',
  'panel',
  'collection',
]);

const VITAL_SPECS = {
  systolic: {
    sparkyType: 'blood_pressure_systolic',
    unit: 'mmHg',
    min: 40,
    max: 300,
    decimals: 0,
  },
  diastolic: {
    sparkyType: 'blood_pressure_diastolic',
    unit: 'mmHg',
    min: 20,
    max: 200,
    decimals: 0,
  },
  heart_rate: {
    sparkyType: 'heart_rate',
    unit: 'bpm',
    min: 20,
    max: 300,
    decimals: 0,
  },
  weight: { sparkyType: 'weight', unit: 'kg', min: 0.5, max: 500, decimals: 2 },
  height: { sparkyType: 'height', unit: 'cm', min: 20, max: 275, decimals: 1 },
  spo2: {
    sparkyType: 'blood_oxygen_saturation',
    unit: '%',
    min: 50,
    max: 100,
    decimals: 0,
  },
  temperature: {
    sparkyType: 'body_temperature',
    unit: 'celsius',
    min: 25,
    max: 45,
    decimals: 1,
  },
};

const WEIGHT_FACTORS: Record<string, number> = {
  kg: 1.0,
  kgs: 1.0,
  kilogram: 1.0,
  kilograms: 1.0,
  g: 0.001,
  gram: 0.001,
  grams: 0.001,
  '[lb_av]': 0.45359237,
  '[lb]': 0.45359237,
  lb: 0.45359237,
  lbs: 0.45359237,
  pound: 0.45359237,
  pounds: 0.45359237,
  '[oz_av]': 0.028349523125,
  oz: 0.028349523125,
  ounce: 0.028349523125,
  ounces: 0.028349523125,
};

const HEIGHT_FACTORS: Record<string, number> = {
  cm: 1.0,
  centimeter: 1.0,
  centimeters: 1.0,
  m: 100.0,
  meter: 100.0,
  meters: 100.0,
  mm: 0.1,
  '[in_i]': 2.54,
  '[in_us]': 2.54,
  in: 2.54,
  inch: 2.54,
  inches: 2.54,
  '[ft_i]': 30.48,
  ft: 30.48,
  feet: 30.48,
};

function normalizeVitalValue(
  kind: ParsedVital['kind'],
  value: number,
  unit?: string
): number | null {
  const normUnit = (unit || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace('°', 'deg');
  let canon: number = value;

  switch (kind) {
    case 'weight': {
      if (!normUnit || !(normUnit in WEIGHT_FACTORS)) {
        return null;
      }
      const factor = WEIGHT_FACTORS[normUnit];
      canon = value * factor;
      break;
    }
    case 'height': {
      if (!normUnit || !(normUnit in HEIGHT_FACTORS)) {
        return null;
      }
      const factor = HEIGHT_FACTORS[normUnit];
      canon = value * factor;
      break;
    }
    case 'temperature': {
      if (
        ['[degf]', 'degf', 'f', 'fahrenheit'].includes(normUnit) ||
        (!normUnit && value > 55)
      ) {
        canon = ((value - 32) * 5) / 9;
      }
      break;
    }
    case 'systolic':
    case 'diastolic':
    case 'heart_rate':
    case 'spo2':
    default:
      canon = value;
      break;
  }

  const spec = VITAL_SPECS[kind];
  if (canon < spec.min || canon > spec.max) {
    return null;
  }
  return Number(canon.toFixed(spec.decimals));
}

export function parseHl7Timestamp(
  raw?: string
): { isoDate: string; recordedAt: string } | null {
  if (!raw || raw.length < 8) return null;
  const cleaned = raw.trim();
  const year = cleaned.slice(0, 4);
  const month = cleaned.slice(4, 6);
  const day = cleaned.slice(6, 8);
  const isoDate = `${year}-${month}-${day}`;

  let hours = '00';
  let minutes = '00';
  let seconds = '00';

  if (cleaned.length >= 12) {
    hours = cleaned.slice(8, 10);
    minutes = cleaned.slice(10, 12);
  }
  if (cleaned.length >= 14) {
    seconds = cleaned.slice(12, 14);
  }

  // Check offset
  const offsetMatch = cleaned.match(/([+-]\d{2}):?(\d{2})$/);
  let recordedAt: string;
  if (offsetMatch) {
    const sign = offsetMatch[1].startsWith('+') ? '+' : '-';
    const offHours = offsetMatch[1].slice(1);
    const offMins = offsetMatch[2];
    recordedAt = `${isoDate}T${hours}:${minutes}:${seconds}${sign}${offHours}:${offMins}`;
  } else {
    recordedAt = `${isoDate}T${hours}:${minutes}:${seconds}Z`;
  }

  return { isoDate, recordedAt };
}

/**
 * Extracts vitals and labs from a single C-CDA XML document.
 */
export function extractCcdaXml(xmlContent: string): {
  vitals: ParsedVital[];
  labs: ParsedLab[];
} {
  const root = parseXml(xmlContent);
  const vitals: ParsedVital[] = [];
  const labs: ParsedLab[] = [];

  const sections = findDescendantsByLocalName(root, 'section');

  for (const sec of sections) {
    const titleNode = findFirstChildByLocalName(sec, 'title');
    const title = titleNode ? getElementText(titleNode).trim() : '';

    // Check templateIds
    const templateIds = findDescendantsByLocalName(sec, 'templateId').map(
      (t) => t.attributes['root'] || ''
    );
    const isVitals =
      title.toLowerCase().includes('vital') ||
      templateIds.includes('2.16.840.1.113883.10.20.22.2.4') ||
      templateIds.includes('2.16.840.1.113883.10.20.22.2.4.1');

    const isResults =
      title.toLowerCase().includes('result') ||
      templateIds.includes('2.16.840.1.113883.10.20.22.2.3') ||
      templateIds.includes('2.16.840.1.113883.10.20.22.2.3.1');

    if (isVitals) {
      const observations = findDescendantsByLocalName(sec, 'observation');
      for (const obs of observations) {
        const negation =
          obs.attributes['negationInd'] || obs.attributes['actionNegationInd'];
        if (negation === 'true') continue;

        const statusNode = findFirstChildByLocalName(obs, 'statusCode');
        const statusCode = statusNode?.attributes['code']?.toLowerCase();
        if (
          statusCode &&
          ['aborted', 'cancelled', 'nullified', 'entered-in-error'].includes(
            statusCode
          )
        ) {
          continue;
        }

        const codeNode = findFirstChildByLocalName(obs, 'code');
        const code = codeNode?.attributes['code'] || '';
        const kind = LOINC_TO_VITAL_KIND[code];
        if (!kind) continue;

        const effTime = findFirstChildByLocalName(obs, 'effectiveTime');
        const timeVal =
          effTime?.attributes['value'] ||
          findFirstChildByLocalName(effTime || obs, 'low')?.attributes[
            'value'
          ] ||
          '';
        const parsedTime = parseHl7Timestamp(timeVal);
        if (!parsedTime) continue;

        const valNode = findFirstChildByLocalName(obs, 'value');
        if (!valNode) continue;
        const rawVal = parseFloat(valNode.attributes['value'] || '');
        if (isNaN(rawVal)) continue;

        const unit = valNode.attributes['unit'] || '';
        const normalized = normalizeVitalValue(kind, rawVal, unit);
        if (normalized === null) continue;

        vitals.push({
          kind,
          sparkyType: VITAL_SPECS[kind].sparkyType,
          value: normalized,
          unit: VITAL_SPECS[kind].unit,
          rawDate: timeVal,
          isoDate: parsedTime.isoDate,
          recordedAt: parsedTime.recordedAt,
        });
      }
    }

    if (isResults) {
      const observations = findDescendantsByLocalName(sec, 'observation');
      for (const obs of observations) {
        const negation =
          obs.attributes['negationInd'] || obs.attributes['actionNegationInd'];
        if (negation === 'true') continue;

        const statusNode = findFirstChildByLocalName(obs, 'statusCode');
        const statusCode = statusNode?.attributes['code']?.toLowerCase();
        if (
          statusCode &&
          ['aborted', 'cancelled', 'nullified', 'entered-in-error'].includes(
            statusCode
          )
        ) {
          continue;
        }

        const effTime = findFirstChildByLocalName(obs, 'effectiveTime');
        const timeVal =
          effTime?.attributes['value'] ||
          findFirstChildByLocalName(effTime || obs, 'low')?.attributes[
            'value'
          ] ||
          '';
        const parsedTime = parseHl7Timestamp(timeVal);
        if (!parsedTime) continue;

        const codeNode = findFirstChildByLocalName(obs, 'code');
        const code = codeNode?.attributes['code'] || '';

        let markerName = LOINC_TO_LAB_NAME[code];
        if (!markerName) {
          const origText = findFirstChildByLocalName(
            codeNode || obs,
            'originalText'
          );
          if (origText && getElementText(origText).trim()) {
            markerName = getElementText(origText).trim();
          } else if (codeNode?.attributes['displayName']) {
            markerName = codeNode.attributes['displayName'].trim();
          }
        }
        if (!markerName) continue;
        if (IGNORED_LAB_NAMES.has(markerName.toLowerCase().trim())) continue;

        const valNode = findFirstChildByLocalName(obs, 'value');
        let valueNumeric: number | undefined;
        let valueText: string | undefined;
        let unit: string | undefined;

        if (valNode) {
          const rawNum = parseFloat(valNode.attributes['value'] || '');
          if (!isNaN(rawNum)) {
            valueNumeric = rawNum;
          } else {
            valueText = getElementText(valNode).trim() || undefined;
          }
          unit = valNode.attributes['unit'] || undefined;
        }

        // Reference range
        let refRangeLow: number | undefined;
        let refRangeHigh: number | undefined;
        const refRangeNode = findFirstChildByLocalName(obs, 'referenceRange');
        if (refRangeNode) {
          const obsRange = findFirstChildByLocalName(
            refRangeNode,
            'observationRange'
          );
          if (obsRange) {
            const low = findDescendantsByLocalName(obsRange, 'low')[0];
            const high = findDescendantsByLocalName(obsRange, 'high')[0];
            if (low && low.attributes['value']) {
              const val = parseFloat(low.attributes['value']);
              if (!isNaN(val)) refRangeLow = val;
            }
            if (high && high.attributes['value']) {
              const val = parseFloat(high.attributes['value']);
              if (!isNaN(val)) refRangeHigh = val;
            }
          }
        }

        labs.push({
          markerName,
          loinc: code || undefined,
          entryDate: parsedTime.isoDate,
          recordedAt: parsedTime.recordedAt,
          valueNumeric,
          valueText,
          unit,
          refRangeLow,
          refRangeHigh,
        });
      }
    }
  }

  return { vitals, labs };
}

/**
 * Ingests either an uncompressed XML buffer or a ZIP archive (containing DOC*.XML).
 */
export function parseClinicalRecordBuffer(
  buffer: Buffer,
  filename?: string
): ClinicalRecordPackage {
  const isZip =
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04;

  const pkg: ClinicalRecordPackage = {
    vitals: [],
    labs: [],
    sourceDocuments: [],
  };

  if (isZip) {
    const MAX_XML_ENTRIES = 32;
    const MAX_TOTAL_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
    const MAX_EXTRACTED_RECORDS = 50000;

    const entries = parseZipArchive(buffer);
    let xmlEntryCount = 0;
    let totalUncompressedBytes = 0;

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const lowerPath = entry.path.toLowerCase();
      if (!lowerPath.endsWith('.xml')) continue;

      xmlEntryCount += 1;
      if (xmlEntryCount > MAX_XML_ENTRIES) {
        throw new Error(
          `Archive contains more than ${MAX_XML_ENTRIES} XML documents`
        );
      }
      if (
        totalUncompressedBytes + entry.uncompressedSize >
        MAX_TOTAL_UNCOMPRESSED_BYTES
      ) {
        throw new Error(
          'Archive exceeds the maximum total uncompressed size for clinical records'
        );
      }

      try {
        const data = entry.getData();
        totalUncompressedBytes += data.length;
        const extracted = extractCcdaXml(data.toString('utf-8'));
        pkg.vitals.push(...extracted.vitals);
        pkg.labs.push(...extracted.labs);
        pkg.sourceDocuments.push(entry.path);
      } catch {
        // Ignore invalid XML entries inside archive
      }

      if (pkg.vitals.length + pkg.labs.length > MAX_EXTRACTED_RECORDS) {
        throw new Error(
          `Archive contains more than ${MAX_EXTRACTED_RECORDS} clinical records`
        );
      }
    }
  } else {
    const content = buffer.toString('utf-8');
    const extracted = extractCcdaXml(content);
    pkg.vitals.push(...extracted.vitals);
    pkg.labs.push(...extracted.labs);
    pkg.sourceDocuments.push(filename || 'document.xml');
  }

  // Deduplicate vitals
  const seenVitals = new Set<string>();
  pkg.vitals = pkg.vitals.filter((v) => {
    const key = `${v.kind}_${v.isoDate}_${v.value}_${v.unit}_${v.recordedAt}`;
    if (seenVitals.has(key)) return false;
    seenVitals.add(key);
    return true;
  });

  // Deduplicate labs
  const seenLabs = new Set<string>();
  pkg.labs = pkg.labs.filter((l) => {
    const key = `${l.markerName}_${l.entryDate}_${l.valueNumeric ?? ''}_${l.valueText ?? ''}_${l.unit ?? ''}_${l.recordedAt}`;
    if (seenLabs.has(key)) return false;
    seenLabs.add(key);
    return true;
  });

  return pkg;
}
