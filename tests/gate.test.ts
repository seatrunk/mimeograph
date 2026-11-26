import { spawn } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
const copied = [
  ".editorconfig",
  ".gitignore",
  ".oxlintrc.json",
  ".prettierignore",
  "knip.json",
  "package.json",
  "sgconfig.yml",
  "tsconfig.json",
  "rules",
  "src",
];

interface Step {
  name: string;
  command: string;
}

interface Probe {
  name: string;
  files: Record<string, string>;
  failsAt: string;
}

function gateSteps(): Step[] {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const script = (name: string): string => {
    const body = pkg.scripts[name];
    if (body === undefined) {
      throw new Error(`script ausente: ${name}`);
    }
    return body;
  };
  return script("check")
    .split("&&")
    .map((part) => {
      const name = part.trim().replace(/^pnpm /, "");
      return { name, command: script(name) };
    });
}

function runStep(
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("sh", ["-c", command], { cwd, env, stdio: "ignore" });
    child.on("error", () => resolve(1));
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function runGate(files: Record<string, string>): Promise<string | null> {
  const base = process.env.RUNNER_TEMP ?? tmpdir();
  const dir = mkdtempSync(join(base, "gate-"));
  try {
    for (const entry of copied) {
      cpSync(join(root, entry), join(dir, entry), { recursive: true });
    }
    symlinkSync(join(root, "node_modules"), join(dir, "node_modules"));
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
    }
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("VITEST")),
    );
    env.PATH = `${join(dir, "node_modules", ".bin")}:${process.env.PATH ?? ""}`;
    env.NO_COLOR = "1";
    for (const step of gateSteps()) {
      if ((await runStep(step.command, dir, env)) !== 0) {
        return step.name;
      }
    }
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const relativeImport = (specifier: string): string =>
  `import { doubler } from "${specifier}";\n\nexport const probe = doubler(1);\n`;

const catchProbe = (body: string, param = "e"): string =>
  `export function probe(): unknown {\n  try {\n    JSON.parse("bad");\n  } catch (${param}) {\n${body}\n  }\n  return undefined;\n}\n`;

interface CatchAttack {
  name: string;
  body: string;
  failsAt: string;
  param?: string;
}

const nested = (inner: string, handler: string): string =>
  `    try {\n      JSON.parse("inner");\n    } catch (${inner}) {\n${handler}\n    }`;

const catchAttacks: CatchAttack[] = [
  {
    name: "return new String({ cause: e })",
    body: "    return new String({ cause: e });",
    failsAt: "ast",
  },
  {
    name: "return new Map({ cause: e })",
    body: "    return new Map({ cause: e });",
    failsAt: "ast",
  },
  {
    name: "return Object({ cause: e }) sem new",
    body: "    return Object({ cause: e });",
    failsAt: "ast",
  },
  {
    name: "throw Error com cause sem new",
    body: '    throw Error("x", { cause: e });',
    failsAt: "ast",
  },
  {
    name: "throw new Error com as opções na posição da mensagem",
    body: "    throw new Error({ cause: e });",
    failsAt: "ast",
  },
  {
    name: "throw new AggregateError com as opções na posição errada",
    body: "    throw new AggregateError([], { cause: e });",
    failsAt: "ast",
  },
  {
    name: "throw de classe fora da lista de erros nativos",
    body: '    throw new AppError("x", { cause: e });',
    failsAt: "ast",
  },
  {
    name: "cause dentro de chamada nas opções",
    body: '    throw new Error("x", wrap({ cause: e }));',
    failsAt: "ast",
  },
  {
    name: "return de array com e",
    body: "    return [e];",
    failsAt: "ast",
  },
  {
    name: "return de spread de e",
    body: "    return { ...e };",
    failsAt: "ast",
  },
  {
    name: "return com e não nulo",
    body: "    return e!;",
    failsAt: "ast",
  },
  {
    name: "return condicional com e",
    body: "    return JSON.parse ? e : null;",
    failsAt: "ast",
  },
  {
    name: "return de objeto com spread depois do erro",
    body: "    return { error: e, ...JSON };",
    failsAt: "ast",
  },
  {
    name: "return de objeto com chave computada que sobrescreve",
    body: '    return { error: e, ["err" + "or"]: undefined };',
    failsAt: "ast",
  },
  {
    name: "cause com spread que sobrescreve",
    body: '    throw new Error("x", { cause: e, ...JSON });',
    failsAt: "ast",
  },
  {
    name: "throw de e dentro de outro catch com nome diferente",
    body: nested(
      "inner",
      '      if (JSON.parse) {\n        throw e;\n      }\n      throw new Error("x", { cause: inner });',
    ),
    failsAt: "ast",
  },
  {
    name: "parâmetro desestruturado devolvendo só a mensagem",
    body: "    return { message };",
    param: "{ message }",
    failsAt: "ast",
  },
  {
    name: "catch interno com o mesmo nome do externo",
    body: nested("e", "      throw e;"),
    failsAt: "lint",
  },
  {
    name: "reatribuição do erro antes do throw",
    body: "    e = null;\n    throw e;",
    failsAt: "lint",
  },
  {
    name: "código inalcançável com throw e depois do return",
    body: "    return null;\n    throw e;",
    failsAt: "lint",
  },
  {
    name: "var e redeclarando o parâmetro",
    body: "    var e = null;\n    throw e;",
    failsAt: "lint",
  },
  {
    name: "const e sombreando o parâmetro em bloco",
    body: "    {\n      const e = 1;\n      return e;\n    }",
    failsAt: "lint",
  },
  {
    name: "throw e atrás de condição constante falsa",
    body: "    if (false) {\n      throw e;\n    }",
    failsAt: "lint",
  },
  {
    name: "chave duplicada que sobrescreve o erro",
    body: "    return { error: e, error: undefined };",
    failsAt: "lint",
  },
];

