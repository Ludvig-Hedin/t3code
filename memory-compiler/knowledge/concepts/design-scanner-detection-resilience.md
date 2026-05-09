---
title: "Design Scanner Detection Resilience: Broad Directory Traversal and Diagnostic Feedback"
aliases: [design-detection, app-scanner, react-detection, directory-traversal]
tags: [design-panel, file-scanning, react, diagnostics, ux]
sources:
  - "daily/2026-04-24.md"
created: 2026-04-24
updated: 2026-04-24
---

# Design Scanner Detection Resilience: Broad Directory Traversal and Diagnostic Feedback

Detecting runnable React applications in a monorepo requires scanning beyond conventional `apps/*` directories to find apps in `frontend/`, `client/`, `web/`, `packages/*/*`, and root locations. The enhanced design scanner implements broad directory traversal, validates each candidate package for React presence and dev scripts, filters out library packages, and provides diagnostic feedback explaining why candidates were rejected. This resilience pattern handles diverse project structures without manual configuration.

## Key Points

- **Broad traversal** - Scan `frontend/`, `client/`, `web/`, `packages/*/*/package.json`, `apps/*`, root `package.json` instead of assuming conventional structure
- **Multi-criteria validation** - Check for React dependency (dependencies or devDependencies), dev script presence, and exclude `packages/` libraries
- **Diagnostic empty state** - Show "Scanned N dirs, found M package.json files" with specific rejection reasons ("no react", "no dev script")
- **Re-scan feedback** - Toast notification shows "Scanned X directories, found Y apps" after manual re-scan trigger
- **Error surfacing** - RPC errors appear as actual error rows in UI instead of silent "0 apps" state

## Details

### Scanner Traversal Strategy

The original scanner only checked `apps/*` directories, missing apps in non-standard locations. The enhanced scanner implements a comprehensive search:

```typescript
const SCAN_PATTERNS = [
  // Root package.json (monorepo root or standalone app)
  "package.json",

  // Apps directory (conventional monorepo structure)
  "apps/*/package.json",

  // Frontend/client/web variants (common React app naming)
  "frontend/package.json",
  "client/package.json",
  "web/package.json",

  // Nested packages (libraries + potential apps)
  "packages/*/package.json",
  "packages/*/*/package.json",
];

async function scanForReactApps(projectRoot: string): Promise<DesignAppEntry[]> {
  const candidates: string[] = [];

  for (const pattern of SCAN_PATTERNS) {
    const matches = await glob(pattern, { cwd: projectRoot, absolute: true });
    candidates.push(...matches);
  }

  // Deduplicate (root package.json may match multiple patterns)
  const uniquePaths = [...new Set(candidates)];

  return validateCandidates(uniquePaths, projectRoot);
}
```

### Validation Criteria

Each discovered `package.json` must pass three checks to be considered a runnable Design app:

**1. Has React dependency:**

```typescript
function hasReact(pkg: PackageJson): boolean {
  return pkg.dependencies?.react !== undefined || pkg.devDependencies?.react !== undefined;
}
```

**2. Has dev script:**

```typescript
function hasDevScript(pkg: PackageJson): boolean {
  return (
    pkg.scripts?.dev !== undefined ||
    pkg.scripts?.start !== undefined ||
    pkg.scripts?.["dev:web"] !== undefined
  );
}
```

**3. Not a library package:**

```typescript
function isLibraryPackage(pkgPath: string): boolean {
  // Exclude packages/* except apps (e.g., packages/ui, packages/email are libraries)
  return pkgPath.includes("packages/") && !pkgPath.includes("apps/");
}
```

### Diagnostic Empty State

When no apps are detected, the UI shows why:

