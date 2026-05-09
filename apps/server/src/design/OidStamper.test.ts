import { describe, expect, test } from "bun:test";

import { stampSource } from "./OidStamper";

describe("OidStamper", () => {
  test("adds data-oid to a simple JSX element", () => {
    const src = `export const App = () => <div>hi</div>;\n`;
    const result = stampSource(src, "src/App.tsx");
    expect(result.changed).toBe(true);
    expect(result.source).toMatch(/data-oid="[a-f0-9]{10}"/);
    expect(result.locations).toHaveLength(1);
    expect(result.locations[0]?.elementName).toBe("div");
  });

  test("is deterministic across re-runs of unchanged source", () => {
    const src = `export const A = () => (<div><span>x</span></div>);\n`;
    const a = stampSource(src, "src/A.tsx");
    const b = stampSource(a.source, "src/A.tsx");
    expect(b.changed).toBe(false);
    expect(b.source).toBe(a.source);
    expect(b.locations.map((l) => l.oid)).toEqual(a.locations.map((l) => l.oid));
  });

  test("preserves existing data-oid attributes", () => {
    const src = `const X = () => <div data-oid="custom-xyz">a</div>;\n`;
    const result = stampSource(src, "src/X.tsx");
    expect(result.source).toMatch(/data-oid="custom-xyz"/);
    expect(result.locations[0]?.oid).toBe("custom-xyz");
  });

  test("stamps multiple elements with distinct oids", () => {
    const src = `const Y = () => (
      <div>
        <span>a</span>
        <span>b</span>
      </div>
    );\n`;
    const result = stampSource(src, "src/Y.tsx");
    expect(result.locations.length).toBe(3);
    const oids = new Set(result.locations.map((l) => l.oid));
    expect(oids.size).toBe(3);
  });

  test("uses relPath as part of the hash (different files, same position, different oids)", () => {
    const src = `const Z = () => <div>x</div>;\n`;
    const a = stampSource(src, "src/a.tsx");
    const b = stampSource(src, "src/b.tsx");
    expect(a.locations[0]?.oid).not.toBe(b.locations[0]?.oid);
  });

  test("returns input unchanged when file isn't parseable", () => {
    const garbage = "@@@not valid jsx@@@";
    const result = stampSource(garbage, "src/bad.tsx");
    expect(result.changed).toBe(false);
    expect(result.source).toBe(garbage);
    expect(result.locations).toHaveLength(0);
  });

  test("handles namespaced and member JSX element names", () => {
    const src = `
      const Named = () => (
        <div>
          <Foo.Bar baz="x" />
          <svg:rect />
        </div>
      );
    `;
    const result = stampSource(src, "src/Named.tsx");
    const names = result.locations.map((l) => l.elementName);
    expect(names).toContain("Foo.Bar");
    expect(names).toContain("svg:rect");
  });

  test("ts-only file with generics parses fine", () => {
    const src = `
      export function Box<T>(props: { v: T }) {
        return <span>{String(props.v)}</span>;
      }
    `;
    const result = stampSource(src, "src/Box.tsx");
    expect(result.changed).toBe(true);
    expect(result.locations.some((l) => l.elementName === "span")).toBe(true);
  });
});
