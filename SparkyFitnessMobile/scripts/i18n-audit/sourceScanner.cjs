const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const EXCLUDE_DIRS = new Set(['__tests__', '__mocks__', 'node_modules', 'coverage', 'android', 'ios', 'scripts', '.tooling']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

const LOCALIZED_ATTRIBUTE_NAMES = new Set([
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
  'body',
  'text',
]);

function normalizeText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function literalText(node) {
  if (ts.isStringLiteral(node)) {
    return normalizeText(node.text);
  }
  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return normalizeText(node.text);
  }
  if (ts.isTemplateExpression(node)) {
    let result = node.head.text;
    node.templateSpans.forEach((span) => {
      result += '{{dynamic}}';
      result += span.literal.text;
    });
    return normalizeText(result);
  }
  return null;
}

function propertyNameText(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text;
  }
  return null;
}

function isStaticTranslationKey(node) {
  if (!ts.isCallExpression(node)) return false;
  const expression = node.expression;
  const isTCall = ts.isIdentifier(expression) && expression.text === 't';
  const isPropertyTCall = ts.isPropertyAccessExpression(expression) && expression.name.text === 't';
  if (!isTCall && !isPropertyTCall) return false;

  const arg = node.arguments[0];
  if (!arg) return false;

  return ts.isStringLiteral(arg);
}

function isDynamicTranslationKey(node) {
  if (!ts.isCallExpression(node)) return false;
  const expression = node.expression;
  const isTCall = ts.isIdentifier(expression) && expression.text === 't';
  const isPropertyTCall = ts.isPropertyAccessExpression(expression) && expression.name.text === 't';
  if (!isTCall && !isPropertyTCall) return false;

  const arg = node.arguments[0];
  if (!arg) return false;
  if (ts.isStringLiteral(arg)) return false;

  return true;
}

function isTextLikeElement(node) {
  if (!ts.isJsxElement(node)) return false;
  const tag = node.openingElement.tagName;
  if (ts.isIdentifier(tag) && tag.text === 'Text') return true;

  return false;
}

const KNOWN_ICONS = new Set([
  'chevron-back', 'close', 'star', 'settings', 'home', 'menu', 'arrow', 'check',
  'xmark', 'search',
]);

function isLikelyRoute(value) {
  const routePattern = /^[a-z]+(?:\/[a-z0-9-]+)+$/;
  return routePattern.test(value);
}

function isLikelyCss(value) {
  const cssPatterns = [
    /^flex-row/, /^flex-col/, /^items-/, /^justify-/, /^bg-/, /^text-/,
    /^border-/, /^p-/, /^m-/, /^gap-/, /^w-/, /^h-/, /^rounded/,
    /^shadow/, /^absolute/, /^relative/, /^z-/, /^overflow-/,
  ];
  return cssPatterns.some((p) => p.test(value));
}

function isLikelyTechnical(value) {
  const technicalPattern = /^[A-Z_][A-Z0-9_]+$/;
  if (technicalPattern.test(value) && !/[a-z]/.test(value.slice(1))) return true;
  return false;
}

function isLikelyFalsePositive(value) {
  const trimmed = value.trim();

  if (!/[A-Za-z]/.test(trimmed)) return true;

  if (isLikelyRoute(trimmed)) return true;

  if (isLikelyCss(trimmed)) return true;

  if (isLikelyTechnical(trimmed)) return true;

  if (/^https?:\/\//i.test(trimmed)) return true;

  if (trimmed.length <= 1) return true;

  if (/^[A-Z][A-Za-z]+$/.test(trimmed) && /[A-Z]/.test(trimmed.slice(1))) return true;

  const classNamePattern = /^(className|styleName|tailwind|testID|test-id)$/i;
  if (classNamePattern.test(trimmed)) return true;

  return false;
}

function getLinePosition(node, sourceFile) {
  const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return pos.line + 1;
}

function getFileRelativePath(filePath, rootDir) {
  return path.relative(rootDir, filePath).replaceAll('\\', '/');
}

const findings = [];
let currentFile = '';
let currentLine = 0;
let suppressionLines = new Set();
let suppressionWithoutJustification = new Set();
let allSuppressionWithoutJustification = new Set();

const SUPPRESSION_REGEX = /^\s*\/\/\s*i18n-audit-ignore-next-line\s+(hardcoded-ui-text)(?:\s*--\s*(.+))?$/;

function parseSuppressions(source) {
  const lines = source.split('\n');
  const suppressed = new Set();
  const withoutJustification = new Set();
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(SUPPRESSION_REGEX);
    if (match) {
      const justification = match[2];
      const nextLine = i + 2;
      if (!justification || justification.trim().length === 0) {
        withoutJustification.add(nextLine);
        suppressed.add(nextLine);
      } else {
        suppressed.add(nextLine);
      }
    }
  }
  return { suppressed, withoutJustification };
}

