import { describe, expect, it } from "bun:test";

import { applyEditToSource } from "./EditApplier";
import { stampSource } from "./OidStamper";

function stampAndGetFirstOid(source: string, relPath: string) {
  const { source: stamped, locations } = stampSource(source, relPath);
  const first = locations[0];
  if (!first) throw new Error("stampSource yielded no locations");
  return { stamped, oid: first.oid };
}

describe("applyEditToSource — setText", () => {
  it("replaces a simple text child", () => {
    const src = `export default function App(){ return <h1>Hello</h1>; }`;
    const { stamped, oid } = stampAndGetFirstOid(src, "src/App.tsx");
    const result = applyEditToSource(stamped, "src/App.tsx", oid, {
      kind: "setText",
      text: "World",
    });
    expect(result.changed).toBe(true);
    expect(result.source).toContain(">World<");
    expect(result.source).not.toContain(">Hello<");
  });

  it("is idempotent on no-op", () => {
    const src = `export default function App(){ return <h1>Hello</h1>; }`;
    const { stamped, oid } = stampAndGetFirstOid(src, "src/App.tsx");
    const result = applyEditToSource(stamped, "src/App.tsx", oid, {
      kind: "setText",
      text: "Hello",
    });
    expect(result.changed).toBe(false);
    expect(result.source).toBe(stamped);
  });

  it("clears children when text is empty", () => {
    const src = `export default function App(){ return <p>Text here</p>; }`;
    const { stamped, oid } = stampAndGetFirstOid(src, "src/App.tsx");
    const result = applyEditToSource(stamped, "src/App.tsx", oid, {
      kind: "setText",
      text: "",
    });
    expect(result.changed).toBe(true);
    expect(result.source).toContain("<p");
    expect(result.source).not.toContain("Text here");
  });

  it("returns no-change when oid doesn't match", () => {
    const src = `export default function App(){ return <h1>Hello</h1>; }`;
    const { stamped } = stampAndGetFirstOid(src, "src/App.tsx");
    const result = applyEditToSource(stamped, "src/App.tsx", "deadbeef00", {
      kind: "setText",
      text: "Nope",
    });
    expect(result.changed).toBe(false);
    expect(result.location).toBe(null);
    expect(result.source).toBe(stamped);
  });
});

describe("applyEditToSource — setClassName", () => {
  it("adds a className when absent", () => {
    const src = `export default function App(){ return <div>x</div>; }`;
    const { stamped, oid } = stampAndGetFirstOid(src, "src/App.tsx");
    const result = applyEditToSource(stamped, "src/App.tsx", oid, {
      kind: "setClassName",
      className: "p-4 bg-blue-500",
    });
    expect(result.changed).toBe(true);
    expect(result.source).toContain('className="p-4 bg-blue-500"');
  });

  it("replaces an existing className", () => {
    const src = `export default function App(){ return <div className="old">x</div>; }`;
    const { stamped, oid } = stampAndGetFirstOid(src, "src/App.tsx");
    const result = applyEditToSource(stamped, "src/App.tsx", oid, {
      kind: "setClassName",
      className: "new",
    });
    expect(result.changed).toBe(true);
    expect(result.source).toContain('className="new"');
    expect(result.source).not.toContain('className="old"');
  });

  it("removes className when passed null", () => {
    const src = `export default function App(){ return <div className="x">y</div>; }`;
    const { stamped, oid } = stampAndGetFirstOid(src, "src/App.tsx");
    const result = applyEditToSource(stamped, "src/App.tsx", oid, {
      kind: "setClassName",
      className: null,
    });
    expect(result.changed).toBe(true);
    expect(result.source).not.toContain("className=");
  });

  it("is idempotent when className is already equal", () => {
    const src = `export default function App(){ return <div className="keep">x</div>; }`;
    const { stamped, oid } = stampAndGetFirstOid(src, "src/App.tsx");
    const result = applyEditToSource(stamped, "src/App.tsx", oid, {
      kind: "setClassName",
      className: "keep",
    });
    expect(result.changed).toBe(false);
  });
});

describe("applyEditToSource — targeting", () => {
  it("only mutates the element whose OID matches", () => {
    const src = `
export default function App(){
  return <div><h1>Title</h1><p>Body</p></div>;
}`;
    const { source: stamped, locations } = stampSource(src, "src/App.tsx");
    const h1 = locations.find((l) => l.elementName === "h1");
    if (!h1) throw new Error("no h1");
    const result = applyEditToSource(stamped, "src/App.tsx", h1.oid, {
      kind: "setText",
      text: "Renamed",
    });
    expect(result.changed).toBe(true);
    expect(result.source).toContain(">Renamed<");
    expect(result.source).toContain(">Body<");
  });
});

