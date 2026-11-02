import { extractText, getDocumentProxy } from 'unpdf';
import chatRepository from '../models/chatRepository.js';
import { log } from '../config/logging.js';
import {
  dispatchAiRequest,
  type DispatchErrorCategory,
  type ProviderConfig,
} from '../ai/providerDispatch.js';
import { resolveAiNetworkPolicy } from '../utils/outboundUrlPolicy.js';
import {
  findLabMarkerPreset,
  labReportExtractionSchema,
  type LabReportExtraction,
  type LabReportScanResult,
} from '@workspace/shared';

const LAB_REPORT_PROMPT =
  'Read this lab report and return a JSON object with these fields: ' +
  'lab_name (string, the lab or clinic that ran the tests), ' +
  'collected_on (string YYYY-MM-DD, the date the sample was COLLECTED, not the date it was reported or printed; null when not shown), ' +
  'results (array, one entry for every test line that has a NUMERIC result, in the order printed). ' +
  'Each result has name (string, the test name as printed, without the value), ' +
  'value (number, the result), unit (string, as printed, e.g. "mg/dL", "%", "ng/mL"), ' +
  'ref_low (number, the lower bound of the printed reference range), ' +
  'ref_high (number, the upper bound of the printed reference range). ' +
  'For a range written "<200" use ref_low null and ref_high 200; for ">40" use ref_low 40 and ref_high null; ' +
  'for "4.0 - 5.6" use ref_low 4.0 and ref_high 5.6. ' +
  'Use the reference range printed on the report, never one from your own knowledge: use null when none is printed. ' +
  'Leave out lines without a number (such as "Negative" or "Normal"), flags, comments and patient details. ' +
  'Return only the JSON object, no other text.';

// 'no_ai_configured', 'unreadable_pdf' and 'document_too_large' are the
// categories this service mints itself; every dispatch failure passes its
// category through unchanged for the route's HTTP-status map.
export type LabReportScanErrorCategory =
  | DispatchErrorCategory
  | 'no_ai_configured'
  | 'unreadable_pdf'
  | 'document_too_large';

export type ExtractLabReportResult =
  | { success: true; report: LabReportExtraction }
  | {
      success: false;
      category: LabReportScanErrorCategory;
      error: string;
    };

const PDF_MIME = 'application/pdf';
// Base64 length cap: about 15 MB of PDF.
const MAX_PDF_BASE64_CHARS = 20_000_000;
// A readable lab report is a few thousand characters; below this the PDF is
// almost certainly a scan with no text layer.
const MIN_PDF_TEXT_CHARS = 80;
const MAX_PDF_TEXT_CHARS = 60_000;
// A lab report is a handful of pages. The text is read page by page on the
// server's only thread, so a PDF that declares thousands of pages is refused
// before any page is read, however small the file is.
export const MAX_PDF_PAGES = 30;

const asText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/**
 * Reads a number the model wrote as a string. A comma is a decimal separator
 * when it is the only one and not followed by exactly three digits ("5,4" is
 * 5.4, "0,0075" is 0.0075) and a thousands separator otherwise ("1,000",
 * "1,234,567"). With both a comma and a dot, whichever comes last is the
 * decimal separator ("1.234,5" is 1234.5, "1,234.5" is 1234.5).
 */
