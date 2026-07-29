import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const mobileRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(mobileRoot, '..');
const sourceRoots = [path.join(mobileRoot, 'src')];
const sourceFiles = [path.join(mobileRoot, 'App.tsx')];
const webEnglishPath = path.join(
  repoRoot,
  'SparkyFitnessFrontend',
  'public',
  'locales',
  'en',
  'translation.json',
);
const webPolishPath = path.join(
  repoRoot,
  'SparkyFitnessFrontend',
  'public',
  'locales',
  'pl',
  'translation.json',
);
const mobilePolishPath = path.join(mobileRoot, 'src', 'localization', 'mobile.pl.json');
const mobilePolishOverridesPath = path.join(
  mobileRoot,
  'src',
  'localization',
  'mobile.pl.overrides.json',
);

const localizedAttributeNames = new Set([
  'accessibilityHint',
  'accessibilityLabel',
  'cancelText',
  'confirmText',
  'description',
  'emptyText',
  'headerBackTitle',
  'label',
  'message',
  'placeholder',
  'subtitle',
  'tabBarAccessibilityLabel',
  'tabBarLabel',
  'text1',
  'text2',
  'title',
]);

const localizedObjectPropertyNames = new Set([
  'accessibilityHint',
  'accessibilityLabel',
  'body',
  'cancelText',
  'confirmText',
  'description',
  'emptyText',
  'headerBackTitle',
  'label',
  'message',
  'placeholder',
  'subtitle',
  'tabBarAccessibilityLabel',
  'tabBarLabel',
  'text1',
  'text2',
  'title',
]);

function walkFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walkFiles(absolutePath);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      sourceFiles.push(absolutePath);
    }
  }
}

for (const sourceRoot of sourceRoots) {
  walkFiles(sourceRoot);
}

function normalizeText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function templateText(node) {
  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return normalizeText(node.text);
  }
  if (!ts.isTemplateExpression(node)) {
    return null;
  }

  let result = node.head.text;
  node.templateSpans.forEach((span, index) => {
    result += `{{value${index + 1}}}${span.literal.text}`;
  });
  return normalizeText(result);
}

function literalText(node) {
  if (ts.isStringLiteral(node)) {
    return normalizeText(node.text);
  }
  return templateText(node);
}

function propertyNameText(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text;
  }
  return null;
}

function isTextElement(node) {
  if (!ts.isJsxElement(node)) return false;
  const tagName = node.openingElement.tagName;
  return ts.isIdentifier(tagName) && tagName.text === 'Text';
}

const occurrences = new Map();

function record(value, filePath, node, kind) {
  const normalized = normalizeText(value);
  if (!normalized || !/[A-Za-z]/.test(normalized)) return;

  const sourceFile = node.getSourceFile();
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const location = {
    file: path.relative(mobileRoot, filePath).replaceAll('\\', '/'),
    line: position.line + 1,
    kind,
  };
  const current = occurrences.get(normalized) ?? [];
  current.push(location);
  occurrences.set(normalized, current);
}

function visitFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  function visit(node, insideText = false) {
    if (ts.isJsxElement(node)) {
      visit(node.openingElement, false);
      const childIsText = insideText || isTextElement(node);
      node.children.forEach((child) => visit(child, childIsText));
      visit(node.closingElement, false);
      return;
    }

    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      node.attributes.properties.forEach((attribute) => visit(attribute, false));
      return;
    }

    const nowInsideText = insideText;

    if (nowInsideText && ts.isJsxText(node)) {
      record(node.text, filePath, node, 'text');
    }

    if (
      nowInsideText &&
      (ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateExpression(node))
    ) {
      const value = literalText(node);
      if (value) record(value, filePath, node, 'text-expression');
    }

    if (ts.isJsxAttribute(node)) {
      const attributeName = node.name.getText(sourceFile);
      if (localizedAttributeNames.has(attributeName) && node.initializer) {
        if (ts.isStringLiteral(node.initializer)) {
          record(node.initializer.text, filePath, node.initializer, `prop:${attributeName}`);
        } else if (
          ts.isJsxExpression(node.initializer) &&
          node.initializer.expression
        ) {
          const value = literalText(node.initializer.expression);
          if (value) {
            record(value, filePath, node.initializer.expression, `prop:${attributeName}`);
          }
        }
      }
    }

    if (ts.isPropertyAssignment(node)) {
      const propertyName = propertyNameText(node.name);
      if (propertyName && localizedObjectPropertyNames.has(propertyName)) {
        const value = literalText(node.initializer);
        if (value) record(value, filePath, node.initializer, `property:${propertyName}`);
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(sourceFile) === 'Alert' &&
      node.expression.name.text === 'alert'
    ) {
      node.arguments.slice(0, 2).forEach((argument, index) => {
        const value = literalText(argument);
        if (value) record(value, filePath, argument, `alert:${index}`);
      });
      if (node.arguments[2]) {
        function visitAlertButtons(buttonNode) {
          if (
            ts.isPropertyAssignment(buttonNode) &&
            propertyNameText(buttonNode.name) === 'text'
          ) {
            const value = literalText(buttonNode.initializer);
            if (value) {
              record(value, filePath, buttonNode.initializer, 'alert:button');
            }
          }
          ts.forEachChild(buttonNode, visitAlertButtons);
        }
        visitAlertButtons(node.arguments[2]);
      }
    }

    ts.forEachChild(node, (child) => visit(child, nowInsideText));
  }

  visit(sourceFile);
}

