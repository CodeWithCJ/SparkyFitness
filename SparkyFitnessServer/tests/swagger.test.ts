import { describe, it, expect, vi } from 'vitest';
import specs from '../config/swagger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const routesDir = path.resolve(__dirname, '../routes');

const serverFilePath = path.resolve(__dirname, '../SparkyFitnessServer.ts');

it('publishes strict ingredient save and suggestion request bodies in the generated paths', () => {
  for (const [operation, name] of [
    ['save', 'RecipeImportSaveRequest'],
    ['suggest', 'RecipeImportSuggestionRequest'],
  ] as const) {
    expect(
      specs.paths['/v2/recipe-imports/mealie/' + operation].post.requestBody
    ).toEqual({
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/' + name },
        },
      },
    });
    expect(specs.components.schemas[name].additionalProperties).toBe(false);
    expect(specs.components.schemas[name].required).toEqual(
      expect.arrayContaining(['providerId', 'recipeSlug', 'sourceFingerprint'])
    );
  }
  const save = specs.components.schemas.RecipeImportSaveRequest;
  expect(save.required).toContain('mappings');
  expect(save.required).not.toContain('servings');
  expect(save.properties.finishedWeightGrams.maximum).toBe(1e9);
  expect(save.properties.mappings).toMatchObject({
    minItems: 1,
    maxItems: 100,
    items: { additionalProperties: false },
  });
  const suggest = specs.components.schemas.RecipeImportSuggestionRequest;
  expect(suggest.properties.ingredientIds.maxItems).toBe(20);
  expect(suggest.properties.confirmedIngredientIds.maxItems).toBe(100);
  expect(suggest.required).not.toContain('useAi');
  expect(suggest.properties.useAi.default).toBe(false);
  expect(suggest.properties.serviceConfigId.format).toBe('uuid');
});

// Dynamically construct mount mappings by parsing SparkyFitnessServer.ts and sub-routers
function buildMountMap(
  serverPath: string,
  routesDirectory: string
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  const visited = new Set<string>();

  function scan(filePath: string, parentPrefixes: string[]) {
    const absolutePath = path.resolve(filePath);
    if (visited.has(absolutePath)) return;
    visited.add(absolutePath);

    if (!fs.existsSync(absolutePath)) return;
    const content = fs.readFileSync(absolutePath, 'utf8');

    // Parse imports (handles default, named, and namespace imports)
    const importRegex =
      /import\s+(?:(\w+)|\*\s+as\s+(\w+)|{\s*([^}]+)\s*})\s+from\s+['"]([^'"]+)['"]/g;
    const imports: Record<string, string> = {};
    let importMatch;
    while ((importMatch = importRegex.exec(content)) !== null) {
      const defaultImport = importMatch[1];
      const namespaceImport = importMatch[2];
      const namedImports = importMatch[3];
      const importPath = importMatch[4];

      const varNames: string[] = [];
      if (defaultImport) varNames.push(defaultImport);
      if (namespaceImport) varNames.push(namespaceImport);
      if (namedImports) {
        namedImports.split(',').forEach((part) => {
          const trimmed = part.trim();
          if (trimmed) {
            const aliasMatch = trimmed.match(/(\w+)\s+as\s+(\w+)/);
            if (aliasMatch) {
              varNames.push(aliasMatch[2]);
            } else {
              varNames.push(trimmed);
            }
          }
        });
      }
      for (const name of varNames) {
        imports[name] = importPath;
      }
    }

    // Match router mountings, e.g., app.use('/api/chat', chatRoutes)
    const useRegex =
      /(?:app|router)\.use\(\s*['"]([^'"]+)['"]\s*,\s*(?:(?:\([^)]*\)\s*=>\s*(\w+)\()|(\w+))/g;
    let useMatch;
    while ((useMatch = useRegex.exec(content)) !== null) {
      const mountPath = useMatch[1];
      const routerVar = useMatch[2] || useMatch[3];

      if (routerVar && imports[routerVar]) {
        const relativeImportPath = imports[routerVar];
        let resolvedPath = path.resolve(
          path.dirname(absolutePath),
          relativeImportPath
        );

        let fileFound = false;
        const extensions = ['.ts', '.tsx', '.js', '.jsx'];
        for (const ext of extensions) {
          const testPath = resolvedPath.replace(/\.[a-zA-Z0-9]+$/, '') + ext;
          if (fs.existsSync(testPath)) {
            resolvedPath = testPath;
            fileFound = true;
            break;
          }
        }
        if (!fileFound) {
          for (const ext of extensions) {
            const testPath = resolvedPath + ext;
            if (fs.existsSync(testPath)) {
              resolvedPath = testPath;
              fileFound = true;
              break;
            }
          }
        }

        if (fileFound) {
          const newPrefixes = parentPrefixes.map((parentPrefix) => {
            let combined = path
              .join(parentPrefix, mountPath)
              .replace(/\\/g, '/');
            if (combined === '/api') {
              combined = '/';
            } else if (combined.startsWith('/api/')) {
              combined = combined.slice(4);
            }
            if (!combined.startsWith('/')) {
              combined = '/' + combined;
            }
            if (combined.endsWith('/') && combined.length > 1) {
              combined = combined.slice(0, -1);
            }
            return combined;
          });

          const key = path
            .relative(routesDirectory, resolvedPath)
            .replace(/\\/g, '/');
          if (!map[key]) {
            map[key] = [];
          }
          for (const prefix of newPrefixes) {
            if (!map[key].includes(prefix)) {
              map[key].push(prefix);
            }
          }

          scan(resolvedPath, newPrefixes);
        }
      }
    }
  }

  scan(serverPath, ['']);
  return map;
}

