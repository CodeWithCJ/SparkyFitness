// Presets for lab-result markers. Each preset defines a stable key, display
// name, unit, default reference range, and aliases. Built-in markers are not
// stored in the database; their `key` is kept in `lab_results.marker_key`.
// Ranges are common adult defaults only; labs differ, so the user can edit
// them. `refRangeLow`/`refRangeHigh` are the sex-neutral default; markers that
// differ by sex also have an entry in `LAB_MARKER_SEX_RANGES`, which
// `labPresetRange` prefers when the profile's sex is known. Markers with no
// sensible single default have no range. Age is not used. `aliases` are the
// other names a lab report may print, used to match scanned results to a
// marker.
export interface LabMarkerPreset {
  /** Stable key. Built-in markers store it in `lab_results.marker_key`. */
  key: string;
  displayName: string;
  unit: string;
  refRangeLow: number | null;
  refRangeHigh: number | null;
  aliases: readonly string[];
}

export const LAB_MARKER_PRESETS: readonly LabMarkerPreset[] = [
  {
    key: 'hba1c',
    displayName: 'HbA1c',
    unit: '%',
    refRangeLow: 4,
    refRangeHigh: 5.6,
    aliases: [
      'hemoglobin a1c',
      'glycated hemoglobin',
      'glycohemoglobin',
      'a1c',
    ],
  },
  {
    key: 'fasting_glucose',
    displayName: 'Fasting Glucose',
    unit: 'mg/dL',
    refRangeLow: 70,
    refRangeHigh: 99,
    aliases: ['glucose', 'glucose, fasting', 'fasting blood sugar', 'fbs'],
  },
  {
    key: 'total_cholesterol',
    displayName: 'Total Cholesterol',
    unit: 'mg/dL',
    refRangeLow: null,
    refRangeHigh: 200,
    aliases: ['cholesterol', 'cholesterol, total'],
  },
  {
    key: 'hdl',
    displayName: 'HDL Cholesterol',
    unit: 'mg/dL',
    refRangeLow: 40,
    refRangeHigh: null,
    aliases: ['hdl', 'hdl-c', 'hdl cholesterol'],
  },
  {
    key: 'ldl',
    displayName: 'LDL Cholesterol',
    unit: 'mg/dL',
    refRangeLow: null,
    refRangeHigh: 100,
    aliases: ['ldl', 'ldl-c', 'ldl cholesterol', 'ldl cholesterol calc'],
  },
  {
    key: 'triglycerides',
    displayName: 'Triglycerides',
    unit: 'mg/dL',
    refRangeLow: null,
    refRangeHigh: 150,
    aliases: ['trigs', 'tg'],
  },
  {
    key: 'vitamin_d',
    displayName: 'Vitamin D (25-OH)',
    unit: 'ng/mL',
    refRangeLow: 30,
    refRangeHigh: 100,
    aliases: ['vitamin d', '25-hydroxyvitamin d', '25-oh vitamin d', 'vit d'],
  },
  {
    key: 'tsh',
    displayName: 'TSH',
    unit: 'mIU/L',
    refRangeLow: 0.4,
    refRangeHigh: 4.0,
    aliases: ['thyroid stimulating hormone', 'thyrotropin'],
  },
  {
    key: 'ferritin',
    displayName: 'Ferritin',
    unit: 'ng/mL',
    refRangeLow: 30,
    refRangeHigh: 400,
    aliases: [],
  },
  {
    key: 'vitamin_b12',
    displayName: 'Vitamin B12',
    unit: 'pg/mL',
    refRangeLow: 200,
    refRangeHigh: 900,
    aliases: ['b12', 'cobalamin'],
  },
  {
    key: 'creatinine',
    displayName: 'Creatinine',
    unit: 'mg/dL',
    refRangeLow: 0.6,
    refRangeHigh: 1.3,
    aliases: [],
  },
  {
    key: 'egfr',
    displayName: 'eGFR',
    unit: 'mL/min/1.73m²',
    refRangeLow: 60,
    refRangeHigh: null,
    aliases: ['estimated gfr', 'gfr'],
  },
  {
    key: 'alt',
    displayName: 'ALT',
    unit: 'U/L',
    refRangeLow: 7,
    refRangeHigh: 56,
    aliases: ['alanine aminotransferase', 'sgpt'],
  },
  {
    key: 'ast',
    displayName: 'AST',
    unit: 'U/L',
    refRangeLow: 10,
    refRangeHigh: 40,
    aliases: ['aspartate aminotransferase', 'sgot'],
  },
  {
    key: 'non_hdl',
    displayName: 'Non-HDL Cholesterol',
    unit: 'mg/dL',
    refRangeLow: null,
    refRangeHigh: 130,
    aliases: ['non-hdl', 'non hdl', 'non-hdl cholesterol'],
  },
  {
    key: 'apob',
    displayName: 'Apolipoprotein B',
    unit: 'mg/dL',
    refRangeLow: null,
    refRangeHigh: 90,
    aliases: ['apo b', 'apob', 'apolipoprotein b'],
  },
  {
    key: 'vldl',
    displayName: 'VLDL Cholesterol',
    unit: 'mg/dL',
    refRangeLow: 5,
    refRangeHigh: 40,
    aliases: ['vldl', 'vldl cholesterol', 'vldl cholesterol cal'],
  },
  {
    key: 'fasting_insulin',
    displayName: 'Fasting Insulin',
    unit: 'µIU/mL',
    refRangeLow: 2,
    refRangeHigh: 25,
    aliases: ['insulin', 'insulin, fasting'],
  },
  {
    key: 'wbc',
    displayName: 'White Blood Cells',
    unit: '10³/µL',
    refRangeLow: 4.0,
    refRangeHigh: 11.0,
    aliases: ['wbc', 'white blood cell count', 'leukocytes'],
  },
  {
    key: 'rbc',
    displayName: 'Red Blood Cells',
    unit: '10⁶/µL',
    refRangeLow: 4.2,
    refRangeHigh: 5.9,
    aliases: ['rbc', 'red blood cell count', 'erythrocytes'],
  },
  {
    key: 'hemoglobin',
    displayName: 'Hemoglobin',
    unit: 'g/dL',
    refRangeLow: 12.0,
    refRangeHigh: 17.5,
    aliases: ['hgb', 'hb'],
  },
  {
    key: 'hematocrit',
    displayName: 'Hematocrit',
    unit: '%',
    refRangeLow: 36,
    refRangeHigh: 52,
    aliases: ['hct'],
  },
  {
    key: 'mcv',
    displayName: 'MCV',
    unit: 'fL',
    refRangeLow: 80,
    refRangeHigh: 100,
    aliases: ['mean corpuscular volume'],
  },
  {
    key: 'platelets',
    displayName: 'Platelets',
    unit: '10³/µL',
    refRangeLow: 150,
    refRangeHigh: 450,
    aliases: ['plt', 'platelet count'],
  },
  {
    key: 'sodium',
    displayName: 'Sodium',
    unit: 'mmol/L',
    refRangeLow: 135,
    refRangeHigh: 145,
    aliases: ['na'],
  },
  {
    key: 'potassium',
    displayName: 'Potassium',
    unit: 'mmol/L',
    refRangeLow: 3.5,
    refRangeHigh: 5.1,
    aliases: ['k'],
  },
  {
    key: 'chloride',
    displayName: 'Chloride',
    unit: 'mmol/L',
    refRangeLow: 98,
    refRangeHigh: 107,
    aliases: ['cl'],
  },
  {
    key: 'bicarbonate',
    displayName: 'Bicarbonate (CO2)',
    unit: 'mmol/L',
    refRangeLow: 22,
    refRangeHigh: 29,
    aliases: ['co2', 'carbon dioxide', 'bicarb', 'co2, total'],
  },
  {
    key: 'calcium',
    displayName: 'Calcium',
    unit: 'mg/dL',
    refRangeLow: 8.5,
    refRangeHigh: 10.5,
    aliases: ['ca'],
  },
  {
    key: 'magnesium',
    displayName: 'Magnesium',
    unit: 'mg/dL',
    refRangeLow: 1.7,
    refRangeHigh: 2.2,
    aliases: ['mg'],
  },
  {
    key: 'phosphorus',
    displayName: 'Phosphorus',
    unit: 'mg/dL',
    refRangeLow: 2.5,
    refRangeHigh: 4.5,
    aliases: ['phosphate', 'phos'],
  },
  {
    key: 'bun',
    displayName: 'BUN',
    unit: 'mg/dL',
    refRangeLow: 7,
    refRangeHigh: 20,
    aliases: ['blood urea nitrogen', 'urea nitrogen'],
  },
  {
    key: 'uric_acid',
    displayName: 'Uric Acid',
    unit: 'mg/dL',
    refRangeLow: 3.5,
    refRangeHigh: 7.2,
    aliases: ['urate'],
  },
  {
    key: 'albumin',
    displayName: 'Albumin',
    unit: 'g/dL',
    refRangeLow: 3.5,
    refRangeHigh: 5.0,
    aliases: [],
  },
  {
    key: 'total_protein',
    displayName: 'Total Protein',
    unit: 'g/dL',
    refRangeLow: 6.0,
    refRangeHigh: 8.3,
    aliases: ['protein, total'],
  },
  {
    key: 'alp',
    displayName: 'Alkaline Phosphatase',
    unit: 'U/L',
    refRangeLow: 44,
    refRangeHigh: 147,
    aliases: ['alp', 'alk phos', 'alkaline phosphatase'],
  },
  {
    key: 'total_bilirubin',
    displayName: 'Total Bilirubin',
    unit: 'mg/dL',
    refRangeLow: 0.1,
    refRangeHigh: 1.2,
    aliases: ['bilirubin', 'bilirubin, total'],
  },
  {
    key: 'ggt',
    displayName: 'GGT',
    unit: 'U/L',
    refRangeLow: 9,
    refRangeHigh: 60,
    aliases: ['gamma-glutamyl transferase', 'gamma gt'],
  },
  {
    key: 'free_t4',
    displayName: 'Free T4',
    unit: 'ng/dL',
    refRangeLow: 0.8,
    refRangeHigh: 1.8,
    aliases: ['ft4', 't4, free', 'thyroxine, free'],
  },
  {
    key: 'free_t3',
    displayName: 'Free T3',
    unit: 'pg/mL',
    refRangeLow: 2.3,
    refRangeHigh: 4.2,
    aliases: ['ft3', 't3, free', 'triiodothyronine, free'],
  },
  {
    key: 'iron',
    displayName: 'Iron',
    unit: 'µg/dL',
    refRangeLow: 60,
    refRangeHigh: 170,
    aliases: ['iron, serum', 'serum iron'],
  },
  {
    key: 'tibc',
    displayName: 'TIBC',
    unit: 'µg/dL',
    refRangeLow: 250,
    refRangeHigh: 450,
    aliases: ['total iron binding capacity', 'iron binding capacity'],
  },
  {
    key: 'transferrin_saturation',
    displayName: 'Transferrin Saturation',
    unit: '%',
    refRangeLow: 20,
    refRangeHigh: 50,
    aliases: ['iron saturation', 'tsat', '% saturation'],
  },
  {
    key: 'folate',
    displayName: 'Folate',
    unit: 'ng/mL',
    refRangeLow: 4,
    refRangeHigh: 20,
    aliases: ['folic acid', 'vitamin b9'],
  },
  {
    key: 'crp',
    displayName: 'hs-CRP',
    unit: 'mg/L',
    refRangeLow: null,
    refRangeHigh: 3.0,
    aliases: ['crp', 'c-reactive protein', 'hs-crp', 'high sensitivity crp'],
  },
  {
    key: 'esr',
    displayName: 'ESR',
    unit: 'mm/hr',
    refRangeLow: 0,
    refRangeHigh: 20,
    aliases: [
      'sed rate',
      'sedimentation rate',
      'erythrocyte sedimentation rate',
    ],
  },
  {
    key: 'homocysteine',
    displayName: 'Homocysteine',
    unit: 'µmol/L',
    refRangeLow: 5,
    refRangeHigh: 15,
    aliases: [],
  },
  {
    key: 'cortisol',
    displayName: 'Cortisol (AM)',
    unit: 'µg/dL',
    refRangeLow: 6,
    refRangeHigh: 23,
    aliases: ['cortisol, am', 'cortisol, total'],
  },
  {
    key: 'psa',
    displayName: 'PSA',
    unit: 'ng/mL',
    refRangeLow: null,
    refRangeHigh: 4.0,
    aliases: ['prostate specific antigen', 'psa, total'],
  },
  {
    key: 'testosterone',
    displayName: 'Testosterone (Total)',
    unit: 'ng/dL',
    refRangeLow: null,
    refRangeHigh: null,
    aliases: ['testosterone', 'testosterone, total'],
  },
  {
    key: 'estradiol',
    displayName: 'Estradiol',
    unit: 'pg/mL',
    refRangeLow: null,
    refRangeHigh: null,
    aliases: ['e2', 'estradiol, serum'],
  },
  {
    key: 'lipoprotein_a',
    displayName: 'Lipoprotein(a)',
    unit: 'nmol/L',
    refRangeLow: null,
    refRangeHigh: 75,
    aliases: ['lp(a)', 'lp a', 'lipoprotein a'],
  },
  {
    key: 'ketones',
    displayName: 'Ketones (Beta-Hydroxybutyrate)',
    unit: 'mmol/L',
    refRangeLow: null,
    refRangeHigh: 0.5,
    aliases: ['bhb', 'beta-hydroxybutyrate', 'ketones, blood'],
  },
  {
    key: 'c_peptide',
    displayName: 'C-Peptide',
    unit: 'ng/mL',
    refRangeLow: 0.8,
    refRangeHigh: 3.1,
    aliases: ['c peptide'],
  },
  {
    key: 'fructosamine',
    displayName: 'Fructosamine',
    unit: 'µmol/L',
    refRangeLow: 200,
    refRangeHigh: 285,
    aliases: [],
  },
  {
    key: 'neutrophils',
    displayName: 'Neutrophils',
    unit: '10³/µL',
    refRangeLow: 1.5,
    refRangeHigh: 8.0,
    aliases: ['neutrophils, absolute', 'absolute neutrophils', 'anc'],
  },
  {
    key: 'lymphocytes',
    displayName: 'Lymphocytes',
    unit: '10³/µL',
    refRangeLow: 1.0,
    refRangeHigh: 4.8,
    aliases: ['lymphocytes, absolute', 'absolute lymphocytes'],
  },
  {
    key: 'monocytes',
    displayName: 'Monocytes',
    unit: '10³/µL',
    refRangeLow: 0.2,
    refRangeHigh: 1.0,
    aliases: ['monocytes, absolute', 'absolute monocytes'],
  },
  {
    key: 'eosinophils',
    displayName: 'Eosinophils',
    unit: '10³/µL',
    refRangeLow: null,
    refRangeHigh: 0.5,
    aliases: ['eosinophils, absolute', 'absolute eosinophils'],
  },
  {
    key: 'mch',
    displayName: 'MCH',
    unit: 'pg',
    refRangeLow: 27,
    refRangeHigh: 33,
    aliases: ['mean corpuscular hemoglobin'],
  },
  {
    key: 'mchc',
    displayName: 'MCHC',
    unit: 'g/dL',
    refRangeLow: 32,
    refRangeHigh: 36,
    aliases: ['mean corpuscular hemoglobin concentration'],
  },
  {
    key: 'rdw',
    displayName: 'RDW',
    unit: '%',
    refRangeLow: 11.5,
    refRangeHigh: 14.5,
    aliases: ['red cell distribution width'],
  },
  {
    key: 'mpv',
    displayName: 'MPV',
    unit: 'fL',
    refRangeLow: 7.5,
    refRangeHigh: 12.5,
    aliases: ['mean platelet volume'],
  },
  {
    key: 'globulin',
    displayName: 'Globulin',
    unit: 'g/dL',
    refRangeLow: 2.0,
    refRangeHigh: 3.5,
    aliases: ['globulin, total'],
  },
  {
    key: 'direct_bilirubin',
    displayName: 'Direct Bilirubin',
    unit: 'mg/dL',
    refRangeLow: null,
    refRangeHigh: 0.3,
    aliases: ['bilirubin, direct', 'conjugated bilirubin'],
  },
  {
    key: 'anion_gap',
    displayName: 'Anion Gap',
    unit: 'mmol/L',
    refRangeLow: 4,
    refRangeHigh: 12,
    aliases: [],
  },
  {
    key: 'bun_creatinine_ratio',
    displayName: 'BUN/Creatinine Ratio',
    unit: 'ratio',
    refRangeLow: 10,
    refRangeHigh: 20,
    aliases: ['bun/creatinine', 'bun creatinine ratio'],
  },
  {
    key: 'cystatin_c',
    displayName: 'Cystatin C',
    unit: 'mg/L',
    refRangeLow: 0.5,
    refRangeHigh: 1.0,
    aliases: ['cystatin-c'],
  },
  {
    key: 'urine_albumin_creatinine',
    displayName: 'Urine Albumin/Creatinine Ratio',
    unit: 'mg/g',
    refRangeLow: null,
    refRangeHigh: 30,
    aliases: [
      'uacr',
      'acr',
      'microalbumin/creatinine ratio',
      'albumin/creatinine ratio, urine',
    ],
  },
  {
    key: 'amylase',
    displayName: 'Amylase',
    unit: 'U/L',
    refRangeLow: 30,
    refRangeHigh: 110,
    aliases: [],
  },
  {
    key: 'lipase',
    displayName: 'Lipase',
    unit: 'U/L',
    refRangeLow: null,
    refRangeHigh: 60,
    aliases: [],
  },
  {
    key: 'ldh',
    displayName: 'LDH',
    unit: 'U/L',
    refRangeLow: 120,
    refRangeHigh: 246,
    aliases: ['lactate dehydrogenase'],
  },
  {
    key: 'ck',
    displayName: 'Creatine Kinase',
    unit: 'U/L',
    refRangeLow: 30,
    refRangeHigh: 200,
    aliases: ['ck, total', 'cpk', 'creatine phosphokinase'],
  },
  {
    key: 'ammonia',
    displayName: 'Ammonia',
    unit: 'µmol/L',
    refRangeLow: 15,
    refRangeHigh: 45,
    aliases: [],
  },
  {
    key: 'zinc',
    displayName: 'Zinc',
    unit: 'µg/dL',
    refRangeLow: 60,
    refRangeHigh: 120,
    aliases: ['zinc, serum'],
  },
  {
    key: 'copper',
    displayName: 'Copper',
    unit: 'µg/dL',
    refRangeLow: 70,
    refRangeHigh: 140,
    aliases: ['copper, serum'],
  },
  {
    key: 'selenium',
    displayName: 'Selenium',
    unit: 'µg/L',
    refRangeLow: 70,
    refRangeHigh: 150,
    aliases: ['selenium, serum'],
  },
  {
    key: 'vitamin_b6',
    displayName: 'Vitamin B6',
    unit: 'µg/L',
    refRangeLow: 5,
    refRangeHigh: 50,
    aliases: ['pyridoxal 5-phosphate', 'b6', 'pyridoxine'],
  },
  {
    key: 'vitamin_a',
    displayName: 'Vitamin A',
    unit: 'µg/dL',
    refRangeLow: 30,
    refRangeHigh: 95,
    aliases: ['retinol'],
  },
  {
    key: 'vitamin_e',
    displayName: 'Vitamin E',
    unit: 'mg/L',
    refRangeLow: 5.5,
    refRangeHigh: 17,
    aliases: ['alpha-tocopherol', 'tocopherol'],
  },
  {
    key: 'pth',
    displayName: 'PTH',
    unit: 'pg/mL',
    refRangeLow: 15,
    refRangeHigh: 65,
    aliases: ['parathyroid hormone', 'pth, intact'],
  },
  {
    key: 'igf_1',
    displayName: 'IGF-1',
    unit: 'ng/mL',
    refRangeLow: null,
    refRangeHigh: null,
    aliases: ['igf1', 'insulin-like growth factor 1', 'somatomedin c'],
  },
  {
    key: 'dhea_s',
    displayName: 'DHEA-S',
    unit: 'µg/dL',
    refRangeLow: null,
    refRangeHigh: null,
    aliases: ['dheas', 'dhea sulfate', 'dehydroepiandrosterone sulfate'],
  },
  {
    key: 'free_testosterone',
    displayName: 'Free Testosterone',
    unit: 'pg/mL',
    refRangeLow: null,
    refRangeHigh: null,
    aliases: ['testosterone, free'],
  },
  {
    key: 'shbg',
    displayName: 'SHBG',
    unit: 'nmol/L',
    refRangeLow: null,
    refRangeHigh: null,
    aliases: ['sex hormone binding globulin'],
  },
  {
    key: 'fsh',
    displayName: 'FSH',
    unit: 'mIU/mL',
    refRangeLow: null,
    refRangeHigh: null,
    aliases: ['follicle stimulating hormone'],
  },
  {
    key: 'lh',
    displayName: 'LH',
    unit: 'mIU/mL',
    refRangeLow: null,
    refRangeHigh: null,
    aliases: ['luteinizing hormone'],
  },
  {
    key: 'progesterone',
    displayName: 'Progesterone',
    unit: 'ng/mL',
    refRangeLow: null,
    refRangeHigh: null,
    aliases: [],
  },
  {
    key: 'prolactin',
    displayName: 'Prolactin',
    unit: 'ng/mL',
    refRangeLow: null,
    refRangeHigh: 25,
    aliases: ['prl'],
  },
  {
    key: 'tpo_antibodies',
    displayName: 'TPO Antibodies',
    unit: 'IU/mL',
    refRangeLow: null,
    refRangeHigh: 35,
    aliases: ['tpo', 'thyroid peroxidase antibodies', 'anti-tpo'],
  },
];

