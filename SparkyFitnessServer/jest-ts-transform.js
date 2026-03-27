const ts = require('typescript');

module.exports = {
  process(src, filename) {
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
  },
};