const mountMap = buildMountMap(serverFilePath, routesDir);

describe('Swagger Documentation Validation', () => {
  it('should generate a valid spec object', () => {
    expect(specs).toBeTypeOf('object');
    expect(specs.openapi).toBe('3.0.0');
    expect(specs.info).toBeTypeOf('object');
    expect(specs.paths).toBeTypeOf('object');
  });

  // swagger-jsdoc only logs a JSDoc block that is not valid YAML and leaves
  // its paths out of the spec, so the build has to be watched for that report.
  it('should parse every @swagger block without YAML errors', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      vi.resetModules();
      const { default: freshSpecs } = await import('../config/swagger.js');
      const reports = errorSpy.mock.calls
        .map((args) => args.join(' '))
        .filter((message) => message.includes('Error in '));
      expect(reports).toEqual([]);
      expect(freshSpecs.paths['/v2/run-program/custom']).toHaveProperty('get');
    } finally {
      errorSpy.mockRestore();
      infoSpy.mockRestore();
    }
  });

  it('should contain only valid properties inside components', () => {
    const components = specs.components || {};
    const validComponentKeys = [
      'schemas',
      'responses',
      'parameters',
      'examples',
      'requestBodies',
      'headers',
      'securitySchemes',
      'links',
      'callbacks',
      'pathItems',
    ];

    Object.keys(components).forEach((key) => {
      expect(validComponentKeys).toContain(key);
      expect(key.startsWith('/')).toBe(false); // No raw path keys in components
    });
  });

  it('should resolve all components/schemas $ref references successfully', () => {
    const schemas = new Set(Object.keys(specs.components?.schemas || {}));

    // Find all ref occurrences in the generated spec JSON
    const specJson = JSON.stringify(specs);
    const refRegex =
      /"\$ref"\s*:\s*"#\/components\/schemas\/([a-zA-Z0-9_-]+)"/g;
    let match;
    const missingRefs = new Set<string>();

    while ((match = refRegex.exec(specJson)) !== null) {
      const refName = match[1];
      if (!schemas.has(refName)) {
        missingRefs.add(refName);
      }
    }

    expect(Array.from(missingRefs)).toEqual([]);
  });

  it('should align all JSDoc @swagger paths with Express route mounts', () => {
    const mismatches: string[] = [];

    function scanFile(filePath: string, relativePath: string) {
      const content = fs.readFileSync(filePath, 'utf8');
      const normalizedKey = relativePath.replace(/\\/g, '/');
      const mounts = mountMap[normalizedKey];
      if (!mounts) return;

      const swaggerRegex = /@swagger\s*\n\s*\*\s*(\/[^\s:]+)/g;
      let match;
      while ((match = swaggerRegex.exec(content)) !== null) {
        const documentedPath = match[1];
        const isValid = mounts.some((mount) => {
          if (documentedPath === mount) return true;
          if (documentedPath.startsWith(mount + '/')) return true;
          return false;
        });

        if (!isValid) {
          mismatches.push(
            `${normalizedKey}: Documented path "${documentedPath}" is not prefixed with expected mount(s): ${JSON.stringify(mounts)}`
          );
        }
      }
    }

    function scanDir(dirPath: string, rootDir: string) {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const fullPath = path.join(dirPath, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          scanDir(fullPath, rootDir);
        } else if (file.endsWith('.ts') || file.endsWith('.js')) {
          const relativePath = path.relative(rootDir, fullPath);
          scanFile(fullPath, relativePath);
        }
      }
    }

    if (fs.existsSync(routesDir)) {
      scanDir(routesDir, routesDir);
    }

    expect(mismatches).toEqual([]);
  });
});
