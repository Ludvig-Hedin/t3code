---
title: "Diagnostic Empty States: Actionable Feedback When Detection Fails"
aliases: [empty-state-diagnostics, zero-results-feedback, search-diagnostics]
tags: [ux-pattern, feedback, error-handling, diagnostics]
sources:
  - "daily/2026-04-24.md"
created: 2026-04-24
updated: 2026-04-24
---

# Diagnostic Empty States: Actionable Feedback When Detection Fails

When automated detection systems (file scanners, service discovery, dependency resolution) find nothing, showing "0 results" leaves users questioning whether the tool is broken or their setup is wrong. Diagnostic empty states surface _why_ detection failed: how many locations were checked, what criteria were used, and specific rejection reasons for each candidate. This pattern transforms confusion into actionable debugging information.

## Key Points

- **Show search scope** — "Scanned N locations, found M candidates" demonstrates the tool ran correctly
- **Explain rejection reasons** — List each candidate with why it was rejected ("no dev script", "wrong type")
- **Provide next steps** — Re-scan button, setup instructions, or manual override options
- **Distinguish tool failure from setup failure** — RPC errors appear differently than legitimate "no matches found"
- **Make diagnostics optional** — Backward-compatible field; old clients skip diagnostics, new clients display them

## Details

### The Problem with Silent Empty States

A typical "nothing found" UI:

```tsx
// ❌ UNINFORMATIVE: User doesn't know if tool is broken or setup is incomplete
function EmptyState() {
  return <div>No apps found.</div>;
}
```

User questions:

- Did the scanner run at all?
- Did it check the right directories?
- Why were my apps rejected?
- Is this a bug or expected behavior?

### Diagnostic Empty State Pattern

Enhanced empty state with diagnostics:

```tsx
// ✅ INFORMATIVE: Shows exactly what happened and why
type ScanDiagnostics = {
  scannedDirCount: number;
  packageJsonCount: number;
  rejectionReasons: Array<{ path: string; reason: string }>;
};

function DiagnosticEmptyState({ diagnostics }: { diagnostics: ScanDiagnostics }) {
  const rejectionReasons = diagnostics.rejectionReasons ?? [];

  return (
    <div className="diagnostic-empty">
      <h3>No apps detected</h3>

      {/* Search scope */}
      <div className="scope">
        <p>✓ Scanned {diagnostics.scannedDirCount} directories</p>
        <p>✓ Found {diagnostics.packageJsonCount} package.json files</p>
      </div>

      {/* Rejection details */}
      {rejectionReasons.length > 0 && (
        <div className="rejections">
          <h4>Why candidates were rejected:</h4>
          <ul>
            {rejectionReasons.map((r, i) => (
              <li key={i}>
                <code>{r.path}</code>
                <span className="reason">{r.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Next steps */}
      <div className="actions">
        <Button onClick={handleRescan}>Re-scan</Button>
        <Button variant="secondary" onClick={openDocs}>
          Setup Guide
        </Button>
      </div>
    </div>
  );
}
```

### Rejection Reason Taxonomy

Common rejection reasons with user-friendly messages:

```typescript
const REJECTION_REASONS = {
  NO_REACT: "no react dependency",
  NO_DEV_SCRIPT: "no dev script (needs 'dev' or 'start')",
  LIBRARY_PACKAGE: "library package (not runnable)",
  WRONG_TYPE: "not a browser app",
  INVALID_CONFIG: "package.json parse error",
  PERMISSION_DENIED: "cannot read directory",
};

function formatRejection(candidate: Candidate, reason: keyof typeof REJECTION_REASONS): Rejection {
  return {
    path: candidate.relativePath,
    reason: REJECTION_REASONS[reason],
  };
}
```

### Server-Side Diagnostic Collection

Scanners collect diagnostics during traversal:

