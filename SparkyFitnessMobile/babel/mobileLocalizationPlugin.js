const path = require('node:path');

const mobileRoot = path.resolve(__dirname, '..');
const localizationRoot = path.join(mobileRoot, 'src', 'localization');
const localizedProperties = new Set([
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

function importPathFor(filename) {
  let relative = path
    .relative(path.dirname(filename), localizationRoot)
    .replaceAll('\\', '/');
  if (!relative.startsWith('.')) relative = `./${relative}`;
  return relative;
}

function propertyName(node) {
  if (node.computed) return null;
  if (node.key.type === 'Identifier' || node.key.type === 'StringLiteral') {
    return node.key.name ?? node.key.value;
  }
  return null;
}

module.exports = function mobileLocalizationPlugin({ types: t }) {
  function ensureLocalizer(state, name) {
    state.localizationImports ??= new Map();
    if (!state.localizationImports.has(name)) {
      state.localizationImports.set(name, state.programPath.scope.generateUidIdentifier(name));
    }
    return t.cloneNode(state.localizationImports.get(name));
  }

  function localizeExpression(node, state) {
    if (t.isStringLiteral(node)) {
      return t.callExpression(ensureLocalizer(state, 'localizeText'), [node]);
    }
    if (t.isTemplateLiteral(node)) {
      let template = node.quasis[0].value.cooked ?? node.quasis[0].value.raw;
      node.expressions.forEach((_expression, index) => {
        template += `{{value${index + 1}}}`;
        template +=
          node.quasis[index + 1].value.cooked ??
          node.quasis[index + 1].value.raw;
      });
      return t.callExpression(ensureLocalizer(state, 'localizeTemplate'), [
        t.stringLiteral(template.replace(/\s+/g, ' ').trim()),
        t.arrayExpression(node.expressions),
      ]);
    }
    return node;
  }

  function localizeAlertButtons(node, state) {
    if (t.isObjectProperty(node) && propertyName(node) === 'text') {
      node.value = localizeExpression(node.value, state);
    }
    const childKeys = t.VISITOR_KEYS[node.type] ?? [];
    for (const key of childKeys) {
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach((entry) => {
          if (entry) localizeAlertButtons(entry, state);
        });
      } else if (child) {
        localizeAlertButtons(child, state);
      }
    }
  }

  return {
    name: 'sparky-mobile-localization',
    visitor: {
      Program: {
        enter(programPath, state) {
          const filename = state.file.opts.filename;
          state.enabled =
            Boolean(filename) &&
            filename.startsWith(mobileRoot) &&
            !filename.includes(`${path.sep}node_modules${path.sep}`) &&
            !filename.startsWith(localizationRoot);
          state.programPath = programPath;
          state.localizedTextAliases = [];
          state.localizationImports = new Map();
        },
        exit(programPath, state) {
          if (!state.enabled) return;
          const specifiers = [];
          for (const alias of state.localizedTextAliases) {
            specifiers.push(
              t.importSpecifier(t.identifier(alias), t.identifier('LocalizedText')),
            );
          }
          for (const [imported, local] of state.localizationImports.entries()) {
            specifiers.push(t.importSpecifier(t.cloneNode(local), t.identifier(imported)));
          }
          if (specifiers.length > 0) {
            programPath.unshiftContainer(
              'body',
              t.importDeclaration(
                specifiers,
                t.stringLiteral(importPathFor(state.file.opts.filename)),
              ),
            );
          }
        },
      },
      ImportDeclaration(importPath, state) {
        if (!state.enabled || importPath.node.source.value !== 'react-native') return;
        const retained = [];
        for (const specifier of importPath.node.specifiers) {
          if (
            t.isImportSpecifier(specifier) &&
            t.isIdentifier(specifier.imported, { name: 'Text' })
          ) {
            state.localizedTextAliases.push(specifier.local.name);
          } else {
            retained.push(specifier);
          }
        }
        if (retained.length === 0) {
          importPath.remove();
        } else {
          importPath.node.specifiers = retained;
        }
      },
      JSXAttribute(attributePath, state) {
        if (!state.enabled || !t.isJSXIdentifier(attributePath.node.name)) return;
        if (!localizedProperties.has(attributePath.node.name.name)) return;
        const value = attributePath.node.value;
        if (t.isStringLiteral(value)) {
          attributePath.node.value = t.jsxExpressionContainer(
            localizeExpression(value, state),
          );
        } else if (
          t.isJSXExpressionContainer(value) &&
          (t.isStringLiteral(value.expression) || t.isTemplateLiteral(value.expression))
        ) {
          value.expression = localizeExpression(value.expression, state);
        }
      },
      ObjectProperty(propertyPath, state) {
        if (!state.enabled) return;
        const name = propertyName(propertyPath.node);
        if (!name || !localizedProperties.has(name)) return;
        propertyPath.node.value = localizeExpression(propertyPath.node.value, state);
      },
      CallExpression(callPath, state) {
        if (!state.enabled) return;
        const callee = callPath.node.callee;
        if (
          !t.isMemberExpression(callee) ||
          !t.isIdentifier(callee.object, { name: 'Alert' }) ||
          !t.isIdentifier(callee.property, { name: 'alert' })
        ) {
          return;
        }
        callPath.node.arguments.slice(0, 2).forEach((argument, index) => {
          callPath.node.arguments[index] = localizeExpression(argument, state);
        });
        if (callPath.node.arguments[2]) {
          localizeAlertButtons(callPath.node.arguments[2], state);
        }
      },
    },
  };
};