export type LabSex = 'male' | 'female';

export interface LabRange {
  readonly low: number | null;
  readonly high: number | null;
}

const r = (low: number | null, high: number | null): LabRange => ({
  low,
  high,
});

/** Typical adult ranges by sex, for the markers where they differ. */
export const LAB_MARKER_SEX_RANGES: Readonly<
  Record<string, Record<LabSex, LabRange>>
> = {
  hdl: { male: r(40, null), female: r(50, null) },
  ferritin: { male: r(24, 336), female: r(11, 307) },
  creatinine: { male: r(0.74, 1.35), female: r(0.59, 1.04) },
  alt: { male: r(7, 55), female: r(7, 45) },
  ast: { male: r(10, 40), female: r(9, 32) },
  ggt: { male: r(8, 61), female: r(5, 36) },
  rbc: { male: r(4.5, 5.9), female: r(4.1, 5.1) },
  hemoglobin: { male: r(13.5, 17.5), female: r(12.0, 15.5) },
  hematocrit: { male: r(41, 53), female: r(36, 46) },
  uric_acid: { male: r(3.4, 7.0), female: r(2.4, 6.0) },
  esr: { male: r(0, 15), female: r(0, 20) },
  iron: { male: r(65, 175), female: r(50, 170) },
  transferrin_saturation: { male: r(20, 50), female: r(15, 50) },
  testosterone: { male: r(264, 916), female: r(15, 70) },
  free_testosterone: { male: r(50, 210), female: r(1.0, 8.5) },
  shbg: { male: r(10, 57), female: r(18, 144) },
  // Female estradiol swings across the cycle, so it has no default.
  estradiol: { male: r(10, 40), female: r(null, null) },
  // PSA is a prostate marker; there is no female range.
  psa: { male: r(null, 4.0), female: r(null, null) },
};

