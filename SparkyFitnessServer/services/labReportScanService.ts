import sharp from 'sharp';
import { getDocumentProxy } from 'unpdf';
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
// What fits in one prompt. Text past it is never cut off silently: the results
// further down would be missing from the review with nothing to say so, so a
// longer document is refused and the person sends just the pages with results.
const MAX_PDF_TEXT_CHARS = 60_000;
// Text is read from the PDF as a stream and the read stops here, before the
// whole document's text exists. A PDF stream can expand about a thousandfold,
// so a small file can hold hundreds of millions of characters. This is on the
// raw text, before whitespace is collapsed, and is twice the prompt limit so
// ordinary layout whitespace never trips it.
const MAX_RAW_PDF_TEXT_CHARS = MAX_PDF_TEXT_CHARS * 2;
// A lab report is a handful of pages. The text is read page by page on the
// server's only thread, so a PDF that declares thousands of pages is refused
// before any page is read, however small the file is.
export const MAX_PDF_PAGES = 30;

// The photo types the food-photo route accepts, less HEIC and HEIF: those go
// through a separate converter that decodes the whole image before it can be
// bounded, and sharp cannot read their headers to check the size first. The
// phone app sends JPEG, and anything else can be saved as one.
// A photo is base64-decoded and fully decoded and resized before the AI call,
// so each bound limits what one request can make the server allocate.
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const MAX_IMAGE_BASE64_CHARS = 8 * 1024 * 1024;
// A small file can declare enormous dimensions and decode to hundreds of
// megabytes, so the declared size is read from the header (no decoding) first.
// 50 megapixels covers any phone camera's full-resolution photo.
export const MAX_IMAGE_PIXELS = 50_000_000;

type ImageHeaderCheck = 'ok' | 'too_many_pixels' | 'unreadable';

/**
 * Reads the declared size from the image header, without decoding it. A file
 * whose header cannot be read is refused rather than passed on: nothing past
 * this point can bound it, and a photo with no readable header is not one.
 */
async function checkImageHeader(base64: string): Promise<ImageHeaderCheck> {
  try {
    const { width, height } = await sharp(Buffer.from(base64, 'base64'), {
      limitInputPixels: false,
    }).metadata();
    if (!width || !height) return 'unreadable';
    return width * height > MAX_IMAGE_PIXELS ? 'too_many_pixels' : 'ok';
  } catch {
    return 'unreadable';
  }
}

const asText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/**
 * Reads a number the model wrote as a string. A comma is a decimal separator
 * when it is the only one, unless it is a thousands separator: three digits
 * follow it and the whole part is one to three digits without a leading zero
 * ("1,130" is 1130, but "5,4", "0,007" and "1234,567" are decimals). Several
 * commas are all thousands separators ("1,234,567"). With both a comma and a dot, whichever comes last is the
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
    const at = text.indexOf(',');
    const whole = text.slice(0, at);
    const digitsAfter = text.length - at - 1;
    // Thousands groups follow a whole part of one to three digits that does
    // not start with a zero, so "0,007" and ",007" are decimals.
    const thousands = digitsAfter === 3 && /^[1-9]\d{0,2}$/.test(whole);
    normalized = thousands ? text.replace(',', '') : text.replace(',', '.');
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
  | { kind: 'too_much_text' }
  | { kind: 'unreadable' };

interface TextChunk {
  items: Array<{ str?: unknown; hasEOL?: boolean }>;
}

/** Collapses whitespace but keeps line breaks, as unpdf's merged text does. */
const normalizeMergedText = (pages: string[]): string =>
  pages
    .join('\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n');

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

    // Page by page and chunk by chunk, so the read can stop at the budget
    // instead of building the whole document's text first.
    const pages: string[] = [];
    let total = 0;
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const reader = page.streamTextContent().getReader();
      let pageText = '';
      try {
        for (;;) {
          const { done, value } = (await reader.read()) as {
            done: boolean;
            value?: TextChunk;
          };
          if (done) break;
          for (const item of value?.items ?? []) {
            if (typeof item.str !== 'string') continue;
            const piece = item.str + (item.hasEOL ? '\n' : '');
            total += piece.length;
            if (total > MAX_RAW_PDF_TEXT_CHARS) {
              return { kind: 'too_much_text' };
            }
            pageText += piece;
          }
        }
      } finally {
        // pdf.js's stream refuses a cancel with no reason, and throws rather
        // than rejects, so the call is guarded as well as given one.
        try {
          await reader.cancel(new Error('PDF text budget reached'));
        } catch {
          // Nothing left to stop.
        }
        page.cleanup();
      }
      pages.push(pageText);
    }

    const text = normalizeMergedText(pages).trim();
    return text.length > MAX_PDF_TEXT_CHARS
      ? { kind: 'too_much_text' }
      : { kind: 'text', text };
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

  const imageMimeType = mimeType.trim().toLowerCase();
  if (!isPdf) {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(imageMimeType)) {
      return {
        success: false,
        category: 'unsupported_media',
        error: 'Send a PDF, or a JPEG, PNG or WebP photo of the report',
      };
    }
    if (base64Document.length > MAX_IMAGE_BASE64_CHARS) {
      return {
        success: false,
        category: 'image_too_large',
        error: 'This photo is too large to read',
      };
    }
    const header = await checkImageHeader(base64Document);
    if (header === 'too_many_pixels') {
      return {
        success: false,
        category: 'image_too_large',
        error: 'This photo has too many pixels to read. Use a smaller photo.',
      };
    }
    if (header === 'unreadable') {
      return {
        success: false,
        category: 'unsupported_media',
        error: 'This file could not be read as a photo',
      };
    }
  }

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
    if (read.kind === 'too_much_text') {
      return {
        success: false,
        category: 'document_too_large',
        error:
          'This PDF has more text than can be read at once. Send just the pages with results.',
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
    prompt = `${LAB_REPORT_PROMPT}\n\nLab report text:\n${text}`;
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
    ...(isPdf
      ? {}
      : { images: [{ base64: base64Document, mimeType: imageMimeType }] }),
    parseJson: true,
  });

  if (!result.ok) {
    // Only the category and provider are logged. The detail is built from the
    // provider's response, which can quote the request (the report is health
    // data) and is free text, so it never reaches the log. The caller still
    // gets it in the error, for the person who sent the report.
    log(
      result.category === 'refused' || result.category === 'no_content'
        ? 'warn'
        : 'error',
      `Lab report scan: ${provider.service_type} failed for user ${userId} (${result.category})`
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