```typescript
async function scanWithDiagnostics(
  projectRoot: string,
): Promise<{ apps: App[]; diagnostics: Diagnostics }> {
  const diagnostics: Diagnostics = {
    scannedDirCount: 0,
    packageJsonCount: 0,
    rejectionReasons: [],
  };

  const apps: App[] = [];

  for (const pattern of SCAN_PATTERNS) {
    const dirs = await glob(pattern, { cwd: projectRoot });
    diagnostics.scannedDirCount += dirs.length;

    for (const dir of dirs) {
      const pkgPath = path.join(dir, "package.json");

      try {
        const pkg = await readPackageJson(pkgPath);
        diagnostics.packageJsonCount++;

        // Validation checks
        if (!hasReact(pkg)) {
          diagnostics.rejectionReasons.push({
            path: path.relative(projectRoot, pkgPath),
            reason: "no react",
          });
          continue;
        }

        if (!hasDevScript(pkg)) {
          diagnostics.rejectionReasons.push({
            path: path.relative(projectRoot, pkgPath),
            reason: "no dev script",
          });
          continue;
        }

        if (isLibraryPackage(pkgPath)) {
          diagnostics.rejectionReasons.push({
            path: path.relative(projectRoot, pkgPath),
            reason: "library package",
          });
          continue;
        }

        // Passed all checks
        apps.push({ id: pkg.name, path: pkgPath });
      } catch (error) {
        diagnostics.rejectionReasons.push({
          path: path.relative(projectRoot, pkgPath),
          reason: error instanceof Error ? error.message : "read error",
        });
      }
    }
  }

  return { apps, diagnostics };
}
```

### Client-Side Display

Client receives diagnostics and renders conditionally:

```tsx
function DesignPanel({ projectId }: { projectId: string }) {
  const { data: scanResult } = useQuery({
    queryKey: ["design.scanForApps", projectId],
    queryFn: () => rpc.call("design.scanForApps", { projectId }),
  });

  if (!scanResult) return <Spinner />;

  // Error state (tool failure)
  if (!scanResult.success) {
    return <ErrorState error={scanResult.error} />;
  }

  // Empty state with diagnostics (setup issue)
  if (scanResult.apps.length === 0) {
    return <DiagnosticEmptyState diagnostics={scanResult.diagnostics} />;
  }

  // Success state (apps found)
  return <AppList apps={scanResult.apps} />;
}
```

### Re-scan Feedback

Manual re-scan provides toast feedback using diagnostics:

```typescript
async function handleRescan() {
  const result = await rpc.call("design.scanForApps", { projectId });

  if (result.success && result.diagnostics) {
    toast.success(
      `Scanned ${result.diagnostics.scannedDirCount} directories, ` +
        `found ${result.apps.length} apps`,
    );
  } else if (!result.success) {
    toast.error(`Scan failed: ${result.error.message}`);
  }
}
```

This confirms the scan executed and shows the outcome immediately.

### Backward Compatibility

Diagnostics are optional in the response schema:

```typescript
export const ScanResponseSchema = Schema.Struct({
  apps: Schema.Array(AppSchema),
  diagnostics: Schema.optional(DiagnosticsSchema), // Optional field
});
```

Old clients that don't know about diagnostics ignore the field and continue working. New clients display diagnostics when available.

## Related Concepts

- [[concepts/design-scanner-detection-resilience]] — The scanner implementation that produces these diagnostics
- [[concepts/startup-milestone-logging]] — Similar pattern of surfacing internal progress to users
- [[concepts/dev-server-status-visualization]] — Another case of showing "what's happening" instead of silent spinner
- [[concepts/external-service-initialization-fallback]] — Service discovery with diagnostic feedback
- [[concepts/process-output-dual-pattern-matching]] — Error detection pattern that could benefit from diagnostic output

## Sources

- [[daily/2026-04-24]] — "Empty state is diagnostic — tells you how many dirs scanned, how many `package.json` found, and _why_ each was skipped ('no react', 'no dev script', etc.)"
- [[daily/2026-04-24]] — "Re-scan gives feedback — shows a toast with how many dirs scanned + apps found"
- [[daily/2026-04-24]] — "RPC errors are no longer silent — errors show up in the UI as an actual error row, not masked as '0 apps'"
- [[daily/2026-04-24]] — "new fields (`diagnostics`, `scannedDirCount`) are optional, old clients ignore them"