for (const sourceFile of sourceFiles) {
  visitFile(sourceFile);
}

function flattenStrings(value, prefix = '', result = {}) {
  for (const [key, child] of Object.entries(value)) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') {
      result[nextPrefix] = child;
    } else if (child && typeof child === 'object') {
      flattenStrings(child, nextPrefix, result);
    }
  }
  return result;
}

const webEnglish = flattenStrings(JSON.parse(fs.readFileSync(webEnglishPath, 'utf8')));
const webPolish = flattenStrings(JSON.parse(fs.readFileSync(webPolishPath, 'utf8')));
const mobilePolish = fs.existsSync(mobilePolishPath)
  ? JSON.parse(fs.readFileSync(mobilePolishPath, 'utf8'))
  : {};
if (fs.existsSync(mobilePolishOverridesPath)) {
  Object.assign(
    mobilePolish,
    JSON.parse(fs.readFileSync(mobilePolishOverridesPath, 'utf8')),
  );
}

const webTranslationsByEnglish = new Map();
for (const [key, englishValue] of Object.entries(webEnglish)) {
  const polishValue = webPolish[key];
  if (!polishValue || polishValue === englishValue) continue;
  const candidates = webTranslationsByEnglish.get(englishValue) ?? new Set();
  candidates.add(polishValue);
  webTranslationsByEnglish.set(englishValue, candidates);
}

const inventory = [...occurrences.entries()]
  .map(([english, locations]) => {
    const webCandidates = [...(webTranslationsByEnglish.get(english) ?? [])];
    const mobileTranslation = mobilePolish[english];
    const safeWebTranslation =
      webCandidates.length === 1 ? webCandidates[0] : undefined;
    return {
      english,
      polish: mobileTranslation ?? safeWebTranslation ?? null,
      source: mobileTranslation
        ? 'mobile'
        : safeWebTranslation
          ? 'weblate'
          : webCandidates.length > 1
            ? 'ambiguous-weblate'
            : 'missing',
      locations,
    };
  })
  .sort((left, right) => left.english.localeCompare(right.english));

function placeholderNames(value) {
  return [...value.matchAll(/\{\{(value\d+)\}\}/g)]
    .map((match) => match[1])
    .sort();
}

const invalidPlaceholders = inventory.filter((entry) => {
  if (!entry.polish) return false;
  return (
    JSON.stringify(placeholderNames(entry.english)) !==
    JSON.stringify(placeholderNames(entry.polish))
  );
});
const missing = inventory.filter((entry) => !entry.polish);
const summary = {
  total: inventory.length,
  translated: inventory.length - missing.length,
  missing: missing.length,
  fromWeblate: inventory.filter((entry) => entry.source === 'weblate').length,
  fromMobile: inventory.filter((entry) => entry.source === 'mobile').length,
  ambiguousWeblate: inventory.filter((entry) => entry.source === 'ambiguous-weblate')
    .length,
  invalidPlaceholders: invalidPlaceholders.length,
};

const outputPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (outputPath) {
  fs.writeFileSync(outputPath, `${JSON.stringify({ summary, inventory }, null, 2)}\n`);
}
console.log(JSON.stringify({ ...summary, outputPath }, null, 2));

if (missing.length > 0 || invalidPlaceholders.length > 0) {
  process.exitCode = 1;
}