```tsx
function DesignPanelEmptyState({ diagnostics }: { diagnostics: ScanDiagnostics }) {
  return (
    <div className="empty-state">
      <h3>No React apps detected</h3>
      <p>Scanned {diagnostics.scannedDirCount} directories</p>
      <p>Found {diagnostics.packageJsonCount} package.json files</p>

      {diagnostics.rejectionReasons.length > 0 && (
        <div className="rejection-details">
          <h4>Why candidates were rejected:</h4>
          <ul>
            {diagnostics.rejectionReasons.map((reason, i) => (
              <li key={i}>
                <code>{reason.path}</code>: {reason.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button onClick={handleRescan}>Re-scan</Button>
    </div>
  );
}
```

Example output:

```
No React apps detected
Scanned 23 directories
Found 8 package.json files

Why candidates were rejected:
- packages/ui/package.json: no dev script
- packages/email/package.json: library package
- root/package.json: no react dependency
```

### Re-scan Feedback

Manual re-scan provides immediate toast feedback:

```typescript
async function handleRescan() {
  const result = await rpc.call("design.scanForApps", { projectId });

  const apps = result.apps ?? [];
  const scannedCount = result.scannedDirCount ?? 0;

  toast.success(`Scanned ${scannedCount} directories, found ${apps.length} apps`);
}
```

This confirms the scan ran and whether it found anything new.

### Error Handling

Previous implementation silently returned `{apps: []}` on RPC errors, masking server failures. Enhanced error handling surfaces the actual error:

**Server-side** (`apps/server/src/ws.ts`):

```typescript
try {
  const result = await scanForApps(projectId);
  return { success: true, apps: result.apps, diagnostics: result.diagnostics };
} catch (error) {
  if (error instanceof DesignError) {
    // Known error types (already formatted)
    return { success: false, error: { code: error.code, message: error.message } };
  }
  // Unknown errors
  return {
    success: false,
    error: {
      code: "SCAN_FAILED",
      message: error instanceof Error ? error.message : "Unknown error",
    },
  };
}
```

**Client-side** (`apps/web/src/components/DesignPanel.tsx`):

```tsx
if (!scanResult.success) {
  return (
    <div className="error-state">
      <h3>Scan failed</h3>
      <p>{scanResult.error.message}</p>
      <Button onClick={handleRescan}>Retry</Button>
    </div>
  );
}
```

### Backward Compatibility

New fields (`diagnostics`, `scannedDirCount`) are optional in the RPC response schema:

```typescript
export const ScanForAppsResponseSchema = Schema.Struct({
  apps: Schema.Array(DesignAppEntrySchema),
  diagnostics: Schema.optional(
    Schema.Struct({
      scannedDirCount: Schema.Number,
      packageJsonCount: Schema.Number,
      rejectionReasons: Schema.Array(
        Schema.Struct({
          path: Schema.String,
          reason: Schema.String,
        }),
      ),
    }),
  ),
});
```

Old clients ignore the new fields; new clients display them when available.

## Related Concepts

- [[concepts/design-panel-integration-pattern]] — The visual editing system this scanner supports
- [[concepts/lazy-file-tree-rpc-expansion]] — Similar file-system scanning with RPC endpoints
- [[concepts/git-branch-resolution-fallbacks]] — Similar fallback pattern for handling variance across repos
- [[concepts/external-service-initialization-fallback]] — Similar multi-phase discovery with fallbacks
- [[connections/visual-editing-requires-infrastructure-alignment]] — Scanner must detect same apps as Preview system

## Sources

- [[daily/2026-04-24]] — "Scanner is much broader — now walks `frontend/`, `client/`, `web/`, `packages/*/*/package.json`, `apps/*`, root, etc. (instead of only root + `apps/*`)"
- [[daily/2026-04-24]] — "Empty state is diagnostic — tells you how many dirs scanned, how many `package.json` found, and _why_ each was skipped ('no react', 'no dev script', etc.)"
- [[daily/2026-04-24]] — "Re-scan gives feedback — shows a toast with how many dirs scanned + apps found"
- [[daily/2026-04-24]] — "RPC errors are no longer silent — errors show up in the UI as an actual error row, not masked as '0 apps'"
- [[daily/2026-04-24]] — "More resilient server — ws handler catches non-DesignError errors instead of crashing"