/** True when the preset has a different range for each sex. */
export function hasSexSpecificRange(preset: LabMarkerPreset): boolean {
  return preset.key in LAB_MARKER_SEX_RANGES;
}

/**
 * The reference range to prefill for a preset: the sex-specific one when the
 * profile's sex is known, otherwise the sex-neutral default.
 */
export function labPresetRange(
  preset: LabMarkerPreset,
  sex: LabSex | null | undefined
): LabRange {
  const bySex = sex ? LAB_MARKER_SEX_RANGES[preset.key]?.[sex] : undefined;
  return bySex ?? { low: preset.refRangeLow, high: preset.refRangeHigh };
}

export type LabRangeStatus = 'low' | 'high' | 'in_range' | 'unknown';

/** Where a value sits against a reference range; a missing bound is open-ended. */
export function labRangeStatus(
  value: number,
  low: number | null,
  high: number | null
): LabRangeStatus {
  if (low === null && high === null) return 'unknown';
  if (low !== null && value < low) return 'low';
  if (high !== null && value > high) return 'high';
  return 'in_range';
}

/** Finds the preset a printed marker name refers to (case-insensitive). */
export function findLabMarkerPreset(name: string): LabMarkerPreset | undefined {
  const needle = name.trim().toLowerCase();
  return LAB_MARKER_PRESETS.find(
    (p) =>
      p.key === needle ||
      p.displayName.toLowerCase() === needle ||
      p.aliases.includes(needle)
  );
}
