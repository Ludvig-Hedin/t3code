---
title: "RPC Layer Expansion Pattern"
aliases: [adding-rpc-methods, rpc-contracts, rpc-service-expansion]
tags: [architecture, rpc, contracts, incremental-expansion]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# RPC Layer Expansion Pattern

New functionality often requires adding RPC methods (remote procedure calls) that expose backend logic to frontend clients. The expansion pattern ensures new methods follow existing architectural conventions: define contracts first (types), implement backend logic, create RPC handlers, and wire them into the client query system. This pattern scales to many incremental additions without architectural drift.

## Key Points

- Adding RPC methods requires changes across: contracts (types), server implementation, RPC handlers (marshalling), client queries (frontend)
- Contracts define the method signature; implementations work from contracts backward
- RPC handlers are thin: marshal incoming JSON to contract types, call server logic, marshal result back to JSON
- Client queries (React Query) use the RPC contract to type safety check calls
- Pattern is minimal (~11 files for a new method); reuses existing architectural artifacts

## Details

### The Expansion Workflow

**Phase 1: Contracts**

```typescript
// packages/contracts/src/git.ts
export interface GetWorkingDiffRequest {
  projectId: string;
}

export interface GetWorkingDiffResponse {
  diff: FileDiff[];
  stats: DiffStats;
}
```

**Phase 2: Server Implementation**

```typescript
// apps/server/src/git/Services/GitCore.ts
async readWorkingDiff(projectId: string): Promise<FileDiff[]> {
  const repo = this.getRepo(projectId);
  const patch = await repo.readDiff("HEAD", null); // null = working tree
  return this.parsePatch(patch);
}
```

**Phase 3: RPC Handler**

```typescript
// Expose the method as JSON-RPC endpoint
handler: async (req: GetWorkingDiffRequest, ctx) => {
  const diffs = await ctx.gitService.readWorkingDiff(req.projectId);
  return { diff: diffs, stats: computeStats(diffs) };
};
```

**Phase 4: Client Query**

```typescript
// apps/web/src/lib/gitReactQuery.ts
export function useWorkingDiff(projectId: string) {
  return useQuery({
    queryKey: ["git", "working-diff", projectId],
    queryFn: async () => {
      const res = await rpc.call("git.getWorkingDiff", { projectId });
      return res as GetWorkingDiffResponse;
    },
    staleTime: 5000, // Re-fetch if older than 5 seconds
    refetchInterval: 15000, // Poll every 15 seconds
  });
}
```

**Phase 5: UI Integration**

```typescript
// Use the query in components
const { data, isPending } = useWorkingDiff(projectId);

if (isPending) return <Spinner />;
if (!data?.diff.length) return <p>No uncommitted changes</p>;

return <DiffList diffs={data.diff} />;
```

### Design Principles

**Thin handlers:** RPC handlers should be ~5-10 lines. They marshal types and delegate to business logic. Complex logic belongs in the service layer, not RPC.

**Contract first:** Define the request/response types before implementing. This ensures server and client agree on the interface.

**Reuse existing patterns:** Don't invent new ways to handle queries, caching, or marshalling. Follow how existing RPC methods are structured.

**Defensive defaults:** New methods should have graceful fallbacks for edge cases (e.g., no working tree changes → return empty diff, not error).

### Edge Case: New Repos

The working diff feature requires comparing HEAD to working tree. New repos with no commits fail because HEAD doesn't exist. Solution: catch this error and return empty diff:

```typescript
async readWorkingDiff(projectId: string): Promise<FileDiff[]> {
  try {
    const patch = await repo.readDiff("HEAD", null);
    return this.parsePatch(patch);
  } catch (e) {
    if (e.message.includes("ambiguous argument 'HEAD'")) {
      // New repo with no commits; no diff to show
      return [];
    }
    throw e;
  }
}
```

This keeps the method defensive and predictable.

## Related Concepts

- [[concepts/effect-services-layers-pattern]] - RPC handlers are one layer of this pattern
- [[concepts/systematic-feature-implementation-phases]] - RPC handlers are phase 6 of 8
- [[concepts/git-branch-agnostic-base-resolution]] - Similar defensive validation patterns in git operations

## Sources

- [[daily/2026-04-12.md]] - "Implemented working-tree diff display... Add a new `git.getWorkingDiff` RPC method"
- [[daily/2026-04-12.md]] - "Minimal addition (11 files touched) using existing architectural patterns (RPC contracts, query options, lazy rendering)"
- [[daily/2026-04-12.md]] - "Edge case: Brand-new repos with no commits will fail on `git diff HEAD`... falls back gracefully to empty state"
