const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const EXCLUDE_DIRS = new Set(['__tests__', '__mocks__', 'node_modules', 'coverage', 'android', 'ios', 'scripts', '.tooling']);
const CONTROLLED_DYNAMIC_I18N_RULES = new Set([
  'healthMetrics',
  'healthCategories',
]);

function isApprovedControlledDynamicKey(node) {
  if (!ts.isTemplateExpression(node)) return false;
  const head = node.head.text;
  const prefixMatch = head.match(/^([A-Za-z0-9_.-]+)\.$/);
  if (!prefixMatch || !CONTROLLED_DYNAMIC_I18N_RULES.has(prefixMatch[1])) return false;
  return node.templateSpans.length === 1;
}


const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

/** Blocking rule name for a source file that could not be scanned (fail-closed). */
const SOURCE_SCAN_ERROR_RULE = 'source-scan-error';

const CUSTOM_UI_ATTRIBUTE_NAMES = new Set(['errorMessage', 'successMessage', 'emptyMessage']);

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

function hasLetter(value) {
  return /\p{L}/u.test(value);
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

/**
 * Collect only presentation literals from an expression. This is deliberately
 * bounded: conditions and arbitrary operands are never traversed. The caller
 * must already have established a recognized user-facing presentation context.
 */
function collectLiteralTexts(node) {
  if (!node) return [];

  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) ||
      (typeof ts.isSatisfiesExpression === 'function' && ts.isSatisfiesExpression(node))) {
    return collectLiteralTexts(node.expression);
  }

  const direct = literalText(node);
  if (direct !== null) return [direct];

  if (ts.isConditionalExpression(node)) {
    return [...collectLiteralTexts(node.whenTrue), ...collectLiteralTexts(node.whenFalse)];
  }

  if (ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
       node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
       node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)) {
    const values = collectLiteralTexts(node.right);
    // For && the left operand is always a condition; only the RHS can be
    // rendered. || and ?? may render a presentation expression on either side.
    if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return values;

    // A nested presentation expression may itself be on the left. Do not
    // recurse into ordinary identifiers, comparisons, or other conditions.
    const left = node.left;
    if (ts.isConditionalExpression(left) || ts.isBinaryExpression(left) ||
        ts.isParenthesizedExpression(left) || ts.isAsExpression(left) || ts.isTypeAssertionExpression(left) ||
        (typeof ts.isSatisfiesExpression === 'function' && ts.isSatisfiesExpression(left))) {
      return [...collectLiteralTexts(left), ...values];
    }
    return values;
  }

  return [];
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

  const resolved = resolveStaticTranslationKeyArg(arg);
  return resolved !== null;
}

function isDynamicTranslationKey(node) {
  if (!ts.isCallExpression(node)) return false;
  const expression = node.expression;
  const isTCall = ts.isIdentifier(expression) && expression.text === 't';
  const isPropertyTCall = ts.isPropertyAccessExpression(expression) && expression.name.text === 't';
  if (!isTCall && !isPropertyTCall) return false;

  const arg = node.arguments[0];
  if (!arg) return false;
  if (resolveStaticTranslationKeyArg(arg) !== null) return false;
  if (isApprovedControlledDynamicKey(arg)) return false;

  return true;
}

/**
 * True when a static t(...) call carries a statically readable explicit English
 * fallback. Accepted forms:
 *
 *   t('key', 'Readable English')
 *   t('key', { defaultValue: 'Readable English' })
 *   t('key', { defaultValue: `Readable English` })
 *
 * A dynamic defaultValue (variable, expression, object shorthand) does NOT
 * satisfy the contract — the fallback must be readable by the audit so a
 * missing key can never leak a raw translation key into the UI.
 */
function staticLiteralText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function getExplicitFallbacks(node) {
  const args = node.arguments;
  if (args.length < 2) return {};

  const second = args[1];
  const positionalFallback = staticLiteralText(second);
  if (positionalFallback !== null) return { defaultValue: positionalFallback };
  if (!ts.isObjectLiteralExpression(second)) return {};

  const fallbacks = {};
  for (const prop of second.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const name = propertyNameText(prop.name);
    if (!name || (name !== 'defaultValue' && !/^defaultValue_(?:zero|one|two|few|many|other)$/.test(name))) continue;
    const value = staticLiteralText(prop.initializer);
    if (value !== null) fallbacks[name] = value;
  }
  return fallbacks;
}

