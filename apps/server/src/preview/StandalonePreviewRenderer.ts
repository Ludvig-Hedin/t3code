import { execFile } from "node:child_process";
import type * as fsPromises from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

import type { StandalonePreviewKind } from "./appDetection";

const DOCX_EXTRACT_TIMEOUT_MS = 30_000;

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

function renderMarkdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const parts: string[] = [];
  let inList = false;

  const closeList = () => {
    if (!inList) return;
    parts.push("</ul>");
    inList = false;
  };

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (trimmed.startsWith("# ")) {
      closeList();
      parts.push(`<h1>${escapeHtml(trimmed.slice(2).trim())}</h1>`);
      continue;
    }
    if (trimmed.startsWith("## ")) {
      closeList();
      parts.push(`<h2>${escapeHtml(trimmed.slice(3).trim())}</h2>`);
      continue;
    }
    if (trimmed.startsWith("### ")) {
      closeList();
      parts.push(`<h3>${escapeHtml(trimmed.slice(4).trim())}</h3>`);
      continue;
    }
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (!inList) {
        parts.push("<ul>");
        inList = true;
      }
      parts.push(`<li>${escapeHtml(trimmed.slice(2).trim())}</li>`);
      continue;
    }

    closeList();
    if (trimmed.length === 0) {
      parts.push('<div class="spacer"></div>');
    } else {
      parts.push(`<p>${escapeHtml(trimmed)}</p>`);
    }
  }

  closeList();

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Markdown Preview</title>
    <style>
      :root { color-scheme: light dark; }
      body {
        margin: 0;
        padding: 32px;
        font: 16px/1.6 system-ui, sans-serif;
        max-width: 900px;
      }
      h1, h2, h3 { line-height: 1.2; }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
      }
      .spacer { height: 1rem; }
    </style>
  </head>
  <body>
    ${parts.join("\n    ")}
  </body>
</html>`;
}

function renderCodePreview(kind: "tsx", source: string, filePath: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(filePath)}</title>
    <style>
      :root { color-scheme: light dark; }
      body {
        margin: 0;
        padding: 24px;
        font: 14px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }
      pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .meta {
        margin-bottom: 16px;
        color: #666;
        font-family: system-ui, sans-serif;
      }
    </style>
  </head>
  <body>
    <div class="meta">${escapeHtml(kind.toUpperCase())} preview for ${escapeHtml(filePath)}. This is a source preview because no runtime app was detected.</div>
    <pre>${escapeHtml(source)}</pre>
  </body>
</html>`;
}

const DOCX_PYTHON = `
import sys, zipfile, xml.etree.ElementTree as ET
from pathlib import Path

path = Path(sys.argv[1])
with zipfile.ZipFile(path) as zf:
    xml = zf.read("word/document.xml")

root = ET.fromstring(xml)
ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
lines = []
for para in root.findall(".//w:p", ns):
    parts = []
    for node in para.findall(".//w:t", ns):
        parts.append(node.text or "")
    line = "".join(parts).strip()
    if line:
        lines.append(line)
print("\\n".join(lines))
`;

async function extractDocxText(filePath: string, fsImpl: typeof fsPromises): Promise<string> {
  try {
    await fsImpl.stat(filePath);
  } catch {
    return Promise.reject(new Error(`DOCX file not accessible: ${filePath}`));
  }

  try {
    const { stdout, stderr } = await execFileAsync("python3", ["-c", DOCX_PYTHON, filePath], {
      encoding: "utf8",
      timeout: DOCX_EXTRACT_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });
    const errText = typeof stderr === "string" ? stderr.trim() : "";
    const outText = typeof stdout === "string" ? stdout : String(stdout ?? "");
    if (errText.length > 0 && outText.trim().length === 0) {
      return Promise.reject(new Error(`python3 docx extract failed: ${errText}`));
    }
    return outText;
  } catch (err) {
    const detail =
      err instanceof Error
        ? err.message
        : typeof err === "object" &&
            err !== null &&
            "stderr" in err &&
            typeof (err as { stderr?: unknown }).stderr === "string"
          ? (err as { stderr: string }).stderr
          : String(err);
    return Promise.reject(new Error(`Failed to extract DOCX text: ${detail}`));
  }
}

export async function createStandaloneRenderer(input: {
  filePath: string;
  kind: StandalonePreviewKind;
  fs: typeof fsPromises;
}): Promise<string> {
  switch (input.kind) {
    case "html": {
      return input.fs.readFile(input.filePath, "utf8");
    }
    case "markdown": {
      const source = await input.fs.readFile(input.filePath, "utf8");
      return renderMarkdownToHtml(source);
    }
    case "tsx": {
      const source = await input.fs.readFile(input.filePath, "utf8");
      return renderCodePreview("tsx", source, input.filePath);
    }
    case "docx": {
      const extractedText = await extractDocxText(input.filePath, input.fs);
      return renderMarkdownToHtml(
        extractedText.length > 0 ? extractedText : "No readable text found in this .docx file.",
      );
    }
    default: {
      const _exhaustive: never = input.kind;
      return Promise.reject(
        new Error(`Unsupported standalone preview kind: ${String(_exhaustive)}`),
      );
    }
  }
}
