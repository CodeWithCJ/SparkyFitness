import { useMemo } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { LabMarkerLabels } from './labResults';

/** Localized names for the built-in lab markers, keyed by their shared preset key. */
export const getLabMarkerLabels = (t: TFunction): LabMarkerLabels => ({
  hba1c: t('labs.markers.hba1c', { defaultValue: 'HbA1c' }),
  fasting_glucose: t('labs.markers.fasting_glucose', {
    defaultValue: 'Fasting Glucose',
  }),
  total_cholesterol: t('labs.markers.total_cholesterol', {
    defaultValue: 'Total Cholesterol',
  }),
  hdl: t('labs.markers.hdl', { defaultValue: 'HDL Cholesterol' }),
  ldl: t('labs.markers.ldl', { defaultValue: 'LDL Cholesterol' }),
  triglycerides: t('labs.markers.triglycerides', {
    defaultValue: 'Triglycerides',
  }),
  vitamin_d: t('labs.markers.vitamin_d', { defaultValue: 'Vitamin D (25-OH)' }),
  tsh: t('labs.markers.tsh', { defaultValue: 'TSH' }),
  ferritin: t('labs.markers.ferritin', { defaultValue: 'Ferritin' }),
  vitamin_b12: t('labs.markers.vitamin_b12', { defaultValue: 'Vitamin B12' }),
  creatinine: t('labs.markers.creatinine', { defaultValue: 'Creatinine' }),
  egfr: t('labs.markers.egfr', { defaultValue: 'eGFR' }),
  alt: t('labs.markers.alt', { defaultValue: 'ALT' }),
  ast: t('labs.markers.ast', { defaultValue: 'AST' }),
  non_hdl: t('labs.markers.non_hdl', { defaultValue: 'Non-HDL Cholesterol' }),
  apob: t('labs.markers.apob', { defaultValue: 'Apolipoprotein B' }),
  vldl: t('labs.markers.vldl', { defaultValue: 'VLDL Cholesterol' }),
  fasting_insulin: t('labs.markers.fasting_insulin', {
    defaultValue: 'Fasting Insulin',
  }),
  wbc: t('labs.markers.wbc', { defaultValue: 'White Blood Cells' }),
  rbc: t('labs.markers.rbc', { defaultValue: 'Red Blood Cells' }),
  hemoglobin: t('labs.markers.hemoglobin', { defaultValue: 'Hemoglobin' }),
  hematocrit: t('labs.markers.hematocrit', { defaultValue: 'Hematocrit' }),
  mcv: t('labs.markers.mcv', { defaultValue: 'MCV' }),
  platelets: t('labs.markers.platelets', { defaultValue: 'Platelets' }),
  sodium: t('labs.markers.sodium', { defaultValue: 'Sodium' }),
  potassium: t('labs.markers.potassium', { defaultValue: 'Potassium' }),
  chloride: t('labs.markers.chloride', { defaultValue: 'Chloride' }),
  bicarbonate: t('labs.markers.bicarbonate', {
    defaultValue: 'Bicarbonate (CO2)',
  }),
  calcium: t('labs.markers.calcium', { defaultValue: 'Calcium' }),
  magnesium: t('labs.markers.magnesium', { defaultValue: 'Magnesium' }),
  phosphorus: t('labs.markers.phosphorus', { defaultValue: 'Phosphorus' }),
  bun: t('labs.markers.bun', { defaultValue: 'BUN' }),
  uric_acid: t('labs.markers.uric_acid', { defaultValue: 'Uric Acid' }),
  albumin: t('labs.markers.albumin', { defaultValue: 'Albumin' }),
  total_protein: t('labs.markers.total_protein', {
    defaultValue: 'Total Protein',
  }),
  alp: t('labs.markers.alp', { defaultValue: 'Alkaline Phosphatase' }),
  total_bilirubin: t('labs.markers.total_bilirubin', {
    defaultValue: 'Total Bilirubin',
  }),
  ggt: t('labs.markers.ggt', { defaultValue: 'GGT' }),
  free_t4: t('labs.markers.free_t4', { defaultValue: 'Free T4' }),
  free_t3: t('labs.markers.free_t3', { defaultValue: 'Free T3' }),
  iron: t('labs.markers.iron', { defaultValue: 'Iron' }),
  tibc: t('labs.markers.tibc', { defaultValue: 'TIBC' }),
  transferrin_saturation: t('labs.markers.transferrin_saturation', {
    defaultValue: 'Transferrin Saturation',
  }),
  folate: t('labs.markers.folate', { defaultValue: 'Folate' }),
  crp: t('labs.markers.crp', { defaultValue: 'hs-CRP' }),
  esr: t('labs.markers.esr', { defaultValue: 'ESR' }),
  homocysteine: t('labs.markers.homocysteine', {
    defaultValue: 'Homocysteine',
  }),
  cortisol: t('labs.markers.cortisol', { defaultValue: 'Cortisol (AM)' }),
  psa: t('labs.markers.psa', { defaultValue: 'PSA' }),
  testosterone: t('labs.markers.testosterone', {
    defaultValue: 'Testosterone (Total)',
  }),
  estradiol: t('labs.markers.estradiol', { defaultValue: 'Estradiol' }),
  lipoprotein_a: t('labs.markers.lipoprotein_a', {
    defaultValue: 'Lipoprotein(a)',
  }),
  ketones: t('labs.markers.ketones', {
    defaultValue: 'Ketones (Beta-Hydroxybutyrate)',
  }),
  c_peptide: t('labs.markers.c_peptide', { defaultValue: 'C-Peptide' }),
  fructosamine: t('labs.markers.fructosamine', {
    defaultValue: 'Fructosamine',
  }),
  neutrophils: t('labs.markers.neutrophils', { defaultValue: 'Neutrophils' }),
  lymphocytes: t('labs.markers.lymphocytes', { defaultValue: 'Lymphocytes' }),
  monocytes: t('labs.markers.monocytes', { defaultValue: 'Monocytes' }),
  eosinophils: t('labs.markers.eosinophils', { defaultValue: 'Eosinophils' }),
  mch: t('labs.markers.mch', { defaultValue: 'MCH' }),
  mchc: t('labs.markers.mchc', { defaultValue: 'MCHC' }),
  rdw: t('labs.markers.rdw', { defaultValue: 'RDW' }),
  mpv: t('labs.markers.mpv', { defaultValue: 'MPV' }),
  globulin: t('labs.markers.globulin', { defaultValue: 'Globulin' }),
  direct_bilirubin: t('labs.markers.direct_bilirubin', {
    defaultValue: 'Direct Bilirubin',
  }),
  anion_gap: t('labs.markers.anion_gap', { defaultValue: 'Anion Gap' }),
  bun_creatinine_ratio: t('labs.markers.bun_creatinine_ratio', {
    defaultValue: 'BUN/Creatinine Ratio',
  }),
  cystatin_c: t('labs.markers.cystatin_c', { defaultValue: 'Cystatin C' }),
  urine_albumin_creatinine: t('labs.markers.urine_albumin_creatinine', {
    defaultValue: 'Urine Albumin/Creatinine Ratio',
  }),
  amylase: t('labs.markers.amylase', { defaultValue: 'Amylase' }),
  lipase: t('labs.markers.lipase', { defaultValue: 'Lipase' }),
  ldh: t('labs.markers.ldh', { defaultValue: 'LDH' }),
  ck: t('labs.markers.ck', { defaultValue: 'Creatine Kinase' }),
  ammonia: t('labs.markers.ammonia', { defaultValue: 'Ammonia' }),
  zinc: t('labs.markers.zinc', { defaultValue: 'Zinc' }),
  copper: t('labs.markers.copper', { defaultValue: 'Copper' }),
  selenium: t('labs.markers.selenium', { defaultValue: 'Selenium' }),
  vitamin_b6: t('labs.markers.vitamin_b6', { defaultValue: 'Vitamin B6' }),
  vitamin_a: t('labs.markers.vitamin_a', { defaultValue: 'Vitamin A' }),
  vitamin_e: t('labs.markers.vitamin_e', { defaultValue: 'Vitamin E' }),
  pth: t('labs.markers.pth', { defaultValue: 'PTH' }),
  igf_1: t('labs.markers.igf_1', { defaultValue: 'IGF-1' }),
  dhea_s: t('labs.markers.dhea_s', { defaultValue: 'DHEA-S' }),
  free_testosterone: t('labs.markers.free_testosterone', {
    defaultValue: 'Free Testosterone',
  }),
  shbg: t('labs.markers.shbg', { defaultValue: 'SHBG' }),
  fsh: t('labs.markers.fsh', { defaultValue: 'FSH' }),
  lh: t('labs.markers.lh', { defaultValue: 'LH' }),
  progesterone: t('labs.markers.progesterone', {
    defaultValue: 'Progesterone',
  }),
  prolactin: t('labs.markers.prolactin', { defaultValue: 'Prolactin' }),
  tpo_antibodies: t('labs.markers.tpo_antibodies', {
    defaultValue: 'TPO Antibodies',
  }),
});

export const useLabMarkerLabels = (): LabMarkerLabels => {
  const { t } = useTranslation();
  return useMemo(() => getLabMarkerLabels(t), [t]);
};
