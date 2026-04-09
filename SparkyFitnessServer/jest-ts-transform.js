import ts from 'typescript';
export function process(src, filename) {
  const result = ts.transpileModule(src, {
    fileName: filename,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      isolatedModules: true,
    },
  });
  return { code: result.outputText };
}
export default {
  process,
};
