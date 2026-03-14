import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Project, Node, ts, type JSDoc, type SourceFile } from "ts-morph";

type CliArgs = {
  command: "extract" | "render";
  packageName?: string;
  entries?: string[];
  output?: string;
  input?: string;
  config?: string;
};

type DocParam = {
  name: string;
  type?: string;
  description: string;
  optional?: boolean;
};

type DocTag = {
  name: string;
  text: string;
};

type DocEntry = {
  id: string;
  name: string;
  kind: string;
  title?: string;
  description: string;
  memberof?: string;
  ownerName?: string;
  sourceFile: string;
  signature?: string;
  params: DocParam[];
  returns?: string;
  examples: string[];
  defaultValue?: string;
  since?: string;
  tags: DocTag[];
};

type ExtractOutput = {
  packageName: string;
  generatedAt: string;
  entries: DocEntry[];
};

type RenderSection = {
  title: string;
  description: string;
  output: string;
  sidebarTitle?: string;
  excludeNames?: string[];
  memberof?: string[];
  ownerNames?: string[];
  sourceFiles?: string[];
};

type RenderConfig = {
  title: string;
  description: string;
  basePath: string;
  index: {
    title: string;
    description: string;
    intro?: string;
  };
  sections: RenderSection[];
};

function parseArgs(argv: string[]): CliArgs {
  const [command, ...rest] = argv;
  if (command !== "extract" && command !== "render") {
    throw new Error("Usage: extract-jsdoc.ts <extract|render> [options]");
  }

  const args: CliArgs = { command };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    const next = rest[i + 1];
    if (!arg.startsWith("--")) continue;
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for ${arg}`);
    }
    if (arg === "--package") args.packageName = next;
    if (arg === "--entry") args.entries = next.split(",").map((part) => part.trim()).filter(Boolean);
    if (arg === "--output") args.output = next;
    if (arg === "--input") args.input = next;
    if (arg === "--config") args.config = next;
    i++;
  }
  return args;
}

function toPosix(value: string) {
  return value.split(path.sep).join("/");
}

function ensureText(value: string | undefined) {
  return value?.trim() ?? "";
}

function normalizeWhitespace(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

function formatTagText(tag: ReturnType<JSDoc["getTags"]>[number]) {
  const text = tag.getCommentText();
  if (typeof text === "string") return text.trim();
  if (Array.isArray(text)) {
    return text.map((part) => ("text" in part ? part.text : "")).join("").trim();
  }
  return "";
}

function getDocDescription(doc?: JSDoc) {
  if (!doc) return "";
  const text = doc.getCommentText();
  if (typeof text === "string") return normalizeWhitespace(text);
  if (Array.isArray(text)) {
    return normalizeWhitespace(
      text.map((part) => ("text" in part ? part.text : "")).join("")
    );
  }
  return "";
}

function getTagValue(doc: JSDoc | undefined, tagName: string) {
  if (!doc) return undefined;
  const tag = doc.getTags().find((item) => item.getTagName() === tagName);
  return tag ? formatTagText(tag) : undefined;
}

function getParamTagMap(doc: JSDoc | undefined) {
  const map = new Map<string, DocParam>();
  if (!doc) return map;
  for (const tag of doc.getTags()) {
    if (tag.getTagName() !== "param") continue;
    const structure = tag.getStructure();
    const name = structure.name ?? "";
    const text = formatTagText(tag);
    map.set(name, {
      name,
      type: structure.typeExpression?.getText(),
      description: text,
      optional: structure.isBracketed,
    });
  }
  return map;
}

function getReturnsText(doc: JSDoc | undefined) {
  if (!doc) return undefined;
  const tag = doc
    .getTags()
    .find((item) => ["returns", "return"].includes(item.getTagName()));
  return tag ? formatTagText(tag) : undefined;
}

function inferParams(node: Node, doc?: JSDoc): DocParam[] {
  const tagMap = getParamTagMap(doc);
  if (
    Node.isMethodDeclaration(node) ||
    Node.isMethodSignature(node) ||
    Node.isFunctionDeclaration(node)
  ) {
    return node.getParameters().map((param) => {
      const name = param.getName();
      const tagged = tagMap.get(name);
      return {
        name,
        type: param.getTypeNode()?.getText() ?? tagged?.type,
        description: tagged?.description ?? "",
        optional: param.isOptional() || tagged?.optional,
      };
    });
  }
  return [...tagMap.values()];
}

function inferSignature(node: Node, doc?: JSDoc) {
  const explicitMethod = getTagValue(doc, "method");
  const explicitProp = getTagValue(doc, "prop");
  if (explicitMethod) return explicitMethod;
  if (explicitProp) return explicitProp;

  if (
    Node.isMethodDeclaration(node) ||
    Node.isMethodSignature(node) ||
    Node.isFunctionDeclaration(node)
  ) {
    const params = node
      .getParameters()
      .map((param) => {
        const optional = param.isOptional() ? "?" : "";
        const type = param.getTypeNode()?.getText();
        return `${param.getName()}${optional}${type ? `: ${type}` : ""}`;
      })
      .join(", ");
    const name = node.getName() ?? "anonymous";
    const returnType = node.getReturnTypeNode()?.getText();
    return `${name}(${params})${returnType ? `: ${returnType}` : ""}`;
  }

  if (
    Node.isPropertyDeclaration(node) ||
    Node.isPropertySignature(node) ||
    Node.isGetAccessorDeclaration(node) ||
    Node.isSetAccessorDeclaration(node)
  ) {
    const name = node.getName();
    const type = "getTypeNode" in node ? node.getTypeNode()?.getText() : undefined;
    return type ? `${name}: ${type}` : name;
  }

  return undefined;
}

function inferKind(node: Node) {
  if (Node.isMethodDeclaration(node) || Node.isMethodSignature(node)) return "method";
  if (Node.isGetAccessorDeclaration(node)) return "getter";
  if (Node.isSetAccessorDeclaration(node)) return "setter";
  if (Node.isPropertyDeclaration(node) || Node.isPropertySignature(node)) return "property";
  if (Node.isFunctionDeclaration(node)) return "function";
  return node.getKindName().toLowerCase();
}

function getOwnerName(node: Node) {
  const parent = node.getParent();
  if (!parent) return undefined;
  if (
    Node.isClassDeclaration(parent) ||
    Node.isClassExpression(parent) ||
    Node.isInterfaceDeclaration(parent)
  ) {
    return parent.getName();
  }
  return getOwnerName(parent);
}

function isClassMember(node: Node) {
  const parent = node.getParent();
  return !!parent && (Node.isClassDeclaration(parent) || Node.isClassExpression(parent));
}

function hasNonPublicModifier(node: Node) {
  if (
    Node.isMethodDeclaration(node) ||
    Node.isPropertyDeclaration(node) ||
    Node.isGetAccessorDeclaration(node) ||
    Node.isSetAccessorDeclaration(node)
  ) {
    return node.hasModifier(ts.SyntaxKind.PrivateKeyword) || node.hasModifier(ts.SyntaxKind.ProtectedKeyword);
  }
  return false;
}

function hasInternalName(node: Node) {
  if (!("getName" in node) || typeof node.getName !== "function") return false;
  const name = node.getName();
  return typeof name === "string" && name.startsWith("_");
}

function buildEntry(node: Node, sourceFile: SourceFile, cwd: string): DocEntry | null {
  if (hasNonPublicModifier(node)) return null;
  if (isClassMember(node) && hasInternalName(node)) return null;

  const docs = node.getJsDocs?.() ?? [];
  if (!docs.length) return null;

  const primaryDoc = docs[docs.length - 1];
  const description = getDocDescription(primaryDoc);
  const title = getTagValue(primaryDoc, "title");
  const memberof = getTagValue(primaryDoc, "memberof");
  const sourcePath = toPosix(path.relative(cwd, sourceFile.getFilePath()));

  const name =
    ("getName" in node && typeof node.getName === "function" && node.getName()) ||
    title ||
    "anonymous";

  const tags = primaryDoc.getTags().map((tag) => ({
    name: tag.getTagName(),
    text: formatTagText(tag),
  }));

  const examples = primaryDoc
    .getTags()
    .filter((tag) => tag.getTagName() === "example")
    .map((tag) => formatTagText(tag))
    .filter(Boolean);

  return {
    id: `${sourcePath}:${name}:${inferKind(node)}`,
    name,
    kind: inferKind(node),
    title: title || undefined,
    description,
    memberof: memberof || undefined,
    ownerName: getOwnerName(node),
    sourceFile: sourcePath,
    signature: inferSignature(node, primaryDoc),
    params: inferParams(node, primaryDoc),
    returns: getReturnsText(primaryDoc),
    examples,
    defaultValue: getTagValue(primaryDoc, "default"),
    since: getTagValue(primaryDoc, "since"),
    tags,
  };
}

function collectDocumentedNodes(sourceFile: SourceFile, cwd: string) {
  const entries: DocEntry[] = [];

  const visit = (node: Node) => {
    if (
      Node.isMethodDeclaration(node) ||
      Node.isMethodSignature(node) ||
      Node.isPropertyDeclaration(node) ||
      Node.isPropertySignature(node) ||
      Node.isGetAccessorDeclaration(node) ||
      Node.isSetAccessorDeclaration(node) ||
      Node.isFunctionDeclaration(node)
    ) {
      const entry = buildEntry(node, sourceFile, cwd);
      if (entry) entries.push(entry);
    }
    node.forEachChild(visit);
  };

  visit(sourceFile);
  return entries;
}

async function extract(args: CliArgs) {
  if (!args.packageName || !args.entries?.length || !args.output) {
    throw new Error("extract requires --package, --entry, and --output");
  }

  const cwd = process.cwd();
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      allowJs: false,
      target: ts.ScriptTarget.ES2022,
    },
  });

  for (const entry of args.entries) {
    const entryGlob = path.join(entry, "**/*.ts");
    project.addSourceFilesAtPaths(entryGlob);
  }

  const entries = project
    .getSourceFiles()
    .flatMap((sourceFile) => collectDocumentedNodes(sourceFile, cwd))
    .sort((a, b) => a.sourceFile.localeCompare(b.sourceFile) || a.name.localeCompare(b.name));

  const payload: ExtractOutput = {
    packageName: args.packageName,
    generatedAt: new Date().toISOString(),
    entries,
  };

  await mkdir(path.dirname(args.output), { recursive: true });
  await writeFile(args.output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function formatParam(param: DocParam) {
  const optional = param.optional ? "?" : "";
  const type = param.type ? `: \`${param.type}\`` : "";
  const description = param.description ? ` ${param.description}` : "";
  return `- \`${param.name}${optional}\`${type}${description}`;
}