function hasExplicitFallback(node) {
  return Object.hasOwn(getExplicitFallbacks(node), 'defaultValue');
}

function hasCountOption(node) {
  const second = node.arguments[1];
  if (!second || !ts.isObjectLiteralExpression(second)) return false;
  return second.properties.some((prop) =>
    (ts.isPropertyAssignment(prop) && propertyNameText(prop.name) === 'count') ||
    (ts.isShorthandPropertyAssignment(prop) && prop.name.text === 'count'),
  );
}

/**
 * Resolves the first argument of a `t(...)` call to a static string, or null
 * if it is dynamic. Handles:
 *  - StringLiteral
 *  - NoSubstitutionTemplateLiteral (t(`common.save`))
 *  - parenthesized expressions t(('common.save'))
 *  - `as const` / simple type assertions t(('common.save' as const))
 *  - `satisfies` if present in the running TypeScript
 * It never executes code and never resolves variables.
 */
function resolveStaticTranslationKeyArg(arg) {
  let node = arg;
  // Iteratively peel wrappers (parentheses, as-assertions, type assertions,
  // satisfies) so nested forms still resolve.
  let iterations = 0;
  while (iterations++ < 10) {
    if (ts.isParenthesizedExpression(node)) {
      node = node.expression;
      continue;
    }
    if (ts.isAsExpression(node)) {
      node = node.expression;
      continue;
    }
    if (ts.isTypeAssertionExpression(node)) {
      node = node.expression;
      continue;
    }
    if (typeof ts.isSatisfiesExpression === 'function' && ts.isSatisfiesExpression(node)) {
      node = node.expression;
      continue;
    }
    break;
  }

  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function isTextLikeElement(node) {
  if (!ts.isJsxElement(node)) return false;
  const tag = node.openingElement.tagName;
  if (!ts.isIdentifier(tag)) return false;
  return tag.text === 'Text' || tag.text === 'Button';
}

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

  if (!hasLetter(trimmed)) return true;

  // Template expressions whose only literal residue is punctuation/affordance
  // glyphs are not user-facing hard-coded language (for example a dynamic
  // calorie value followed by a dropdown marker). Strip the internal marker
  // before checking the user-facing residue.
  if (!hasLetter(trimmed.replace(/\{\{dynamic\}\}/g, ''))) return true;

  // Numeric/unit-only presentation fragments are language-neutral, not UI copy.
  if (/^[\s()\/·+\-]*?(?:\{\{dynamic\}\}\s*)+(?:g|kg|mg|mcg|kcal|kJ|ml|l)\s*$/.test(trimmed)) return true;

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
let suppressionRecords = [];
let suppressionIssues = new Map(); // key `${file}:${commentLine}:${index}` -> issue object
let alertButtonTextProps = new Set();
let toastTextProps = new Set();

const ALLOWED_SUPPRESSION_RULES = new Set([
  'hardcoded-ui-text',
  'dynamic-i18n-key',
  'missing-fallback',
]);

const SUPPRESSION_REGEX = /^\s*\/\/\s*i18n-audit-ignore-next-line\s+(\S+)(?:\s*--\s*(.+))?$/;

/**
 * Parses suppression directives. Returns an array of records:
 * { commentLine, targetLine, rule, reason }. Also records structural issues for
 * unknown rules and missing justifications. A directive is per-rule and applies
 * to at most the single closest matching finding on the next line.
 */
function parseSuppressions(source, relPath) {
  const lines = source.split('\n');
  const records = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(SUPPRESSION_REGEX);
    if (!match) continue;
    const rule = match[1];
    const reason = (match[2] || '').trim();
    const commentLine = i + 1;
    const targetLine = i + 2;

    if (!ALLOWED_SUPPRESSION_RULES.has(rule)) {
      suppressionIssues.set(`${relPath}:${commentLine}`, {
        rule: 'unknown-suppression-rule',
        file: relPath,
        line: commentLine,
        directiveRule: rule,
        message: `Unknown suppression rule "${rule}" at ${relPath}:${commentLine}`,
      });
      continue;
    }

    if (reason.length === 0) {
      suppressionIssues.set(`${relPath}:${commentLine}`, {
        rule: 'suppression-without-justification',
        file: relPath,
        line: commentLine,
        directiveRule: rule,
        message: `Suppression comment without justification at ${relPath}:${commentLine}`,
      });
      continue;
    }

    records.push({ commentLine, targetLine, rule, reason, consumed: false });
  }
  return records;
}