const catchSafe: [string, string][] = [
  [
    "throw new TypeError com cause: e",
    '    throw new TypeError("x", { cause: e });',
  ],
  [
    "throw new AggregateError com cause: e no 3º argumento",
    '    throw new AggregateError([], "x", { cause: e });',
  ],
  ["return new Error com cause: e", '    return new Error("x", { cause: e });'],
];

const catchEscapes: [string, string][] = [
  ["return console.error(e)", "    return console.error(e);"],
  [
    "return com error vindo de console.error(e)",
    "    return { ok: false, error: console.error(e) };",
  ],
  ["return String(e)", "    return String(e);"],
  ["return de chamada qualquer que recebe e", "    return wrap(e);"],
  [
    "return com e em template string",
    "    return { ok: false, error: `${e}` };",
  ],
  ["return com e.message", "    return { ok: false, error: e.message };"],
  ["throw console.error(e)", "    throw console.error(e);"],
  [
    "throw new Error com cause derivada",
    '    throw new Error("x", { cause: String(e) });',
  ],
  [
    "ramo que engole ao lado de throw e",
    "    if (JSON.parse) {\n      return console.error(e);\n    }\n    throw e;",
  ],
];

const catchLegit: [string, string][] = [
  ["loga e relança com throw e", "    console.error(e);\n    throw e;"],
  ["throw new Error com cause: e", '    throw new Error("x", { cause: e });'],
  ["return com error: e", "    return { ok: false, error: e };"],
];

const nestedBypass = nested(
  "inner",
  "      if (JSON.parse) {\n        return console.error(e);\n      }\n      throw inner;",
);

const catchAttacksMore: CatchAttack[] = [
  {
    name: "spread nos argumentos desloca { cause: e } em new Error",
    body: "    const a: [string?] = [];\n    throw new Error(...a, { cause: e });",
    failsAt: "ast",
  },
  {
    name: "spread nos argumentos desloca { cause: e } em new AggregateError",
    body: "    const a: [string?] = [];\n    throw new AggregateError([], ...a, { cause: e });",
    failsAt: "ast",
  },
  {
    name: "return console.error(e) em catch interno de nome diferente",
    body: `${nestedBypass}\n    throw e;`,
    failsAt: "ast",
  },
  {
    name: "throw de objeto { error: e }",
    body: "    throw { error: e };",
    failsAt: "ast",
  },
  {
    name: "throw de objeto { e }",
    body: "    throw { e };",
    failsAt: "ast",
  },
  {
    name: "return de tupla [e, null]",
    body: "    return [e, null] as const;",
    failsAt: "ast",
  },
];

