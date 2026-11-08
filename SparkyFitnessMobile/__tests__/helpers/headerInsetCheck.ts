import * as ts from 'typescript';

/**
 * Static check that a screen keeps its useScreenHeader bar below the Android
 * status bar.
 *
 * On the custom-header path (Android always, iOS 26+ with Liquid Glass off)
 * the hook returns a bar the screen draws itself, and the app runs edge to
 * edge, so every place the screen renders that bar has to sit inside an
 * element whose style pads the top with `insets.top`, or inside a layout that
 * does. The check evaluates each render site as it runs on Android, where
 * `useNativeIOSHeadersActive()` is false and `Platform.OS` is 'android':
 * branches that cannot run there are skipped, and a site counts as padded only
 * when an ancestor's `paddingTop` is `insets.top` for certain. It reads style
 * values through constants (resolved lexically), arrays and objects in order
 * (a later `paddingTop` wins), conditionals and `&&`; a style it cannot see
 * into (a prop, `styles.x`) counts as not padding.
 *
 * Whether iOS needs the inset too depends on how the route is presented
 * (a modal sheet already starts below the status bar), which is not visible
 * from the screen file, so iOS is not checked here.
 */

/** Layouts that render the bar they are given below the status bar, and their files. */
export const STATUS_BAR_INSET_LAYOUTS = {
  FormScreenChrome: 'src/components/FormScreenChrome.tsx',
  ReportScreenLayout: 'src/components/reports/ReportScreenLayout.tsx',
} as const;
const STATUS_BAR_INSET_LAYOUT_TAGS: ReadonlySet<string> = new Set(
  Object.keys(STATUS_BAR_INSET_LAYOUTS)
);

interface HeaderInsetProblem {
  /** The line of the render site, or null for a problem with the whole file. */
  line: number | null;
  message: string;
}

export interface HeaderInsetReport {
  /** Places in the file that render the bar. */
  renders: number;
  problems: HeaderInsetProblem[];
}

interface HeaderInsetOptions {
  /**
   * Props that carry a bar into a layout component (ReportScreenLayout gets
   * the screen's bar as `header`). Bars from useScreenHeader are found on
   * their own.
   */
  headerPropNames?: readonly string[];
}

/** The two runtimes the check evaluates a site in. */
interface World {
  /** What useNativeIOSHeadersActive() returns. */
  native: boolean;
  /** What Platform.OS is. */
  os: 'android' | 'ios';
}

const ANDROID: World = { native: false, os: 'android' };
/** Only used to word a problem: padding that lands on the native path. */
const IOS_NATIVE: World = { native: true, os: 'ios' };

/**
 * The values a style's `paddingTop` can end up with: `inset` (insets.top),
 * `other` (any other value), `unset` (not set by this style).
 */
type PaddingOutcome = 'inset' | 'other' | 'unset';
type Outcomes = ReadonlySet<PaddingOutcome>;

/** Where a render site ends up in one world. */
type SiteResult = 'padded' | 'unpadded' | 'uncertain' | 'unreachable';

const UNSET: Outcomes = new Set(['unset']);

function union(...sets: Outcomes[]): Outcomes {
  return new Set(sets.flatMap((set) => [...set]));
}

/** A later style entry wins over the ones before it where it sets a value. */
function override(before: Outcomes, after: Outcomes): Outcomes {
  const result = new Set<PaddingOutcome>();
  for (const outcome of after) {
    if (outcome === 'unset') before.forEach((value) => result.add(value));
    else result.add(outcome);
  }
  return result;
}

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function createChecker(
  fileName: string,
  sourceText: string
): { sourceFile: ts.SourceFile; checker: ts.TypeChecker } {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const host: ts.CompilerHost = {
    getSourceFile: (name) => (name === fileName ? sourceFile : undefined),
    getDefaultLibFileName: () => 'lib.d.ts',
    writeFile: () => undefined,
    getCurrentDirectory: () => '/',
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: (name) => name === fileName,
    readFile: (name) => (name === fileName ? sourceText : undefined),
  };
  const program = ts.createProgram({
    rootNames: [fileName],
    options: {
      noLib: true,
      noResolve: true,
      types: [],
      jsx: ts.JsxEmit.Preserve,
    },
    host,
  });
  return { sourceFile, checker: program.getTypeChecker() };
}