function recordFinding(relPath, line, value, kind, context) {
  const normalized = normalizeText(value);
  if (!normalized || !hasLetter(normalized)) return;

  if (kind === 'hardcoded-ui-text' || kind === 'dynamic-t-key' || kind === 'missing-fallback-key') {
    const rule = kind === 'hardcoded-ui-text' ? 'hardcoded-ui-text' : kind === 'dynamic-t-key' ? 'dynamic-i18n-key' : 'missing-fallback';
    // Consume the nearest unconsumed suppression record for this exact rule on
    // this exact line. At most one finding per directive is suppressed.
    const idx = suppressionRecords.findIndex(
      (r) => !r.consumed && r.rule === rule && r.targetLine === line,
    );
    if (idx !== -1) {
      suppressionRecords[idx].consumed = true;
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

  suppressionRecords = parseSuppressions(source, relPath);
  alertButtonTextProps = new Set();
  toastTextProps = new Set();

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      const isTCall = ts.isIdentifier(expression) && expression.text === 't';
      const isPropertyTCall = ts.isPropertyAccessExpression(expression) && expression.name.text === 't';
      if (isTCall || isPropertyTCall) {
        if (isStaticTranslationKey(node)) {
          const key = resolveStaticTranslationKeyArg(node.arguments[0]);
          const line = getLinePosition(node, sourceFile);
          if (key !== null) {
            const fallbacks = getExplicitFallbacks(node);
            const hasCount = hasCountOption(node);
            recordFinding(relPath, line, key, 'static-t-key', { key, fallbacks, hasCount });
            if (!hasExplicitFallback(node)) {
              recordFinding(relPath, line, key, 'missing-fallback-key', { key });
            }
          }
        } else if (isDynamicTranslationKey(node)) {
          const argText = node.arguments[0].getText(sourceFile);
          const line = getLinePosition(node, sourceFile);
          recordFinding(relPath, line, argText, 'dynamic-t-key', { expression: argText });
        }
      }
    }

    // Hardcoded <Text> children. `isTextLikeElement` already validates the
    // element node; a JSX child that is an expression has the inner expression
    // on `child.expression` (the child itself is the JsxExpression), so
    // <Text>{'…'}</Text> and <Text>{`…`}</Text> are inventoried too.
    if (isTextLikeElement(node)) {
      for (const child of node.children) {
        if (ts.isJsxText(child)) {
          const text = child.text;
          const trimmed = text.trim();
          if (trimmed && !isLikelyFalsePositive(trimmed)) {
            const childLine = getLinePosition(child, sourceFile);
            recordFinding(relPath, childLine, trimmed, 'hardcoded-ui-text', { element: 'Text', form: 'text' });
          }
        } else if (ts.isJsxExpression(child) && child.expression) {
          const values = collectLiteralTexts(child.expression);
          const childLine = getLinePosition(child, sourceFile);
          for (const value of values) {
            if (!isLikelyFalsePositive(value)) {
              recordFinding(relPath, childLine, value, 'hardcoded-ui-text', { element: 'Text', form: 'expression' });
            }
          }
        }
      }
    }

    if (ts.isJsxAttribute(node)) {
      const attrName = node.name.getText(sourceFile);
      if ((LOCALIZED_ATTRIBUTE_NAMES.has(attrName) || CUSTOM_UI_ATTRIBUTE_NAMES.has(attrName)) && node.initializer) {
        const line = getLinePosition(node, sourceFile);
        if (ts.isStringLiteral(node.initializer)) {
          const value = normalizeText(node.initializer.text);
          if (value && !isLikelyFalsePositive(value)) {
            recordFinding(relPath, line, value, 'hardcoded-ui-text', { attr: attrName });
          }
        } else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
          for (const value of collectLiteralTexts(node.initializer.expression)) {
            if (!isLikelyFalsePositive(value)) {
              recordFinding(relPath, line, value, 'hardcoded-ui-text', { attr: attrName, form: 'expression' });
            }
          }
        }
      }
    }

    if (ts.isPropertyAssignment(node)) {
      // Skip `text` props belonging to Alert.alert buttons and `text1`/`text2`
      // props belonging to Toast.show — those are reported by their specialized
      // handlers with their own contexts, so the generic scanner must not
      // double-count them.
      if (alertButtonTextProps.has(node) || toastTextProps.has(node)) {
        ts.forEachChild(node, visit);
        return;
      }
      const propName = propertyNameText(node.name);
      if (propName && LOCALIZED_ATTRIBUTE_NAMES.has(propName)) {
        const line = getLinePosition(node, sourceFile);
        for (const value of collectLiteralTexts(node.initializer)) {
          if (!isLikelyFalsePositive(value)) {
            recordFinding(relPath, line, value, 'hardcoded-ui-text', { prop: propName });
          }
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
        for (const value of collectLiteralTexts(args[i])) {
          if (!isLikelyFalsePositive(value)) {
            recordFinding(relPath, line, value, 'hardcoded-ui-text', { context: 'Alert.alert', argIndex: i });
          }
        }
      }
      const buttonsArg = node.arguments[2];
      if (buttonsArg) {
        function visitAlertButtons(buttonNode) {
          if (ts.isPropertyAssignment(buttonNode) && propertyNameText(buttonNode.name) === 'text') {
            alertButtonTextProps.add(buttonNode);
            for (const value of collectLiteralTexts(buttonNode.initializer)) {
              if (!isLikelyFalsePositive(value)) {
                recordFinding(relPath, getLinePosition(buttonNode, sourceFile), value, 'hardcoded-ui-text', { context: 'Alert.alert:button' });
              }
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
                toastTextProps.add(prop);
                for (const value of collectLiteralTexts(prop.initializer)) {
                  if (!isLikelyFalsePositive(value)) {
                    recordFinding(relPath, line, value, 'hardcoded-ui-text', { context: 'Toast.show', prop: propName });
                  }
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
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
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

/**
 * Scans the source roots and returns:
 *   findings: hardcoded/t() inventory findings (informational + t() contract)
 *   errors:   blocking scan errors. A file that cannot be read/parsed is
 *             recorded here so the audit FAILS CLOSED instead of silently
 *             passing with incomplete coverage.
 */
function collectFindings(rootDir, sourceRoots) {
  findings.length = 0;
  suppressionIssues.clear();
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

  const scanErrors = [];
  for (const filePath of sourceFilesSet) {
    try {
      visitSourceFile(filePath, rootDir);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      scanErrors.push({
        rule: SOURCE_SCAN_ERROR_RULE,
        file: getFileRelativePath(filePath, rootDir),
        message: `Failed to scan source file: ${message}`,
      });
    }
  }

  return {
    findings: findings.map((f) => ({ ...f })),
    errors: scanErrors,
  };
}

function getAllSuppressionIssues() {
  return [...suppressionIssues.values()];
}

module.exports = {
  collectFindings,
  walkFiles,
  visitSourceFile,
  normalizeText,
  literalText,
  collectLiteralTexts,
  isLikelyFalsePositive,
  LOCALIZED_ATTRIBUTE_NAMES,
  CUSTOM_UI_ATTRIBUTE_NAMES,
  EXCLUDE_DIRS,
  SOURCE_EXTENSIONS,
  getAllSuppressionIssues,
  resolveStaticTranslationKeyArg,
  hasExplicitFallback,
  getExplicitFallbacks,
  hasCountOption,
  isLikelyRoute,
  isLikelyCss,
  isLikelyTechnical,
  SOURCE_SCAN_ERROR_RULE,
};
