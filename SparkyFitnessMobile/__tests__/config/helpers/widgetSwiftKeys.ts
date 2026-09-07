import fs from 'fs';
import path from 'path';

const WIDGET_ROOT = path.join(__dirname, '../../../targets/widget');

export type WidgetKeyUsage = { file: string; key: string };

export function widgetSwiftFiles(): string[] {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.name.endsWith('.swift')
        ? [path.relative(WIDGET_ROOT, full)]
        : [];
    });
  return walk(WIDGET_ROOT).sort();
}

export function readWidgetSwift(relativePath: string): string {
  return fs.readFileSync(path.join(WIDGET_ROOT, relativePath), 'utf8');
}

function usages(pattern: RegExp): WidgetKeyUsage[] {
  return widgetSwiftFiles().flatMap((file) => {
    const source = readWidgetSwift(file);
    return [...source.matchAll(new RegExp(pattern.source, 'g'))].map(
      (match) => ({
        file,
        key: match[1],
      })
    );
  });
}

/** Keys resolved at runtime through the helper, so they reach fallbackWidgetString. */
export function helperKeyUsages(): WidgetKeyUsage[] {
  return usages(/localizedWidgetString\(\s*"([^"]+)"\s*\)/);
}

/** Gallery metadata keys, resolved by SwiftUI's LocalizedStringKey rather than the helper. */
export function galleryKeyUsages(): WidgetKeyUsage[] {
  return usages(
    /(?:configurationDisplayName|\.description)\(\s*"([^"]+)"\s*\)/
  );
}

/** Null when the stable fallback map no longer exists. */
export function fallbackMapKeys(): Set<string> | null {
  for (const file of widgetSwiftFiles()) {
    const body = /func fallbackWidgetString[\s\S]*?\n\}/.exec(
      readWidgetSwift(file)
    );
    if (body) {
      return new Set(
        [...body[0].matchAll(/case\s+"([^"]+)"\s*:/g)].map((match) => match[1])
      );
    }
  }
  return null;
}