const catchControls: CatchAttack[] = [
  {
    name: "throw new Error com { cause } abreviado",
    body: '    throw new Error("falhou", { cause });',
    param: "cause",
    failsAt: "knip",
  },
  {
    name: "return { ok: false, error: e } as const",
    body: "    return { ok: false, error: e } as const;",
    failsAt: "knip",
  },
  {
    name: "return { ok: false, error: e } satisfies",
    body: "    return { ok: false, error: e } satisfies { ok: false; error: unknown };",
    failsAt: "knip",
  },
  {
    name: "return com error: new Error(..., { cause: e })",
    body: '    return { ok: false, error: new Error("ctx", { cause: e }) };',
    failsAt: "knip",
  },
  {
    name: "acesso a propriedade com o mesmo nome do erro",
    body: "    const fallback = { e: 1 };\n    if (Date.now() > 0) {\n      return fallback.e;\n    }\n    throw e;",
    failsAt: "knip",
  },
  {
    name: "return Promise.reject(e)",
    body: "    return Promise.reject(e);",
    failsAt: "knip",
  },
  {
    name: "return e com cast duplo",
    body: "    return e as unknown as Error;",
    failsAt: "knip",
  },
  {
    name: "cause com satisfies ErrorOptions",
    body: '    throw new Error("ctx", { cause: e } satisfies ErrorOptions);',
    failsAt: "knip",
  },
  {
    name: "new globalThis.Error",
    body: '    throw new globalThis.Error("ctx", { cause: e });',
    failsAt: "knip",
  },
  {
    name: "catch interno legítimo seguido de throw e no externo",
    body: `${nested("inner", '      throw new Error("y", { cause: inner });')}\n    throw e;`,
    failsAt: "knip",
  },
];

const file = (
  name: string,
  path: string,
  content: string,
  failsAt: string,
): Probe => ({ name, files: { [path]: content }, failsAt });

const hookDeclaration = "declare const React: Record<string, unknown>;\n\n";