class HeaderInsetAnalysis {
  private readonly propNames: ReadonlySet<string>;

  constructor(
    private readonly sourceFile: ts.SourceFile,
    private readonly checker: ts.TypeChecker,
    headerPropNames: readonly string[]
  ) {
    this.propNames = new Set(headerPropNames);
  }

  private declarationOf(identifier: ts.Identifier): ts.Declaration | undefined {
    const symbol = this.checker.getSymbolAtLocation(identifier);
    return symbol?.valueDeclaration ?? symbol?.declarations?.[0];
  }

  /** The initializer of the `const` an identifier refers to, if any. */
  private valueOf(identifier: ts.Identifier): ts.Expression | undefined {
    const declaration = this.declarationOf(identifier);
    return declaration &&
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer
      ? declaration.initializer
      : undefined;
  }

  private static calls(
    expression: ts.Expression | undefined,
    hook: string
  ): boolean {
    if (!expression) return false;
    const value = unwrap(expression);
    return (
      ts.isCallExpression(value) &&
      ts.isIdentifier(value.expression) &&
      value.expression.text === hook
    );
  }

  /** The declaration a header identifier refers to, or undefined if it is not a header. */
  private headerDeclaration(
    identifier: ts.Identifier
  ): ts.Declaration | undefined {
    const declaration = this.declarationOf(identifier);
    if (!declaration) return undefined;
    if (
      ts.isVariableDeclaration(declaration) &&
      declaration.name !== identifier &&
      HeaderInsetAnalysis.calls(declaration.initializer, 'useScreenHeader')
    ) {
      return declaration;
    }
    if (
      this.propNames.has(identifier.text) &&
      (ts.isBindingElement(declaration) || ts.isParameter(declaration)) &&
      declaration.name !== identifier
    ) {
      return declaration;
    }
    return undefined;
  }

