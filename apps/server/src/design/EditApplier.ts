/**
 * EditApplier — given a source file, an OID, and an edit op, mutate the AST,
 * emit the new source, and report the post-edit OID location.
 *
 * Phase 3 ops:
 *   - setText: replace the first text-ish child of the targeted JSXElement
 *   - setClassName: overwrite (or remove) the className prop value
 *
 * The applier matches elements by the `data-oid` attribute value — the same
 * attribute `OidStamper` writes. Every source-of-truth edit round-trips
 * through the stamper first so OIDs are guaranteed present.
 */
import generateExport from "@babel/generator";
import { parse } from "@babel/parser";
import traverseExport from "@babel/traverse";
import type * as t from "@babel/types";

const generate =
  (generateExport as unknown as { default?: typeof generateExport }).default ??
  (generateExport as unknown as typeof generateExport);
const traverse =
  (traverseExport as unknown as { default?: typeof traverseExport }).default ??
  (traverseExport as unknown as typeof traverseExport);

export type EditOp =
  | { readonly kind: "setText"; readonly text: string }
  | { readonly kind: "setClassName"; readonly className: string | null }
  | { readonly kind: "delete" }
  | { readonly kind: "duplicate" }
  | { readonly kind: "move"; readonly beforeOid: string | null }
  | {
      readonly kind: "insert";
      readonly tag: string;
      readonly position: "inside" | "before" | "after";
      readonly className?: string | null | undefined;
      readonly text?: string | undefined;
    };

export interface EditResult {
  /** The possibly-mutated source. Identical to input when `changed` is false. */
  readonly source: string;
  readonly changed: boolean;
  /**
   * Post-edit location of the targeted JSXOpeningElement in the new source.
   * Null when the OID was not found in this file.
   */
  readonly location: {
    readonly line: number;
    readonly col: number;
    readonly elementName: string;
  } | null;
}

const OID_ATTRIBUTE = "data-oid";
const CLASS_ATTRIBUTE = "className";

function jsxNameToString(
  node: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName,
): string {
  if (node.type === "JSXIdentifier") return node.name;
  if (node.type === "JSXNamespacedName") {
    return `${node.namespace.name}:${node.name.name}`;
  }
  const parts: string[] = [];
  let current: t.JSXMemberExpression | t.JSXIdentifier = node;
  while (current.type === "JSXMemberExpression") {
    parts.unshift(current.property.name);
    current = current.object as t.JSXMemberExpression | t.JSXIdentifier;
  }
  parts.unshift(current.name);
  return parts.join(".");
}

function elementOid(opening: t.JSXOpeningElement): string | null {
  for (const attr of opening.attributes) {
    if (
      attr.type === "JSXAttribute" &&
      attr.name.type === "JSXIdentifier" &&
      attr.name.name === OID_ATTRIBUTE &&
      attr.value &&
      attr.value.type === "StringLiteral"
    ) {
      return attr.value.value;
    }
  }
  return null;
}

function applySetClassName(opening: t.JSXOpeningElement, className: string | null): boolean {
  const idx = opening.attributes.findIndex(
    (a) =>
      a.type === "JSXAttribute" &&
      a.name.type === "JSXIdentifier" &&
      a.name.name === CLASS_ATTRIBUTE,
  );

  if (className === null) {
    if (idx === -1) return false;
    opening.attributes.splice(idx, 1);
    return true;
  }

  const nextAttr: t.JSXAttribute = {
    type: "JSXAttribute",
    name: { type: "JSXIdentifier", name: CLASS_ATTRIBUTE },
    value: { type: "StringLiteral", value: className },
  } as t.JSXAttribute;

  if (idx === -1) {
    opening.attributes.push(nextAttr);
    return true;
  }

  const existing = opening.attributes[idx];
  if (
    existing &&
    existing.type === "JSXAttribute" &&
    existing.value &&
    existing.value.type === "StringLiteral" &&
    existing.value.value === className
  ) {
    return false;
  }
  opening.attributes[idx] = nextAttr;
  return true;
}