const extraProbes: Probe[] = [
  file(
    "import() com template literal e ../",
    "src/features/example-b/probe.ts",
    "export const load = () => import(`../example-a/doubler.ts`);\n",
    "ast",
  ),
  file(
    "import() com template literal interpolado para arquivo interno",
    "src/features/example-b/probe.ts",
    'export const load = () => import(`#features/${"example-a"}/doubler.ts`);\n',
    "ast",
  ),
  file(
    "import() com variável",
    "src/shared/probe.ts",
    "export const load = (name: string) => import(name);\n",
    "ast",
  ),
  file(
    "import() com concatenação",
    "src/shared/probe.ts",
    'export const load = (name: string) => import("./" + name);\n',
    "ast",
  ),
  file(
    "require() com variável",
    "src/shared/probe.ts",
    "export const load = (name: string) => require(name);\n",
    "ast",
  ),
  file(
    "export * de arquivo interno por alias",
    "src/features/example-b/probe.ts",
    'export * from "#features/example-a/doubler.ts";\n',
    "ast",
  ),
  file(
    "export * as ns de arquivo interno por caminho relativo",
    "src/features/example-b/probe.ts",
    'export * as ns from "../example-a/index.ts";\n',
    "ast",
  ),
  file(
    "import de efeito colateral em arquivo interno de outra feature",
    "src/features/example-b/probe.ts",
    'import "../example-a/doubler.ts";\n',
    "ast",
  ),
  file(
    "import type de arquivo interno de outra feature",
    "src/features/example-b/probe.ts",
    'import type { A } from "#features/example-a/doubler.ts";\n\nexport type B = A;\n',
    "ast",
  ),
  file(
    "shared importando feature por alias",
    "src/shared/probe.ts",
    'import { double } from "#features/example-a";\n\nexport const probe = double(1);\n',
    "ast",
  ),
  file(
    "shared reexportando feature por caminho relativo",
    "src/shared/probe.ts",
    'export { double } from "../features/example-a/index.ts";\n',
    "ast",
  ),
  file(
    "pacote externo com features/ no subpath passa nas fronteiras",
    "src/shared/probe.ts",
    'import { x } from "some-pkg/features/a/b";\n\nexport const probe = x;\n',
    "typecheck",
  ),
  file(
    "pacote externo com features/ no subpath dentro de feature",
    "src/features/example-b/probe.ts",
    'import { x } from "some-pkg/features/a/b";\n\nexport const probe = x;\n',
    "typecheck",
  ),
  file(
    "useEffect importado com alias",
    "src/features/example-a/probe.ts",
    'import { useEffect as fx } from "react";\n\nfx(() => {});\n',
    "ast",
  ),
  file(
    "useEffect atribuído a variável",
    "src/features/example-a/probe.ts",
    "export const fx = useEffect;\n",
    "ast",
  ),
  file(
    "useEffect por colchetes",
    "src/features/example-a/probe.ts",
    `${hookDeclaration}export const fx = React["useEffect"];\n`,
    "ast",
  ),
  file(
    "useEffect por destructuring com alias",
    "src/features/example-a/probe.ts",
    `${hookDeclaration}export const { useEffect: fx } = React;\n`,
    "ast",
  ),
  file(
    "useEffect por Reflect.get",
    "src/features/example-a/probe.ts",
    `${hookDeclaration}export const fx = Reflect.get(React, "useEffect");\n`,
    "ast",
  ),
  file(
    "useLayoutEffect fora do caminho permitido",
    "src/features/example-a/probe.ts",
    `${hookDeclaration}export const fx = React.useLayoutEffect;\n`,
    "ast",
  ),
  file(
    "useEffect dentro de src/shared/effects passa em ast",
    "src/shared/effects/probe.ts",
    "export const fx = useEffect;\n",
    "typecheck",
  ),
  file(
    "diretiva reference disfarçada de comentário",
    "scripts/probe.spec.ts",
    "/// <reference comentario disfarcado\nexport const probe = 1;\n",
    "ast",
  ),
  file(
    "diretiva reference completa é permitida",
    "tests/probe.ts",
    '/// <reference types="node" />\nexport const probe = 1;\n',
    "knip",
  ),
  file(
    "class com nome de erro nativo",
    "src/shared/probe.ts",
    "export class TypeError extends Object {}\n",
    "ast",
  ),
  file(
    "const com nome de erro nativo",
    "src/shared/probe.ts",
    "export const Error = Object;\n",
    "ast",
  ),
];

const catchAttacksLast: CatchAttack[] = [
  {
    name: "throw e só dentro de if, sem fallback",
    body: "    if (Date.now() < 0) {\n      throw e;\n    }",
    failsAt: "ast",
  },
  {
    name: "throw e dentro de if seguido de return null",
    body: "    if (Date.now() < 0) {\n      throw e;\n    }\n    return null;",
    failsAt: "ast",
  },
  {
    name: "throw e só em um case de switch",
    body: "    switch (Date.now()) {\n      case 1:\n        throw e;\n    }",
    failsAt: "ast",
  },
  {
    name: "throw e só dentro de laço",
    body: "    for (const x of [1, 2]) {\n      if (x > 1) {\n        throw e;\n      }\n    }\n    return null;",
    failsAt: "ast",
  },
  {
    name: "return com acesso a propriedade do objeto",
    body: "    return { ok: false, error: e }.error;",
    failsAt: "ast",
  },
  {
    name: "Promise.reject(e) encadeado com catch",
    body: "    return Promise.reject(e).catch(() => null);",
    failsAt: "ast",
  },
  {
    name: "IIFE assíncrona com throw e",
    body: "    (async () => {\n      throw e;\n    })();",
    failsAt: "ast",
  },
];