function recordFinding(relPath, line, value, kind, context) {
  const normalized = normalizeText(value);
  if (!normalized || !/[A-Za-z]/.test(normalized)) return;

  if (kind === 'hardcoded-ui-text') {
    if (suppressionLines.has(line)) {
      return;
    }
  }

  findings.push({
    file: relPath,
    line: line,
    kind,
    value: normalized,
    context: context || {},
  });
}

function visitSourceFile(filePath, rootDir) {
  const source = fs.readFileSync(filePath, 'utf8');
  const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX :
    filePath.endsWith('.jsx') ? ts.ScriptKind.JSX :
    filePath.endsWith('.ts') ? ts.ScriptKind.TS :
    ts.ScriptKind.JS;

  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );

  const relPath = getFileRelativePath(filePath, rootDir);

  const { suppressed, withoutJustification } = parseSuppressions(source);
  suppressionLines = suppressed;
  suppressionWithoutJustification = withoutJustification;
  for (const line of withoutJustification) {
    allSuppressionWithoutJustification.add(`${relPath}:${line}`);
  }

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      const isTCall = ts.isIdentifier(expression) && expression.text === 't';
      const isPropertyTCall = ts.isPropertyAccessExpression(expression) && expression.name.text === 't';
      if (isTCall || isPropertyTCall) {
        if (isStaticTranslationKey(node)) {
          const key = node.arguments[0].text;
          const line = getLinePosition(node, sourceFile);
          recordFinding(relPath, line, key, 'static-t-key', { key });
        } else if (isDynamicTranslationKey(node)) {
          const argText = node.arguments[0].getText(sourceFile);
          const line = getLinePosition(node, sourceFile);
          recordFinding(relPath, line, argText, 'dynamic-t-key', { expression: argText });
        }
      }
    }

    if (ts.isJsxElement && isTextLikeElement(node)) {
      const line = getLinePosition(node, sourceFile);
      for (const child of node.children) {
        if (ts.isJsxText(child)) {
          const text = child.text;
          const trimmed = text.trim();
          if (trimmed && !isLikelyFalsePositive(trimmed)) {
            const childLine = getLinePosition(child, sourceFile);
            recordFinding(relPath, childLine, trimmed, 'hardcoded-ui-text', { element: 'Text', form: 'text' });
          }
        } else if (
          child.expression &&
          ts.isJsxExpression(child.expression) &&
          child.expression.expression
        ) {
          const value = literalText(child.expression.expression);
          if (value !== null && value !== undefined && !isLikelyFalsePositive(value)) {
            const childLine = getLinePosition(child, sourceFile);
            recordFinding(relPath, childLine, value, 'hardcoded-ui-text', { element: 'Text', form: 'expression' });
          }
        }
      }
    }

    if (ts.isJsxAttribute(node)) {
      const attrName = node.name.getText(sourceFile);
      if (LOCALIZED_ATTRIBUTE_NAMES.has(attrName) && node.initializer) {
        const line = getLinePosition(node, sourceFile);
        if (ts.isStringLiteral(node.initializer)) {
          const value = normalizeText(node.initializer.text);
          if (value && !isLikelyFalsePositive(value)) {
            recordFinding(relPath, line, value, 'hardcoded-ui-text', { attr: attrName });
          }
        } else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
          const value = literalText(node.initializer.expression);
          if (value !== null && value !== undefined && !isLikelyFalsePositive(value)) {
            recordFinding(relPath, line, value, 'hardcoded-ui-text', { attr: attrName, form: 'expression' });
          }
        }
      }
    }

    if (ts.isPropertyAssignment(node)) {
      const propName = propertyNameText(node.name);
      if (propName && LOCALIZED_ATTRIBUTE_NAMES.has(propName)) {
        const line = getLinePosition(node, sourceFile);
        const value = literalText(node.initializer);
        if (value !== null && value !== undefined && !isLikelyFalsePositive(value)) {
          recordFinding(relPath, line, value, 'hardcoded-ui-text', { prop: propName });
        }
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(sourceFile) === 'Alert' &&
      node.expression.name.text === 'alert'
    ) {
      const line = getLinePosition(node, sourceFile);
      const titleArg = node.arguments[0];
      const messageArg = node.arguments[1];
      const args = [titleArg, messageArg].filter((a) => a !== undefined);
      for (let i = 0; i < args.length; i++) {
        const value = literalText(args[i]);
        if (value !== null && value !== undefined && !isLikelyFalsePositive(value)) {
          recordFinding(relPath, line, value, 'hardcoded-ui-text', { context: 'Alert.alert', argIndex: i });
        }
      }
      const buttonsArg = node.arguments[2];
      if (buttonsArg) {
        function visitAlertButtons(buttonNode) {
          if (ts.isPropertyAssignment(buttonNode) && propertyNameText(buttonNode.name) === 'text') {
            const value = literalText(buttonNode.initializer);
            if (value !== null && value !== undefined && !isLikelyFalsePositive(value)) {
              recordFinding(relPath, getLinePosition(buttonNode, sourceFile), value, 'hardcoded-ui-text', { context: 'Alert.alert:button' });
            }
          }
          ts.forEachChild(buttonNode, visitAlertButtons);
        }
        visitAlertButtons(buttonsArg);
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'show' &&
      node.expression.expression.getText(sourceFile) === 'Toast'
    ) {
      const line = getLinePosition(node, sourceFile);
      for (const arg of node.arguments) {
        if (ts.isObjectLiteralExpression(arg)) {
          for (const prop of arg.properties) {
            if (ts.isPropertyAssignment(prop)) {
              const propName = propertyNameText(prop.name);
              if (propName === 'text1' || propName === 'text2') {
                const value = literalText(prop.initializer);
                if (value !== null && value !== undefined && !isLikelyFalsePositive(value)) {
                  recordFinding(relPath, line, value, 'hardcoded-ui-text', { context: 'Toast.show', prop: propName });
                }
              }
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

function walkFiles(directory, rootDir, sourceFilesSet) {
  for (const entry of fs.readdirSync(directory, { withFileExtensions: true, withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      walkFiles(absolutePath, rootDir, sourceFilesSet);
    } else {
      const ext = path.extname(entry.name);
      if (SOURCE_EXTENSIONS.has(ext)) {
        sourceFilesSet.add(absolutePath);
      }
    }
  }
}

function collectFindings(rootDir, sourceRoots) {
  findings.length = 0;
  allSuppressionWithoutJustification.clear();
  const sourceFilesSet = new Set();
  for (const sourceRoot of sourceRoots) {
    walkFiles(sourceRoot, rootDir, sourceFilesSet);
  }

  const extraEntryFiles = [
    path.join(rootDir, 'App.tsx'),
    path.join(rootDir, 'index.js'),
  ];

  for (const file of extraEntryFiles) {
    if (fs.existsSync(file)) {
      sourceFilesSet.add(file);
    }
  }

  for (const filePath of sourceFilesSet) {
    try {
      visitSourceFile(filePath, rootDir);
    } catch (err) {
      console.warn(`Warning: failed to scan ${filePath}: ${err.message}`);
    }
  }

  return findings.map((f) => ({ ...f }));
}

function getSuppressionWithoutJustificationFindings() {
  return [...allSuppressionWithoutJustification];
}

function buildFingerprint(finding) {
  if (finding.kind === 'static-t-key' || finding.kind === 'dynamic-t-key') {
    return `${finding.kind}:${finding.file}:${finding.value}`;
  }

  return `hardcoded-ui-text:${finding.file}:${finding.line}:${finding.value}`;
}

function buildMigrationFingerprint(finding) {
  return `${finding.kind}:${finding.file}:${finding.value}`;
}

module.exports = {
  collectFindings,
  walkFiles,
  visitSourceFile,
  normalizeText,
  literalText,
  isLikelyFalsePositive,
  LOCALIZED_ATTRIBUTE_NAMES,
  EXCLUDE_DIRS,
  SOURCE_EXTENSIONS,
  buildFingerprint,
  buildMigrationFingerprint,
  getSuppressionWithoutJustificationFindings,
  KNOWN_ICONS,
  isLikelyRoute,
  isLikelyCss,
  isLikelyTechnical,
};