function unwrapExample(example: string) {
  const trimmed = example.trim();
  const fenced = trimmed.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```$/);
  return fenced ? fenced[1].trim() : trimmed;
}

function renderEntry(entry: DocEntry) {
  const lines: string[] = [];
  const heading = entry.title || entry.name;
  lines.push(`## ${heading}`);
  lines.push("");

  if (entry.description) {
    lines.push(entry.description);
    lines.push("");
  }

  lines.push(`- Source: \`${entry.sourceFile}\``);
  lines.push(`- Kind: \`${entry.kind}\``);
  if (entry.memberof) lines.push(`- Member of: \`${entry.memberof}\``);
  if (entry.ownerName) lines.push(`- Defined in: \`${entry.ownerName}\``);
  if (entry.since) lines.push(`- Since: \`${entry.since}\``);
  lines.push("");

  if (entry.signature) {
    lines.push("### Signature");
    lines.push("");
    lines.push("```ts");
    lines.push(entry.signature);
    lines.push("```");
    lines.push("");
  }

  if (entry.params.length) {
    lines.push("### Parameters");
    lines.push("");
    lines.push(...entry.params.map(formatParam));
    lines.push("");
  }

  if (entry.returns) {
    lines.push("### Returns");
    lines.push("");
    lines.push(entry.returns);
    lines.push("");
  }

  if (entry.defaultValue) {
    lines.push("### Default");
    lines.push("");
    lines.push("```ts");
    lines.push(entry.defaultValue);
    lines.push("```");
    lines.push("");
  }

  if (entry.examples.length) {
    lines.push("### Examples");
    lines.push("");
    for (const example of entry.examples) {
      lines.push("```ts");
      lines.push(unwrapExample(example));
      lines.push("```");
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}

function matchesSection(entry: DocEntry, section: RenderSection) {
  const hasExcludeMatch =
    !section.excludeNames?.length || !section.excludeNames.includes(entry.name);
  const hasMemberofMatch =
    !section.memberof?.length || section.memberof.includes(entry.memberof ?? "");
  const hasOwnerMatch =
    !section.ownerNames?.length || section.ownerNames.includes(entry.ownerName ?? "");
  const hasSourceMatch =
    !section.sourceFiles?.length ||
    section.sourceFiles.some((sourceFile) => entry.sourceFile.endsWith(sourceFile));
  return hasExcludeMatch && hasMemberofMatch && hasOwnerMatch && hasSourceMatch;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeOwnerName(value?: string) {
  if (!value) return "";
  return value.replace(/^I(?=[A-Z])/, "").replace(/Mixin$/, "");
}

function dedupeEntries(entries: DocEntry[]) {
  const map = new Map<string, DocEntry>();
  for (const entry of entries) {
    const key = [
      entry.sourceFile,
      entry.kind,
      entry.title || "",
      entry.signature || entry.name,
      normalizeOwnerName(entry.ownerName),
    ].join("|");
    const current = map.get(key);
    if (!current) {
      map.set(key, entry);
      continue;
    }
    const currentScore = (current.description?.length ?? 0) + current.examples.length * 20;
    const nextScore = (entry.description?.length ?? 0) + entry.examples.length * 20;
    if (nextScore > currentScore) {
      map.set(key, entry);
    }
  }
  return [...map.values()];
}

async function render(args: CliArgs) {
  if (!args.input || !args.config || !args.output) {
    throw new Error("render requires --input, --config, and --output");
  }

  const payload = JSON.parse(await readFile(args.input, "utf8")) as ExtractOutput;
  const config = JSON.parse(await readFile(args.config, "utf8")) as RenderConfig;
  await mkdir(args.output, { recursive: true });

  const indexSections = config.sections.map((section) => ({
    ...section,
    href: `/${config.basePath}/${section.output.replace(/\.md$/, "")}`,
  }));

  const indexLines = [
    "---",
    `title: "${config.index.title}"`,
    `description: "${config.index.description}"`,
    "---",
    "",
    `# ${config.index.title}`,
    "",
    config.index.intro ?? config.description,
    "",
    "## Pages",
    "",
    ...indexSections.map(
      (section) => `- [${section.title}](${section.href})`
    ),
    "",
  ];
  await writeFile(path.join(args.output, "index.md"), indexLines.join("\n"), "utf8");

  for (const section of config.sections) {
    const entries = dedupeEntries(
      payload.entries.filter((entry) => matchesSection(entry, section))
    )
      .sort(
        (a, b) =>
          (a.title || a.name).localeCompare(b.title || b.name) ||
          a.sourceFile.localeCompare(b.sourceFile)
      );

    const lines: string[] = [
      "---",
      `title: "${section.title}"`,
      `description: "${section.description}"`,
      "---",
      "",
      `# ${section.title}`,
      "",
      section.description,
      "",
    ];

    if (!entries.length) {
      lines.push("No documented members matched this category yet.");
      lines.push("");
    } else {
      lines.push("## Members");
      lines.push("");
      lines.push(
        ...entries.map((entry) => `- [${entry.title || entry.name}](#${slugify(entry.title || entry.name)})`)
      );
      lines.push("");
      for (const entry of entries) {
        lines.push(renderEntry(entry));
        lines.push("");
      }
    }

    await writeFile(path.join(args.output, section.output), lines.join("\n"), "utf8");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "extract") {
    await extract(args);
    return;
  }
  await render(args);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