const loaderProbes: Probe[] = [
  file(
    "createRequire carregando arquivo interno de outra feature",
    "src/features/example-b/probe.ts",
    'import { createRequire } from "node:module";\n\nexport const probe = createRequire(import.meta.url)("../example-a/doubler.ts");\n',
    "ast",
  ),
  file(
    "require por alias",
    "src/features/example-b/probe.ts",
    'const load = require;\n\nexport const probe = load("../example-a/doubler.ts");\n',
    "ast",
  ),
  file(
    "module.require",
    "src/features/example-b/probe.ts",
    'export const probe = module.require("../example-a/doubler.ts");\n',
    "ast",
  ),
  file(
    "import.meta.resolve",
    "src/features/example-b/probe.ts",
    'export const probe = import.meta.resolve("../example-a/doubler.ts");\n',
    "ast",
  ),
  file(
    "shebang",
    "src/shared/probe.ts",
    "#!/usr/bin/env node\nexport const probe = 1;\n",
    "ast",
  ),
  file(
    "comentário em .js",
    "src/shared/probe.js",
    "// proibido\nexport const probe = 1;\n",
    "ast",
  ),
  file(
    "comentário em .mjs",
    "src/shared/probe.mjs",
    "// proibido\nexport const probe = 1;\n",
    "ast",
  ),
  file(
    "comentário em .jsx",
    "src/shared/probe.jsx",
    "// proibido\nexport const probe = 1;\n",
    "ast",
  ),
  file(
    "useEffect em .js",
    "src/features/example-a/probe.js",
    'import { useEffect } from "react";\n\nuseEffect(() => {});\n',
    "ast",
  ),
  file(
    "import cruzado entre features em .js",
    "src/features/example-b/probe.js",
    'import { doubler } from "../example-a/doubler.ts";\n\nexport const probe = doubler(1);\n',
    "ast",
  ),
  file(
    "arquivo .js órfão",
    "src/shared/probe.js",
    "export const orphan = 1;\n",
    "knip",
  ),
  file(
    "useEffect com escape unicode no identificador é barrado pelo Prettier",
    "src/features/example-a/probe.ts",
    "declare const use\\u0045ffect: () => void;\n\nuse\\u0045ffect();\n",
    "format:check",
  ),
];

const catchBlock = (head: string, body: string): string =>
  `${head}export function probe(): unknown {\n  try {\n    JSON.parse("bad");\n  } catch (e) {\n${body}\n  }\n  return undefined;\n}\n`;

const fakeError = "declare const Fake: ErrorConstructor;\n\n";

