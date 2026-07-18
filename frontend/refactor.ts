import { Project, SyntaxKind } from "ts-morph";
import * as path from "path";

const project = new Project();
project.addSourceFilesAtPaths("src/app/**/*.tsx");

const files = project.getSourceFiles();

for (const sourceFile of files) {
  if (!sourceFile.getFilePath().endsWith("page.tsx")) continue;

  let modified = false;

  const defaultExport = sourceFile.getDefaultExportSymbol()?.getValueDeclaration();
  if (!defaultExport || !defaultExport.isKind(SyntaxKind.FunctionDeclaration)) continue;

  const block = defaultExport.getBody();
  if (!block || !block.isKind(SyntaxKind.Block)) continue;

  const useEffects = block.getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((callExpr: any) => callExpr.getExpression().getText() === "useEffect");

  for (const useEffectCall of useEffects) {
    const args = useEffectCall.getArguments();
    if (args.length !== 2) continue; // we only care about useEffect(() => {}, [deps])

    const arrowFunc = args[0];
    if (!arrowFunc.isKind(SyntaxKind.ArrowFunction)) continue;

    const body = arrowFunc.getBodyText();
    if (!body) continue;

    // We only want to duplicate useEffects that make API calls (have .then or Api)
    if (!body.includes("Api") && !body.includes(".then")) continue;

    // Insert useAutoRefresh after this statement
    const statement = useEffectCall.getFirstAncestorByKind(SyntaxKind.ExpressionStatement);
    if (statement) {
      // Build the useAutoRefresh call
      const useAutoRefreshCode = `\n  useAutoRefresh(() => {\n${body}\n  }, 5000);\n`;
      
      // Prevent double injection if we run script multiple times
      if (!sourceFile.getText().includes("useAutoRefresh(() =>")) {
        statement.replaceWithText(statement.getText() + useAutoRefreshCode);
        modified = true;
      }
    }
  }

  if (modified) {
    // Add import
    const hasImport = sourceFile.getImportDeclarations().some((imp: any) => imp.getModuleSpecifierValue() === "@/hooks/useAutoRefresh");
    if (!hasImport) {
      sourceFile.addImportDeclaration({
        namedImports: ["useAutoRefresh"],
        moduleSpecifier: "@/hooks/useAutoRefresh",
      });
    }
    sourceFile.saveSync();
    console.log(`Refactored ${sourceFile.getFilePath()}`);
  }
}
