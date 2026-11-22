/**
 * @file        scripts/check-headers.ts
 * @purpose     Verifies that every source, test, script, stylesheet and HTML file has a valid header and exported names.
 * @layer       scripts (meta tooling)
 * @keyFunctions
 *   - HeaderError
 *   - CheckHeadersOptions
 *   - listFiles(root, extensions?)
 *   - parseHeader(text)
 *   - exportedNames(text, fileName)
 *   - checkHeaders(options?)
 * @invariants  read-only; never modifies a file; deterministic path order
 * @security    none (meta tooling)
 * @tests       tests/meta/headers.test.ts
 * @spec        02-architecture-and-headers.md section 4; P0-scaffold.md step 4
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export type HeaderError = { file: string; message: string };
export type CheckHeadersOptions = { cwd?: string; roots?: string[] };

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.css', '.html']);
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'coverage', '.devvit', '.git']);

export function listFiles(
  root: string,
  extensions: ReadonlySet<string> = SCAN_EXTENSIONS
): string[] {
  let stats;
  try {
    stats = statSync(root);
  } catch {
    return [];
  }

  if (stats.isFile()) {
    return extensions.has(extname(root)) ? [root] : [];
  }

  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        files.push(...listFiles(join(root, entry.name), extensions));
      }
    } else if (entry.isFile() && extensions.has(extname(entry.name))) {
      files.push(join(root, entry.name));
    }
  }
  return files;
}

export function parseHeader(text: string): Record<string, string> | null {
  const source = text.replace(/^\uFEFF/, '');
  let block: string;

  if (source.startsWith('<!--')) {
    const end = source.indexOf('-->');
    if (end === -1) {
      return null;
    }
    block = source.slice(4, end);
  } else {
    const match = source.match(/^\s*\/\*+([\s\S]*?)\*\//);
    if (!match) {
      return null;
    }
    block = match[1] ?? '';
  }

  const fields: Record<string, string> = {};
  let current = '';

  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*\*?\s?/, '').trimEnd();
    if (!line.trim()) {
      continue;
    }

    const tag = line.match(/^@(\w+)\s*(.*)$/);
    if (tag) {
      current = tag[1] ?? '';
      const value = (tag[2] ?? '').trim();
      fields[current] = value;
      continue;
    }

    if (current) {
      fields[current] = `${fields[current] ?? ''}\n${line.trim()}`.trim();
    }
  }

  return fields;
}

export function exportedNames(text: string, fileName: string): Set<string> {
  const scriptKind = fileName.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : fileName.endsWith('.ts')
      ? ts.ScriptKind.TS
      : ts.ScriptKind.JS;
  const sourceFile = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  );
  const names = new Set<string>();

  for (const statement of sourceFile.statements) {
    const modifiers = ts.canHaveModifiers(statement)
      ? ts.getModifiers(statement)
      : undefined;
    const isExported = modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
    );
    if (!isExported) {
      continue;
    }

    if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)
    ) {
      if (statement.name) {
        names.add(statement.name.text);
      }
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          names.add(declaration.name.text);
        }
      }
    } else if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        names.add(element.name.text);
      }
    }
  }

  return names;
}

function keyFunctionNames(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*-\s*/, '').trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = line.match(/^([A-Za-z_$][\w$]*)/);
      return match?.[1] ?? line;
    });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function checkHeaders(options: CheckHeadersOptions = {}): HeaderError[] {
  const cwd = options.cwd ?? process.cwd();
  const roots = options.roots ?? ['src', 'tests', 'scripts'];
  const errors: HeaderError[] = [];
  const files = roots
    .flatMap((root) => listFiles(join(cwd, root)))
    .sort((left, right) => left.localeCompare(right));

  for (const absoluteFile of files) {
    const file = relative(cwd, absoluteFile).split(sep).join('/');
    const text = readFileSync(absoluteFile, 'utf8');
    const header = parseHeader(text);

    if (!header) {
      errors.push({ file, message: 'missing header' });
      continue;
    }

    if ((header.file ?? '').trim() !== file) {
      errors.push({
        file,
        message: `@file is "${header.file ?? ''}" but the path is "${file}"`,
      });
    }

    if (!(header.purpose ?? '').trim()) {
      errors.push({ file, message: '@purpose is empty' });
    }

    const extension = extname(file);

    if (extension === '.html') {
      const ids = (header.domIds ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0);

      if (ids.length === 0) {
        errors.push({ file, message: '@domIds is empty' });
      }

      for (const id of ids) {
        const pattern = new RegExp(`id\\s*=\\s*["']${escapeRegExp(id)}["']`);
        if (!pattern.test(text)) {
          errors.push({ file, message: `DOM id "${id}" is not present` });
        }
      }
      continue;
    }

    if (extension === '.css') {
      continue;
    }

    if (file.startsWith('tests/')) {
      if (!(header.covers ?? '').trim()) {
        errors.push({ file, message: '@covers is empty' });
      }
      continue;
    }

    const names = keyFunctionNames(header.keyFunctions ?? '');
    if (names.length === 0) {
      errors.push({ file, message: '@keyFunctions is empty' });
    }

    const exports = exportedNames(text, file);
    for (const name of names) {
      if (!exports.has(name)) {
        errors.push({
          file,
          message: `@keyFunctions name "${name}" is not exported`,
        });
      }
    }
  }

  return errors;
}

function main(): void {
  const errors = checkHeaders();
  if (errors.length === 0) {
    console.log('headers: ok');
    return;
  }

  for (const error of errors) {
    console.error(`${error.file}: ${error.message}`);
  }
  process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