const round5Probes: Probe[] = [
  file(
    "import() com 2 argumentos para arquivo interno por caminho relativo",
    "src/features/example-b/probe.ts",
    'export const load = () => import("../example-a/doubler.ts", {});\n',
    "ast",
  ),
  file(
    "import() com 2 argumentos para arquivo interno por alias",
    "src/features/example-b/probe.ts",
    'export const load = () => import("#features/example-a/doubler.ts", {});\n',
    "ast",
  ),
  file(
    "import() com 2 argumentos de shared para feature",
    "src/shared/probe.ts",
    'export const load = () => import("#features/example-a", {});\n',
    "ast",
  ),
  file(
    "import() com 2 argumentos para ./features/ a partir da raiz de src",
    "src/probe.ts",
    'export const load = () => import("./features/example-a/doubler.ts", {});\n',
    "ast",
  ),
  file(
    "import x = require para arquivo interno de outra feature",
    "src/features/example-b/probe.ts",
    'import probe = require("../example-a/doubler.ts");\n\nexport { probe };\n',
    "ast",
  ),
  file(
    "alias #shared com .. chegando em feature",
    "src/probe.ts",
    'import "#shared/../features/example-a/doubler.ts";\n',
    "ast",
  ),
  file(
    "createRequire acessado por namespace",
    "src/features/example-b/probe.ts",
    'import * as mod from "node:module";\n\nexport const probe = mod.createRequire(import.meta.url)(\n  "../example-a/doubler.ts",\n);\n',
    "ast",
  ),
  file(
    "process.getBuiltinModule",
    "src/shared/probe.ts",
    'export const probe = process.getBuiltinModule("node:module");\n',
    "ast",
  ),
  file(
    "require por colchetes",
    "src/features/example-b/probe.ts",
    'declare const m: Record<string, (id: string) => unknown>;\n\nexport const probe = m["require"]("../example-a/doubler.ts");\n',
    "ast",
  ),
  file(
    "import.meta por colchetes",
    "src/features/example-b/probe.ts",
    'export const probe = import.meta["resolve"]("../example-a/doubler.ts");\n',
    "ast",
  ),
  file(
    "new Function montando import dinâmico",
    "src/shared/probe.ts",
    "export const probe = new Function(\"return import('../example-a/doubler.ts')\");\n",
    "lint",
  ),
  file(
    "especificador de import com escape hexadecimal",
    "src/features/example-b/probe.ts",
    'import { doubler } from "\\x2e\\x2e/example-a/doubler.ts";\n\nexport const probe = doubler(1);\n',
    "ast",
  ),
  file(
    "useEffect por colchetes com escape hexadecimal",
    "src/features/example-a/probe.ts",
    `${hookDeclaration}export const fx = React["use\\x45ffect"];\n`,
    "ast",
  ),
  file(
    "import default com nome Error",
    "src/shared/probe.ts",
    'import Error from "./fake.ts";\n\nexport const probe = Error;\n',
    "ast",
  ),
  file(
    "destructuring com alias Error",
    "src/shared/probe.ts",
    `${fakeError}export const { a: Error } = { a: Fake };\n`,
    "ast",
  ),
  file(
    "array destructuring com Error",
    "src/shared/probe.ts",
    `${fakeError}export const [Error] = [Fake];\n`,
    "ast",
  ),
  file(
    "parâmetro chamado Error",
    "src/shared/probe.ts",
    "export function probe(Error: unknown): unknown {\n  return Error;\n}\n",
    "ast",
  ),
  file(
    "Promise redeclarada para engolir via Promise.reject(e)",
    "src/shared/probe.ts",
    catchBlock(
      "const Promise = { reject: (_e: unknown) => null };\n\n",
      "    return Promise.reject(e);",
    ),
    "ast",
  ),
  file(
    "globalThis.Error atribuído",
    "src/shared/probe.ts",
    `${fakeError}globalThis.Error = Fake;\n`,
    "ast",
  ),
  file(
    "globalThis copiado para variável e Error atribuído",
    "src/shared/probe.ts",
    `${fakeError}const g = globalThis;\n\ng.Error = Fake;\n`,
    "ast",
  ),
  file(
    "Object.defineProperty em globalThis",
    "src/shared/probe.ts",
    `${fakeError}Object.defineProperty(globalThis, "Error", { value: Fake });\n`,
    "ast",
  ),
  file(
    "import com alias de Error não é shadow",
    "src/shared/probe.ts",
    'import type { Error as ApiError } from "./api.ts";\n\nexport type Probe = ApiError;\n',
    "typecheck",
  ),
  file(
    "método de domínio chamado require não é carga de módulo",
    "src/shared/probe.ts",
    'declare const schema: { require(id: string): unknown };\n\nexport const probe = schema.require("id");\n',
    "knip",
  ),
  file(
    "comentário em scripts/ fora de src e tests",
    "scripts/build.ts",
    "// proibido\nexport const build = 1;\n",
    "ast",
  ),
  file(
    "comentário em arquivo de configuração na raiz",
    "vite.config.ts",
    "// proibido\nexport default {};\n",
    "ast",
  ),
  file(
    "especificador de import com escape de barra é barrado pelo Oxlint",
    "src/features/example-b/probe.ts",
    'import { doubler } from "..\\/example-a/doubler.ts";\n\nexport const probe = doubler(1);\n',
    "lint",
  ),
  file(
    "especificador de import com continuação de linha",
    "src/features/example-b/probe.ts",
    'import { doubler } from ".\\\n./example-a/doubler.ts";\n\nexport const probe = doubler(1);\n',
    "ast",
  ),
  file(
    "barra dupla em ./features//",
    "src/probe.ts",
    'export const load = () => import("./features//example-a/doubler.ts");\n',
    "ast",
  ),
  file(
    "reference types com caminho relativo",
    "tests/probe.ts",
    '/// <reference types="../src/features/example-a/doubler" />\nexport const probe = 1;\n',
    "ast",
  ),
  file(
    "reference path para arquivo interno de feature é barrado pelo Oxlint",
    "tests/probe.ts",
    '/// <reference path="../src/features/example-a/doubler.ts" />\nexport const probe = 1;\n',
    "lint",
  ),
  ...[
    [
      "if/else em que os dois ramos relançam",
      '    if (e instanceof TypeError) {\n      throw new Error("tipo", { cause: e });\n    } else {\n      throw e;\n    }',
      "knip",
    ],
    [
      "return com cast duplo no objeto",
      "    return { ok: false, error: e } as unknown as { ok: false };",
      "knip",
    ],
    ["return e satisfies unknown", "    return e satisfies unknown;", "knip"],
    [
      "fallback de domínio antes do throw e final",
      '    if (e instanceof SyntaxError) {\n      return { ok: false, kind: "invalid-json" };\n    }\n    throw e;',
      "knip",
    ],
    [
      "if/else em que um ramo engole o erro",
      "    if (e instanceof TypeError) {\n      throw e;\n    } else {\n      return null;\n    }",
      "ast",
    ],
  ].map(([name, body, failsAt]): Probe =>
    file(
      `catch: ${name}`,
      "src/shared/probe.ts",
      catchProbe(body ?? ""),
      failsAt ?? "ast",
    ),
  ),
];

