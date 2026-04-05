"use client";

import { SiteFooter } from "./site-footer";
import { SiteNav } from "./site-nav";
import { BentoSection } from "./sections/bento-section";
import { ComparisonSection2 } from "./sections/comparison-section-2";
import { FeatureVisualSection } from "./sections/feature-visual-section";
import { ProductWorkflowSection } from "./sections/product-workflow-section";

export function FeaturesPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <main>
        <div className="container mx-auto max-w-3xl px-6 pt-12 pb-6 md:pt-14">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Features
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            One app for Codex, Claude, and Gemini threads (Cursor and OpenCode chats planned), plus
            the usual surfaces—work log, terminal, settings—and how Bird Code sits next to the Codex
            CLI, Cursor, and Claude Code.
          </p>
        </div>
        <BentoSection />
        <ProductWorkflowSection />
        <FeatureVisualSection />
        <ComparisonSection2 />
      </main>
      <SiteFooter />
    </div>
  );
}