function parseNumberText(value: string): number | null {
  const text = value.replace(/[\s\u00A0\u202F]/g, '');
  // Number('') is 0, so a blank must not become a measured zero.
  if (text === '') return null;
  const commas = text.split(',').length - 1;
  let normalized = text;
  if (commas > 0 && text.includes('.')) {
    normalized =
      text.lastIndexOf(',') > text.lastIndexOf('.')
        ? text.replace(/\./g, '').replace(',', '.')
        : text.replace(/,/g, '');
  } else if (commas === 1) {
    const digitsAfter = text.length - text.indexOf(',') - 1;
    normalized =
      digitsAfter === 3 ? text.replace(',', '') : text.replace(',', '.');
  } else if (commas > 1) {
    normalized = text.replace(/,/g, '');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function asNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? parseNumberText(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
}

function asDate(value: unknown): string | null {
  const text = asText(value);
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : text;
}

/**
 * Shapes a model's JSON into the extraction contract: loose values are
 * coerced, and a result without a name or a numeric value is dropped. A range
 * whose bounds are reversed is discarded rather than trusted. Returns null when
 * nothing usable is left.
 */
export function normalizeLabReport(raw: unknown): LabReportExtraction | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const source = raw as Record<string, unknown>;
  const results = (Array.isArray(source.results) ? source.results : []).flatMap(
    (row: unknown) => {
      if (typeof row !== 'object' || row === null) return [];
      const item = row as Record<string, unknown>;
      const name = asText(item.name);
      const value = asNumber(item.value);
      if (!name || value === null) return [];
      let low = asNumber(item.ref_low);
      let high = asNumber(item.ref_high);
      if (low !== null && high !== null && low > high) {
        low = null;
        high = null;
      }
      return [
        { name, value, unit: asText(item.unit), ref_low: low, ref_high: high },
      ];
    }
  );
  const parsed = labReportExtractionSchema.safeParse({
    lab_name: asText(source.lab_name),
    collected_on: asDate(source.collected_on),
    results,
  });
  return parsed.success && parsed.data.results.length > 0 ? parsed.data : null;
}

/** Adds the known marker each result's name refers to. */
export function matchLabReportResults(
  report: LabReportExtraction
): LabReportScanResult[] {
  return report.results.map((result) => ({
    ...result,
    marker_key: findLabMarkerPreset(result.name)?.key ?? null,
  }));
}

type PdfTextResult =
  | { kind: 'text'; text: string }
  | { kind: 'too_many_pages' }
  | { kind: 'unreadable' };

async function readPdfText(base64: string): Promise<PdfTextResult> {
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
  try {
    pdf = await getDocumentProxy(
      new Uint8Array(Buffer.from(base64, 'base64')),
      {
        // Only text is wanted, so no large image is ever decoded.
        maxImageSize: 1_000_000,
      }
    );
    if (pdf.numPages > MAX_PDF_PAGES) return { kind: 'too_many_pages' };
    const { text } = await extractText(pdf, { mergePages: true });
    return { kind: 'text', text: text.trim() };
  } catch {
    return { kind: 'unreadable' };
  } finally {
    await pdf?.loadingTask.destroy().catch(() => undefined);
  }
}

async function extractLabReport(
  base64Document: string,
  mimeType: string,
  userId: string,
  actorIsAdmin = false
): Promise<ExtractLabReportResult> {
  const isPdf = mimeType.trim().toLowerCase() === PDF_MIME;

  let prompt = LAB_REPORT_PROMPT;
  if (isPdf) {
    if (base64Document.length > MAX_PDF_BASE64_CHARS) {
      return {
        success: false,
        category: 'document_too_large',
        error: 'This PDF is too large to read',
      };
    }
    // The providers take images, not PDFs, so a PDF's text layer is read here
    // and sent as text. The document itself is never stored.
    const read = await readPdfText(base64Document);
    if (read.kind === 'too_many_pages') {
      return {
        success: false,
        category: 'document_too_large',
        error: `This PDF has more than ${MAX_PDF_PAGES} pages. Send just the pages with results.`,
      };
    }
    if (read.kind === 'unreadable') {
      return {
        success: false,
        category: 'unreadable_pdf',
        error: 'This PDF could not be opened',
      };
    }
    const { text } = read;
    if (text.length < MIN_PDF_TEXT_CHARS) {
      return {
        success: false,
        category: 'unreadable_pdf',
        error:
          'This PDF has no readable text. Take a photo or screenshot of the report instead.',
      };
    }
    prompt = `${LAB_REPORT_PROMPT}\n\nLab report text:\n${text.slice(0, MAX_PDF_TEXT_CHARS)}`;
  }

  const setting = isPdf
    ? await chatRepository.getActiveAiServiceSetting(userId)
    : await chatRepository.getActiveVisionAiServiceSetting(userId);
  if (!setting) {
    return {
      success: false,
      category: 'no_ai_configured',
      error: 'No AI service configured',
    };
  }
  const aiService = await chatRepository.getAiServiceSettingForBackend(
    setting.id,
    userId
  );
  if (!aiService) {
    return {
      success: false,
      category: 'no_ai_configured',
      error: 'No AI service configured',
    };
  }

  const provider: ProviderConfig = {
    service_type: aiService.service_type,
    api_key: aiService.api_key ?? undefined,
    model_name: aiService.model_name ?? undefined,
    custom_url: aiService.custom_url ?? undefined,
  };

  const result = await dispatchAiRequest({
    provider,
    networkPolicy: await resolveAiNetworkPolicy(aiService, actorIsAdmin),
    prompt,
    ...(isPdf ? {} : { images: [{ base64: base64Document, mimeType }] }),
    parseJson: true,
  });

  if (!result.ok) {
    // Only the category and provider are logged: the report is health data.
    log(
      result.category === 'refused' || result.category === 'no_content'
        ? 'warn'
        : 'error',
      `Lab report scan: ${provider.service_type} failed for user ${userId} (${result.category}): ${result.detail}`
    );
    return { success: false, category: result.category, error: result.detail };
  }

  const report = normalizeLabReport(result.json);
  if (!report) {
    return {
      success: false,
      category: 'parse_error',
      error: 'No lab results could be read from the report',
    };
  }
  return { success: true, report };
}

export { extractLabReport };
export default { extractLabReport };