  /** The value a condition has in a world: true, false or null when it cannot be told. */
  private truth(
    expression: ts.Expression,
    world: World,
    followed: Set<ts.Node> = new Set()
  ): boolean | null {
    const value = unwrap(expression);
    if (value.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (value.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (
      ts.isPrefixUnaryExpression(value) &&
      value.operator === ts.SyntaxKind.ExclamationToken
    ) {
      const inner = this.truth(value.operand, world, followed);
      return inner === null ? null : !inner;
    }
    if (ts.isIdentifier(value)) {
      const initializer = this.valueOf(value);
      if (!initializer || followed.has(initializer)) return null;
      if (HeaderInsetAnalysis.calls(initializer, 'useNativeIOSHeadersActive')) {
        return world.native;
      }
      followed.add(initializer);
      return this.truth(initializer, world, followed);
    }
    if (ts.isBinaryExpression(value)) {
      const operator = value.operatorToken.kind;
      if (operator === ts.SyntaxKind.AmpersandAmpersandToken) {
        const left = this.truth(value.left, world, followed);
        const right = this.truth(value.right, world, followed);
        if (left === false || right === false) return false;
        return left === true && right === true ? true : null;
      }
      if (operator === ts.SyntaxKind.BarBarToken) {
        const left = this.truth(value.left, world, followed);
        const right = this.truth(value.right, world, followed);
        if (left === true || right === true) return true;
        return left === false && right === false ? false : null;
      }
      const equality =
        operator === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        operator === ts.SyntaxKind.EqualsEqualsToken;
      const inequality =
        operator === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
        operator === ts.SyntaxKind.ExclamationEqualsToken;
      if (equality || inequality) {
        const sides = [value.left, value.right].map((side) =>
          unwrap(side).getText().replace(/\s+/g, '')
        );
        const literal = sides.find((side) =>
          /^['"](ios|android)['"]$/.test(side)
        );
        if (sides.includes('Platform.OS') && literal) {
          const same = literal.slice(1, -1) === world.os;
          return equality ? same : !same;
        }
      }
    }
    return null;
  }

  /** What `paddingTop` a style expression gives in a world. */
  private styleOutcomes(
    expression: ts.Expression,
    world: World,
    followed: Set<ts.Node> = new Set()
  ): Outcomes {
    const value = unwrap(expression);
    if (ts.isIdentifier(value)) {
      const initializer = this.valueOf(value);
      if (!initializer || followed.has(initializer)) return UNSET;
      followed.add(initializer);
      return this.styleOutcomes(initializer, world, followed);
    }
    if (ts.isConditionalExpression(value)) {
      const taken = this.truth(value.condition, world);
      if (taken === true)
        return this.styleOutcomes(value.whenTrue, world, followed);
      if (taken === false) {
        return this.styleOutcomes(value.whenFalse, world, followed);
      }
      return union(
        this.styleOutcomes(value.whenTrue, world, followed),
        this.styleOutcomes(value.whenFalse, world, followed)
      );
    }
    if (ts.isBinaryExpression(value)) {
      const operator = value.operatorToken.kind;
      if (operator === ts.SyntaxKind.AmpersandAmpersandToken) {
        const taken = this.truth(value.left, world);
        if (taken === false) return UNSET;
        const right = this.styleOutcomes(value.right, world, followed);
        return taken === true ? right : union(UNSET, right);
      }
      if (
        operator === ts.SyntaxKind.BarBarToken ||
        operator === ts.SyntaxKind.QuestionQuestionToken
      ) {
        return union(
          this.styleOutcomes(value.left, world, followed),
          this.styleOutcomes(value.right, world, followed)
        );
      }
      return UNSET;
    }
    if (ts.isArrayLiteralExpression(value)) {
      return value.elements.reduce<Outcomes>(
        (outcomes, element) =>
          override(
            outcomes,
            ts.isSpreadElement(element)
              ? this.styleOutcomes(element.expression, world, followed)
              : this.styleOutcomes(element, world, followed)
          ),
        UNSET
      );
    }
    if (ts.isObjectLiteralExpression(value)) {
      let outcomes: Outcomes = UNSET;
      for (const property of value.properties) {
        if (ts.isSpreadAssignment(property)) {
          outcomes = override(
            outcomes,
            this.styleOutcomes(property.expression, world, followed)
          );
        } else if (
          ts.isPropertyAssignment(property) &&
          property.name.getText() === 'paddingTop'
        ) {
          outcomes = override(
            outcomes,
            this.paddingValueOutcomes(property.initializer, world)
          );
        } else if (
          ts.isShorthandPropertyAssignment(property) &&
          property.name.text === 'paddingTop'
        ) {
          outcomes = override(
            outcomes,
            this.paddingValueOutcomes(property.name, world)
          );
        }
      }
      return outcomes;
    }
    // A style the check cannot see into (a prop, styles.x, a call).
    return UNSET;
  }

  /** What a `paddingTop` value is in a world. */
  private paddingValueOutcomes(
    expression: ts.Expression,
    world: World,
    followed: Set<ts.Node> = new Set()
  ): Outcomes {
    const value = unwrap(expression);
    if (ts.isConditionalExpression(value)) {
      const taken = this.truth(value.condition, world);
      if (taken === true) {
        return this.paddingValueOutcomes(value.whenTrue, world, followed);
      }
      if (taken === false) {
        return this.paddingValueOutcomes(value.whenFalse, world, followed);
      }
      return union(
        this.paddingValueOutcomes(value.whenTrue, world, followed),
        this.paddingValueOutcomes(value.whenFalse, world, followed)
      );
    }
    if (ts.isIdentifier(value)) {
      if (value.text === 'undefined') return UNSET;
      const initializer = this.valueOf(value);
      if (initializer && !followed.has(initializer)) {
        followed.add(initializer);
        return this.paddingValueOutcomes(initializer, world, followed);
      }
      return new Set(['other']);
    }
    let usesInset = false;
    const visit = (node: ts.Node): void => {
      if (
        ts.isPropertyAccessExpression(node) &&
        node.getText().replace(/\s+/g, '') === 'insets.top'
      ) {
        usesInset = true;
      }
      ts.forEachChild(node, visit);
    };
    visit(value);
    return new Set([usesInset ? 'inset' : 'other']);
  }

  /** Whether a statement always ends in a return. */
  private static returns(statement: ts.Statement): boolean {
    if (ts.isReturnStatement(statement)) return true;
    if (ts.isBlock(statement)) {
      const last = statement.statements[statement.statements.length - 1];
      return last !== undefined && HeaderInsetAnalysis.returns(last);
    }
    return false;
  }

  /** True when an earlier `if (...) return` in the same block has already returned in this world. */
  private returnedEarlier(statement: ts.Node, world: World): boolean {
    const parent = statement.parent;
    if (!parent || !(ts.isBlock(parent) || ts.isSourceFile(parent))) {
      return false;
    }
    for (const sibling of parent.statements) {
      if (sibling === statement) return false;
      if (
        ts.isIfStatement(sibling) &&
        !sibling.elseStatement &&
        HeaderInsetAnalysis.returns(sibling.thenStatement) &&
        this.truth(sibling.expression, world) === true
      ) {
        return true;
      }
    }
    return false;
  }

  /** How the JSX element `node` pads the top, or null when it does not touch it. */
  private elementPadding(
    node: ts.JsxElement | ts.JsxSelfClosingElement,
    world: World
  ): Outcomes | null {
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    if (STATUS_BAR_INSET_LAYOUT_TAGS.has(opening.tagName.getText())) {
      return new Set(['inset']);
    }
    const style = opening.attributes.properties.find(
      (attribute): attribute is ts.JsxAttribute =>
        ts.isJsxAttribute(attribute) && attribute.name.getText() === 'style'
    );
    const expression =
      style?.initializer && ts.isJsxExpression(style.initializer)
        ? style.initializer.expression
        : undefined;
    if (!expression) return null;
    const outcomes = this.styleOutcomes(expression, world);
    return outcomes.has('inset') ? outcomes : null;
  }

  /**
   * Where `node` (a rendered bar, or a value or helper holding one) ends up in
   * a world. `owner` is the function that declares the bar: walking stops
   * there. Values and render helpers declared inside it are followed to every
   * place they are used.
   */
  siteResult(
    node: ts.Node,
    owner: ts.Node,
    world: World,
    followed: Set<ts.Node> = new Set()
  ): SiteResult {
    let uncertain = false;
    for (
      let child: ts.Node = node, parent = node.parent;
      parent;
      child = parent, parent = parent.parent
    ) {
      if (ts.isConditionalExpression(parent) && child !== parent.condition) {
        const taken = this.truth(parent.condition, world);
        if (taken !== null && taken !== (child === parent.whenTrue)) {
          return 'unreachable';
        }
      }
      if (
        ts.isBinaryExpression(parent) &&
        parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
        child === parent.right &&
        this.truth(parent.left, world) === false
      ) {
        return 'unreachable';
      }
      if (ts.isIfStatement(parent) && child !== parent.expression) {
        const taken = this.truth(parent.expression, world);
        if (taken !== null && taken !== (child === parent.thenStatement)) {
          return 'unreachable';
        }
      }
      if (ts.isStatement(child) && this.returnedEarlier(child, world)) {
        return 'unreachable';
      }
      if (ts.isJsxElement(parent) || ts.isJsxSelfClosingElement(parent)) {
        const padding = this.elementPadding(parent, world);
        if (padding) {
          if (padding.size === 1) return 'padded';
          uncertain = true;
        }
      }
      // A JSX value or render helper kept in a const: judge every use of it.
      const holder =
        ts.isVariableDeclaration(parent) &&
        child === parent.initializer &&
        ts.isIdentifier(parent.name)
          ? parent.name
          : ts.isFunctionDeclaration(parent) && parent.name
            ? parent.name
            : undefined;
      if (holder && parent !== owner) {
        return this.usesResult(holder, owner, world, followed, uncertain);
      }
      if (parent === owner) break;
      // An inline callback in JSX (renderItem, a render prop) renders where it
      // is passed, so keep walking out of it.
    }
    return uncertain ? 'uncertain' : 'unpadded';
  }

  private usesResult(
    holder: ts.Identifier,
    owner: ts.Node,
    world: World,
    followed: Set<ts.Node>,
    uncertainSoFar: boolean
  ): SiteResult {
    if (followed.has(holder)) return 'unreachable';
    followed.add(holder);
    const symbol = this.checker.getSymbolAtLocation(holder);
    const results: SiteResult[] = [];
    const visit = (candidate: ts.Node): void => {
      if (
        ts.isIdentifier(candidate) &&
        candidate !== holder &&
        candidate.text === holder.text &&
        this.checker.getSymbolAtLocation(candidate) === symbol
      ) {
        results.push(this.siteResult(candidate, owner, world, followed));
      }
      ts.forEachChild(candidate, visit);
    };
    visit(owner);
    const reachable = results.filter((result) => result !== 'unreachable');
    if (reachable.length === 0) return 'unreachable';
    if (reachable.includes('unpadded')) return 'unpadded';
    if (uncertainSoFar || reachable.includes('uncertain')) return 'uncertain';
    return 'padded';
  }

  /** The function that declares a header, where walking stops. */
  private static ownerOf(declaration: ts.Node): ts.Node {
    let current: ts.Node = declaration;
    while (current.parent && !ts.isFunctionLike(current)) {
      current = current.parent;
    }
    return current;
  }

  report(): HeaderInsetReport {
    const problems: HeaderInsetProblem[] = [];
    const sites: { identifier: ts.Identifier; owner: ts.Node }[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node)) {
        const declaration = this.headerDeclaration(node);
        let inJsx = false;
        for (let parent = node.parent; parent; parent = parent.parent) {
          if (ts.isJsxExpression(parent)) inJsx = true;
          if (inJsx || ts.isStatement(parent) || ts.isFunctionLike(parent)) {
            break;
          }
        }
        if (declaration && inJsx) {
          sites.push({
            identifier: node,
            owner: HeaderInsetAnalysis.ownerOf(declaration),
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(this.sourceFile);

    const results = sites.map(({ identifier, owner }) => {
      const result = this.siteResult(identifier, owner, ANDROID);
      const line =
        this.sourceFile.getLineAndCharacterOfPosition(identifier.getStart())
          .line + 1;
      if (result === 'unpadded') {
        const onNative = this.siteResult(identifier, owner, IOS_NATIVE);
        problems.push({
          line,
          message:
            onNative === 'padded'
              ? 'the inset is applied on the native-header path instead of the custom one'
              : 'not inside an element padded with insets.top on Android',
        });
      } else if (result === 'uncertain') {
        problems.push({
          line,
          message:
            'the top padding depends on a condition the check cannot read; gate it on useNativeIOSHeadersActive() or Platform.OS',
        });
      }
      return result;
    });
    if (
      results.length > 0 &&
      results.every((result) => result === 'unreachable')
    ) {
      problems.push({
        line: null,
        message:
          'the bar is only rendered where the native header is in use, where the hook returns null, so Android shows no header',
      });
    }
    return { renders: sites.length, problems };
  }
}

export function checkHeaderInsets(
  fileName: string,
  sourceText: string,
  options: HeaderInsetOptions = {}
): HeaderInsetReport {
  const { sourceFile, checker } = createChecker(fileName, sourceText);
  return new HeaderInsetAnalysis(
    sourceFile,
    checker,
    options.headerPropNames ?? []
  ).report();
}