function cloneJsxElement(element: t.JSXElement): t.JSXElement {
  // Strip `data-oid` on the clone so the re-stamp assigns a fresh id.
  const cloned = JSON.parse(JSON.stringify(element)) as t.JSXElement;
  const opening = cloned.openingElement;
  opening.attributes = opening.attributes.filter(
    (attr) =>
      !(
        attr.type === "JSXAttribute" &&
        attr.name.type === "JSXIdentifier" &&
        attr.name.name === OID_ATTRIBUTE
      ),
  );
  // Drop location info so generator re-emits fresh positions.
  stripLocations(cloned);
  return cloned;
}

function stripLocations(node: unknown): void {
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  if ("loc" in record) record.loc = null;
  if ("start" in record) record.start = null;
  if ("end" in record) record.end = null;
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (Array.isArray(value)) {
      for (const item of value) stripLocations(item);
    } else if (value && typeof value === "object") {
      stripLocations(value);
    }
  }
}

function buildJsxElement(
  tag: string,
  className: string | null | undefined,
  text: string | undefined,
): t.JSXElement {
  const attributes: t.JSXAttribute[] = [];
  if (className != null) {
    attributes.push({
      type: "JSXAttribute",
      name: { type: "JSXIdentifier", name: CLASS_ATTRIBUTE },
      value: { type: "StringLiteral", value: className },
    } as t.JSXAttribute);
  }
  const children: (t.JSXText | t.JSXElement)[] =
    text && text.length > 0 ? [{ type: "JSXText", value: text } as t.JSXText] : [];
  const el: t.JSXElement = {
    type: "JSXElement",
    openingElement: {
      type: "JSXOpeningElement",
      name: { type: "JSXIdentifier", name: tag },
      attributes,
      selfClosing: children.length === 0,
    } as t.JSXOpeningElement,
    closingElement:
      children.length === 0
        ? null
        : ({
            type: "JSXClosingElement",
            name: { type: "JSXIdentifier", name: tag },
          } as t.JSXClosingElement),
    children,
    selfClosing: children.length === 0,
  } as t.JSXElement;
  return el;
}

function parentChildren(
  parentNode: t.JSXElement | t.JSXFragment | null,
):
  | (t.JSXElement | t.JSXFragment | t.JSXExpressionContainer | t.JSXSpreadChild | t.JSXText)[]
  | null {
  if (!parentNode) return null;
  if (parentNode.type === "JSXElement") return parentNode.children;
  if (parentNode.type === "JSXFragment") return parentNode.children;
  return null;
}

function findChildIndexByOid(children: readonly unknown[], oid: string): number {
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child && typeof child === "object" && (child as { type?: string }).type === "JSXElement") {
      const el = child as t.JSXElement;
      if (elementOid(el.openingElement) === oid) return i;
    }
  }
  return -1;
}

function applySetText(element: t.JSXElement, text: string): boolean {
  // Strategy: replace the entire `children` array with a single JSXText (or
  // empty array if text is empty). This is the simplest correct behaviour for
  // user-driven inline edits. Dynamic expression children (`{count}`) are
  // clobbered — that's acceptable for Phase 3; richer merging lands in
  // Phase 4 / Onlook-parser vendor.
  const existingOnlyText =
    element.children.length === 1 &&
    element.children[0] &&
    element.children[0].type === "JSXText" &&
    element.children[0].value === text;
  if (existingOnlyText) return false;

  if (text === "") {
    if (element.children.length === 0) return false;
    element.children = [];
    return true;
  }

  element.children = [{ type: "JSXText", value: text } as t.JSXText];
  return true;
}

