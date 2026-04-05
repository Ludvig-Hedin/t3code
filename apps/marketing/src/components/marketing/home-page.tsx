"use client";

import { SiteFooter } from "./site-footer";
import { SiteNav } from "./site-nav";
import { ProductSurfaceFeatures } from "./product-surface-features";
import { ComparisonSection2 } from "./sections/comparison-section-2";
import { CtaDownloadSection } from "./sections/cta-download-section";
import { CtaIosWaitlistSection } from "./sections/cta-ios-waitlist-section";
import { DownloadStripSection } from "./sections/download-strip-section";
import { FaqSection } from "./sections/faq-section";
import { FeatureVisualSection } from "./sections/feature-visual-section";
import { HeroSection } from "./sections/hero-section";
import { ProductWorkflowSection } from "./sections/product-workflow-section";
import { StatsSection } from "./sections/stats-section";

export function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <main>
        <HeroSection />
        <ProductSurfaceFeatures />
        <ProductWorkflowSection />
        <StatsSection />
        <FeatureVisualSection />
        <ComparisonSection2 />
        <DownloadStripSection />
        <CtaIosWaitlistSection compact showDetailLink />
        <FaqSection />
        <CtaDownloadSection />
      </main>
      <SiteFooter />
    </div>
  );
}
