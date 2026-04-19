import { describe, expect, it } from "vitest";

import { createStandaloneRenderer } from "./StandalonePreviewRenderer";

describe("createStandaloneRenderer", () => {
  it("keeps markdown inside inline code spans literal", async () => {
    const html = await createStandaloneRenderer({
      filePath: "/tmp/example.md",
      kind: "markdown",
      fs: {
        readFile: async () =>
          "Inline `*x*` and `[link](https://example.com)`\nCode [link](https://example.com)",
      } as never,
    });

    expect(html).toContain("<code>*x*</code>");
    expect(html).toContain("<code>[link](https://example.com)</code>");
    expect(html).toContain(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">link</a>',
    );
    expect(html).not.toContain("<code><em>x</em></code>");
  });
});