const round6Controls: Probe[] = [
  file(
    "controle: chamada comum com globalThis como argumento",
    "src/shared/probe.ts",
    "declare function attach(target: unknown): void;\n\nexport const probe = (): void => attach(globalThis);\n",
    "knip",
  ),
  file(
    "controle: parâmetro chamado self passado em chamada",
    "src/shared/probe.ts",
    "declare function format(value: unknown): string;\n\nexport function probe(self: unknown): string {\n  return format(self);\n}\n",
    "knip",
  ),
  file(
    "controle: globalThis em seen.has",
    "src/shared/probe.ts",
    "export const probe = (seen: Set<unknown>): boolean => seen.has(globalThis);\n",
    "knip",
  ),
  file(
    "controle: atribuição por colchetes em variável chamada self",
    "src/shared/probe.ts",
    "export function probe(self: Record<string, number>, key: string): void {\n  self[key] = 1;\n}\n",
    "knip",
  ),
  file(
    "controle: valor padrão new Error em destructuring",
    "src/shared/probe.ts",
    'declare const opts: { err?: Error };\n\nexport const { err = new Error("padrao") } = opts;\n',
    "knip",
  ),
  file(
    "controle: valor padrão Promise.resolve em destructuring",
    "src/shared/probe.ts",
    "declare const opts: { p?: Promise<number> };\n\nexport const { p = Promise.resolve(1) } = opts;\n",
    "knip",
  ),
  file(
    "controle: valor padrão new TypeError em array destructuring",
    "src/shared/probe.ts",
    'declare const arr: Error[];\n\nexport const [first = new TypeError("a")] = arr;\n',
    "knip",
  ),
  file(
    "controle: crase escapando o cifrão em template",
    "src/shared/probe.ts",
    "export const probe = `\\${literal}`;\n",
    "knip",
  ),
  file(
    "ataque: atribuição a Error por destructuring com valor padrão",
    "src/shared/probe.ts",
    "declare const opts: { Error?: ErrorConstructor };\n\nexport const { Error = globalThis.Error } = opts;\n",
    "ast",
  ),
  file(
    "ataque: Reflect.defineProperty em globalThis",
    "src/shared/probe.ts",
    'declare const Fake: ErrorConstructor;\n\nReflect.defineProperty(globalThis, "Error", { value: Fake });\n',
    "ast",
  ),
  file(
    "ataque: Object.defineProperties em window",
    "src/shared/probe.ts",
    "declare const window: object;\n\nObject.defineProperties(window, {});\n",
    "ast",
  ),
];

