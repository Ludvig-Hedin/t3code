/**
 * OidStamper — parse JSX/TSX source and add a stable `data-oid` attribute to
 * every JSXOpeningElement that doesn't already have one, emitting a mapping
 * from OID back to `{file, line, col, elementName}`.
 *
 * Phase 2 minimal implementation using @babel/parser + @babel/traverse +
 * @babel/generator directly. Does NOT depend on @onlook/parser — we intentionally
 * deferred vendoring that library until Phase 3 (EditApplier) actually needs
 * its richer AST manipulation surface (setClassName, insert, move, etc.).
 *
 * OID derivation:
 *   OID = first 10 chars of sha256(`<relPath>:<line>:<col>`)
 * This is deterministic across runs — re-stamping a file produces the same OIDs
 * as long as the element positions don't shift. When positions DO shift (edits),
 * the OIDs change, so the source of truth is always `file:line:col`; OIDs are a
 * compact handle for postMessage between runtime and server.
 */
import { createHash } from "node:crypto";

import generateExport from "@babel/generator";
import { parse } from "@babel/parser";
import traverseExport from "@babel/traverse";
import type * as t from "@babel/types";

// @babel/generator and @babel/traverse have an interop quirk between CJS/ESM:
// the default export may be wrapped under `.default` depending on the runtime.
// Normalize to the callable shape.
const generate =
  (generateExport as unknown as { default?: typeof generateExport }).default ??
  (generateExport as unknown as typeof generateExport);
const traverse =
  (traverseExport as unknown as { default?: typeof traverseExport }).default ??
  (traverseExport as unknown as typeof traverseExport);

export interface OidLocation {
  readonly oid: string;
  readonly relPath: string;
  readonly line: number;
  readonly col: number;
  readonly elementName: string;
}

export interface StampResult {
  /** Stamped source. Identical to input when no elements needed stamping. */
  readonly source: string;
  /** One entry per stamped-or-already-stamped JSXOpeningElement. */
  readonly locations: readonly OidLocation[];
  /** True when source was actually mutated. */
  readonly changed: boolean;
}

const OID_ATTRIBUTE = "data-oid";

function jsxNameToString(
  node: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName,
): string {
  if (node.type === "JSXIdentifier") return node.name;
  if (node.type === "JSXNamespacedName") {
    return `${node.namespace.name}:${node.name.name}`;
  }
  // JSXMemberExpression (e.g. Foo.Bar.Baz)
  const parts: string[] = [];
  let current: t.JSXMemberExpression | t.JSXIdentifier = node;
  while (current.type === "JSXMemberExpression") {
    parts.unshift(current.property.name);
    current = current.object as t.JSXMemberExpression | t.JSXIdentifier;
  }
  parts.unshift(current.name);
  return parts.join(".");
}

function makeOid(relPath: string, line: number, col: number): string {
  return createHash("sha256").update(`${relPath}:${line}:${col}`).digest("hex").slice(0, 10);
}

/**
 * Stamp a single source file. Returns the mutated source and the OID mapping.
 *
 * @param relPath Project-relative file path; used as the OID salt so the same
 *   element at the same (line, col) in different projects stamps differently.
 *   Must be stable across stampings of the same file (use a canonical form).
 */
export function stampSource(source: string, relPath: string): StampResult {
  const isTs = relPath.endsWith(".ts") || relPath.endsWith(".tsx");
  let ast: t.File;
  try {
    ast = parse(source, {
      sourceType: "module",
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      allowUndeclaredExports: true,
      plugins: [
        "jsx",
        ...(isTs ? (["typescript"] as const) : (["flow"] as const)),
        "decorators-legacy",
        "importAssertions",
        "topLevelAwait",
      ],
    });
  } catch {
    // Unparseable file — skip. Returning the original source is safe.
    return { source, locations: [], changed: false };
  }

  const locations: OidLocation[] = [];
  const seen = new Set<string>();
  let changed = false;

  traverse(ast, {
    JSXOpeningElement(path) {
      const loc = path.node.loc;
      if (!loc) return;
      const line = loc.start.line;
      const col = loc.start.column;
      const elementName = jsxNameToString(path.node.name);

      // Check for an existing data-oid attribute.
      let existingOid: string | null = null;
      for (const attr of path.node.attributes) {
        if (
          attr.type === "JSXAttribute" &&
          attr.name.type === "JSXIdentifier" &&
          attr.name.name === OID_ATTRIBUTE
        ) {
          if (attr.value && attr.value.type === "StringLiteral") {
            existingOid = attr.value.value;
          }
          break;
        }
      }

      let oid: string;
      if (existingOid && !seen.has(existingOid)) {
        oid = existingOid;
      } else {
        // Generate a fresh OID; if by chance of collision it's already seen,
        // salt with the line/col again (rare). Deterministic mode uses the
        // canonical salt.
        let candidate = makeOid(relPath, line, col);
        let collisionSalt = 0;
        while (seen.has(candidate)) {
          collisionSalt += 1;
          candidate = makeOid(relPath, line, col + collisionSalt);
        }
        oid = candidate;
      }

      seen.add(oid);

      if (!existingOid || existingOid !== oid) {
        // Add or replace the attribute.
        const newAttr: t.JSXAttribute = {
          type: "JSXAttribute",
          name: { type: "JSXIdentifier", name: OID_ATTRIBUTE },
          value: { type: "StringLiteral", value: oid },
        } as t.JSXAttribute;

        const idx = path.node.attributes.findIndex(
          (a) =>
            a.type === "JSXAttribute" &&
            a.name.type === "JSXIdentifier" &&
            a.name.name === OID_ATTRIBUTE,
        );
        if (idx >= 0) {
          path.node.attributes[idx] = newAttr;
        } else {
          path.node.attributes.push(newAttr);
        }
        changed = true;
      }

      locations.push({ oid, relPath, line, col, elementName });
    },
  });

  if (!changed) {
    return { source, locations, changed: false };
  }

  const output = generate(ast, {
    retainLines: true,
    retainFunctionParens: true,
    jsescOption: { minimal: true },
  });
  return { source: output.code, locations, changed: true };
}