describe("applyEditToSource — delete", () => {
  it("removes the targeted element from its parent", () => {
    const src = `export default function App(){ return <div><h1>A</h1><p>B</p></div>; }`;
    const { source: stamped, locations } = stampSource(src, "src/App.tsx");
    const h1 = locations.find((l) => l.elementName === "h1");
    if (!h1) throw new Error("no h1");
    const result = applyEditToSource(stamped, "src/App.tsx", h1.oid, { kind: "delete" });
    expect(result.changed).toBe(true);
    expect(result.source).not.toContain(">A<");
    expect(result.source).toContain(">B<");
  });

  it("no-ops when OID is unknown", () => {
    const src = `export default function App(){ return <div>x</div>; }`;
    const { stamped } = stampAndGetFirstOid(src, "src/App.tsx");
    const result = applyEditToSource(stamped, "src/App.tsx", "ffffffffff", { kind: "delete" });
    expect(result.changed).toBe(false);
  });
});

describe("applyEditToSource — duplicate", () => {
  it("inserts a clone as the next sibling without the original data-oid", () => {
    const src = `export default function App(){ return <ul><li>one</li></ul>; }`;
    const { source: stamped, locations } = stampSource(src, "src/App.tsx");
    const li = locations.find((l) => l.elementName === "li");
    if (!li) throw new Error("no li");
    const result = applyEditToSource(stamped, "src/App.tsx", li.oid, { kind: "duplicate" });
    expect(result.changed).toBe(true);
    const matches = result.source.match(/<li/g) ?? [];
    expect(matches.length).toBe(2);
    // Clone should not carry the original OID — it gets stamped on the next re-stamp pass.
    const liOidMatches = result.source.match(/<li[^>]*data-oid="/g) ?? [];
    expect(liOidMatches.length).toBe(1);
  });
});

describe("applyEditToSource — move", () => {
  it("reorders before an identified sibling", () => {
    const src = `export default function App(){ return <ul><li>A</li><li>B</li><li>C</li></ul>; }`;
    const { source: stamped, locations } = stampSource(src, "src/App.tsx");
    const lis = locations.filter((l) => l.elementName === "li");
    expect(lis.length).toBe(3);
    const first = lis[0];
    const last = lis[2];
    if (!first || !last) throw new Error("need 3 lis");
    // Move the last li before the first (source order: A, B, C → C, A, B).
    const result = applyEditToSource(stamped, "src/App.tsx", last.oid, {
      kind: "move",
      beforeOid: first.oid,
    });
    expect(result.changed).toBe(true);
    const aIdx = result.source.indexOf(">A<");
    const cIdx = result.source.indexOf(">C<");
    expect(cIdx).toBeLessThan(aIdx);
  });

  it("moves to end when beforeOid is null", () => {
    const src = `export default function App(){ return <ul><li>A</li><li>B</li><li>C</li></ul>; }`;
    const { source: stamped, locations } = stampSource(src, "src/App.tsx");
    const lis = locations.filter((l) => l.elementName === "li");
    const first = lis[0];
    if (!first) throw new Error("need first li");
    const result = applyEditToSource(stamped, "src/App.tsx", first.oid, {
      kind: "move",
      beforeOid: null,
    });
    expect(result.changed).toBe(true);
    const aIdx = result.source.indexOf(">A<");
    const cIdx = result.source.indexOf(">C<");
    expect(cIdx).toBeLessThan(aIdx);
  });
});

describe("applyEditToSource — insert", () => {
  it("inserts a child element when position is inside", () => {
    const src = `export default function App(){ return <div>x</div>; }`;
    const { stamped, oid } = stampAndGetFirstOid(src, "src/App.tsx");
    const result = applyEditToSource(stamped, "src/App.tsx", oid, {
      kind: "insert",
      tag: "span",
      position: "inside",
      className: "new",
      text: "hi",
    });
    expect(result.changed).toBe(true);
    expect(result.source).toContain('<span className="new">hi</span>');
  });

  it("converts a self-closing element to a pair when inserting inside", () => {
    const src = `export default function App(){ return <div />; }`;
    const { stamped, oid } = stampAndGetFirstOid(src, "src/App.tsx");
    const result = applyEditToSource(stamped, "src/App.tsx", oid, {
      kind: "insert",
      tag: "span",
      position: "inside",
      text: "hi",
    });
    expect(result.changed).toBe(true);
    expect(result.source).toContain("</div>");
    expect(result.source).toContain("<span>hi</span>");
  });

  it("inserts after the target as a sibling", () => {
    const src = `export default function App(){ return <ul><li>A</li></ul>; }`;
    const { source: stamped, locations } = stampSource(src, "src/App.tsx");
    const li = locations.find((l) => l.elementName === "li");
    if (!li) throw new Error("no li");
    const result = applyEditToSource(stamped, "src/App.tsx", li.oid, {
      kind: "insert",
      tag: "li",
      position: "after",
      text: "B",
    });
    expect(result.changed).toBe(true);
    const aIdx = result.source.indexOf(">A<");
    const bIdx = result.source.indexOf(">B<");
    expect(aIdx).toBeGreaterThanOrEqual(0);
    expect(bIdx).toBeGreaterThan(aIdx);
  });
});