const probes: Probe[] = [
  ...round6Controls,
  ...round5Probes,
  ...catchAttacksLast.map(({ name, body, failsAt }): Probe => ({
    name: `catch ataque: ${name}`,
    files: { "src/shared/probe.ts": catchProbe(body) },
    failsAt,
  })),
  ...loaderProbes,
  ...catchAttacksMore.map(({ name, body, failsAt, param }): Probe => ({
    name: `catch ataque: ${name}`,
    files: { "src/shared/probe.ts": catchProbe(body, param) },
    failsAt,
  })),
  ...catchControls.map(({ name, body, failsAt, param }): Probe => ({
    name: `catch legítimo: ${name}`,
    files: { "src/shared/probe.ts": catchProbe(body, param) },
    failsAt,
  })),
  ...extraProbes,
  ...catchLegit.map(([name, body]): Probe => ({
    name: `catch legítimo sem falso positivo: ${name}`,
    files: { "src/shared/probe.ts": catchProbe(body) },
    failsAt: "knip",
  })),
  {
    name: "import relativo com ./.. para outra feature",
    files: {
      "src/features/example-b/probe.ts": relativeImport(
        "./../example-a/doubler.ts",
      ),
    },
    failsAt: "ast",
  },
  {
    name: "import relativo com .. no meio do caminho",
    files: {
      "src/features/example-b/probe.ts": relativeImport(
        "./sub/../../example-a/doubler.ts",
      ),
    },
    failsAt: "ast",
  },
  {
    name: "export from com ./..",
    files: {
      "src/features/example-b/probe.ts":
        'export { doubler } from "./../example-a/doubler.ts";\n',
    },
    failsAt: "ast",
  },
  {
    name: "import() com ./..",
    files: {
      "src/features/example-b/probe.ts":
        'export const load = () => import("./../example-a/doubler.ts");\n',
    },
    failsAt: "ast",
  },
  {
    name: "require() com ./..",
    files: {
      "src/features/example-b/probe.ts":
        'export const load = () => require("./../example-a/doubler.ts");\n',
    },
    failsAt: "ast",
  },
  {
    name: "catch que só registra o erro derivado",
    files: {
      "src/shared/probe.ts":
        'export function probe(): void {\n  try {\n    JSON.parse("bad");\n  } catch (e) {\n    const message = String(e);\n    console.error(message);\n  }\n}\n',
    },
    failsAt: "ast",
  },
  {
    name: "catch com throw em função aninhada",
    files: {
      "src/shared/probe.ts":
        'export function probe(): void {\n  try {\n    JSON.parse("bad");\n  } catch (e) {\n    const rethrow = () => {\n      throw e;\n    };\n    console.error(rethrow);\n  }\n}\n',
    },
    failsAt: "ast",
  },
  ...catchSafe.map(([name, body]): Probe => ({
    name: `catch legítimo sem falso positivo: ${name}`,
    files: { "src/shared/probe.ts": catchProbe(body) },
    failsAt: "knip",
  })),
  ...catchAttacks.map(({ name, body, failsAt, param }): Probe => ({
    name: `catch ataque: ${name}`,
    files: { "src/shared/probe.ts": catchProbe(body, param) },
    failsAt,
  })),
  ...catchEscapes.map(([name, body]): Probe => ({
    name: `catch: ${name}`,
    files: { "src/shared/probe.ts": catchProbe(body) },
    failsAt: "ast",
  })),
  {
    name: "comentário em tests/",
    files: {
      "tests/probe.test.ts":
        'import { expect, test } from "vitest";\n\n// proibido\ntest("probe", () => {\n  expect(1).toBe(1);\n});\n',
    },
    failsAt: "ast",
  },
  {
    name: "comentário em arquivo .spec fora de src",
    files: {
      "scripts/probe.spec.ts": "// proibido\nexport const probe = 1;\n",
    },
    failsAt: "ast",
  },
  {
    name: "comentário em __tests__ fora de src",
    files: {
      "lib/__tests__/probe.ts": "// proibido\nexport const probe = 1;\n",
    },
    failsAt: "ast",
  },
  {
    name: "arquivo .tsx órfão",
    files: { "src/shared/probe.tsx": "export const orphan = 1;\n" },
    failsAt: "knip",
  },
  {
    name: "arquivo .mts órfão",
    files: { "src/shared/probe.mts": "export const orphan = 1;\n" },
    failsAt: "knip",
  },
  {
    name: "arquivo .cts órfão",
    files: { "src/shared/probe.cts": 'console.log("orphan");\n' },
    failsAt: "knip",
  },
];

describe.concurrent("gate", () => {
  test(
    "cópia sem violação passa em todas as etapas",
    { timeout: 120_000 },
    async () => {
      expect(await runGate({})).toBeNull();
    },
  );

  for (const probe of probes) {
    test(
      `${probe.name} falha em ${probe.failsAt}`,
      { timeout: 120_000 },
      async () => {
        expect(await runGate(probe.files)).toBe(probe.failsAt);
      },
    );
  }
});