export function applyEditToSource(
  source: string,
  relPath: string,
  oid: string,
  op: EditOp,
): EditResult {
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
    return { source, changed: false, location: null };
  }

  let changed = false;
  let location: EditResult["location"] = null;
  let found = false;

  traverse(ast, {
    JSXElement(path) {
      if (found) return;
      const opening = path.node.openingElement;
      if (elementOid(opening) !== oid) return;
      found = true;

      const loc = opening.loc;
      const elementName = jsxNameToString(opening.name);
      location = loc
        ? { line: loc.start.line, col: loc.start.column, elementName }
        : { line: 0, col: 0, elementName };

      if (op.kind === "setClassName") {
        if (applySetClassName(opening, op.className)) changed = true;
      } else if (op.kind === "setText") {
        if (applySetText(path.node, op.text)) changed = true;
      } else if (op.kind === "delete") {
        const parentNode = path.parent;
        if (parentNode && (parentNode.type === "JSXElement" || parentNode.type === "JSXFragment")) {
          const children = parentChildren(parentNode);
          if (children) {
            const idx = children.indexOf(path.node);
            if (idx !== -1) {
              children.splice(idx, 1);
              changed = true;
              location = null;
            }
          }
        }
      } else if (op.kind === "duplicate") {
        const parentNode = path.parent;
        if (parentNode && (parentNode.type === "JSXElement" || parentNode.type === "JSXFragment")) {
          const children = parentChildren(parentNode);
          if (children) {
            const idx = children.indexOf(path.node);
            if (idx !== -1) {
              const clone = cloneJsxElement(path.node);
              children.splice(idx + 1, 0, clone);
              changed = true;
            }
          }
        }
      } else if (op.kind === "move") {
        const parentNode = path.parent;
        if (parentNode && (parentNode.type === "JSXElement" || parentNode.type === "JSXFragment")) {
          const children = parentChildren(parentNode);
          if (children) {
            const fromIdx = children.indexOf(path.node);
            if (fromIdx !== -1) {
              const node = children[fromIdx];
              if (!node) return;
              if (op.beforeOid === null) {
                children.splice(fromIdx, 1);
                children.push(node);
                changed = fromIdx !== children.length - 1;
              } else {
                const targetSiblingIdx = findChildIndexByOid(children, op.beforeOid);
                if (
                  targetSiblingIdx !== -1 &&
                  targetSiblingIdx !== fromIdx &&
                  targetSiblingIdx !== fromIdx + 1
                ) {
                  children.splice(fromIdx, 1);
                  const adjustedIdx =
                    targetSiblingIdx > fromIdx ? targetSiblingIdx - 1 : targetSiblingIdx;
                  children.splice(adjustedIdx, 0, node);
                  changed = true;
                }
              }
            }
          }
        }
      } else if (op.kind === "insert") {
        const newEl = buildJsxElement(op.tag, op.className ?? null, op.text);
        if (op.position === "inside") {
          path.node.children.push(newEl);
          if (path.node.openingElement.selfClosing) {
            path.node.openingElement.selfClosing = false;
            path.node.selfClosing = false;
            path.node.closingElement = {
              type: "JSXClosingElement",
              name: JSON.parse(
                JSON.stringify(path.node.openingElement.name),
              ) as t.JSXClosingElement["name"],
            } as t.JSXClosingElement;
          }
          changed = true;
        } else {
          const parentNode = path.parent;
          if (
            parentNode &&
            (parentNode.type === "JSXElement" || parentNode.type === "JSXFragment")
          ) {
            const children = parentChildren(parentNode);
            if (children) {
              const idx = children.indexOf(path.node);
              if (idx !== -1) {
                const insertIdx = op.position === "before" ? idx : idx + 1;
                children.splice(insertIdx, 0, newEl);
                changed = true;
              }
            }
          }
        }
      }
      path.stop();
    },
  });

  if (!changed) {
    return { source, changed: false, location };
  }

  const output = generate(ast, {
    retainLines: true,
    retainFunctionParens: true,
    jsescOption: { minimal: true },
  });
  return { source: output.code, changed: true, location };
}
