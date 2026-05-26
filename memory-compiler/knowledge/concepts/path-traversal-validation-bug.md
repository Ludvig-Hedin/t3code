---
title: "Path Traversal Validation Bug"
aliases: [path-resolve-comparison, directory-traversal-check, path-security-validation]
tags: [security, validation, file-system, bug-pattern]
sources:
  - "daily/2026-05-09.md"
created: 2026-05-09
updated: 2026-05-09
---

# Path Traversal Validation Bug

A common path traversal validation bug occurs when comparing `resolve(input) === resolve(input)`, which is always true and provides no security. The correct check compares the raw input path against its resolved form to detect directory traversal attempts like `../`.

## Key Points

- **Tautological comparison** — `resolve(x) === resolve(x)` is always true; it validates nothing
- **Compare raw vs resolved** — The correct check is `input !== resolve(input)` or comparing resolved paths against an allowed base
- **Canonicalization attacks** — Attackers use `../`, `./`, symbolic links, and encoding tricks to escape intended directories
- **Defense in depth** — Combine path validation with chroot/jail, allowlists, and principle of least privilege

## Details

### The Bug Pattern

Consider this flawed validation:

```typescript
function isPathSafe(userInput: string): boolean {
  const resolved = path.resolve(userInput);
  return resolved === path.resolve(userInput); // ALWAYS TRUE!
}
```

This check is completely ineffective because:

1. `path.resolve()` is deterministic
2. The same input always produces the same output
3. The comparison is tautological

### The Correct Pattern

Validate that the resolved path stays within an allowed base directory:

```typescript
function isPathSafe(userInput: string, baseDir: string): boolean {
  const resolvedBase = path.resolve(baseDir);
  const resolvedInput = path.resolve(baseDir, userInput);

  // Ensure resolved path is within the base directory
  return resolvedInput.startsWith(resolvedBase + path.sep);
}
```

Or detect if resolution changed the path (indicating traversal sequences):

```typescript
function containsTraversal(userInput: string): boolean {
  // Normalize but don't resolve to absolute
  const normalized = path.normalize(userInput);
  // Check if normalization removed ../ sequences
  return normalized !== userInput || normalized.includes("..");
}
```

### Attack Vectors

Path traversal attacks exploit various techniques:

| Input                     | Resolved               | Attack                                 |
| ------------------------- | ---------------------- | -------------------------------------- |
| `../../../etc/passwd`     | `/etc/passwd`          | Classic parent traversal               |
| `foo/../../../etc/passwd` | `/etc/passwd`          | Traversal hidden in valid-looking path |
| `....//....//etc/passwd`  | Varies by OS           | Double-dot variations                  |
| `%2e%2e%2f`               | `../` after URL decode | URL-encoded traversal                  |

### Testing Path Validation

Always test with adversarial inputs:

```typescript
const maliciousInputs = [
  "../secret",
  "../../etc/passwd",
  "valid/../../../escape",
  "./valid/../../escape",
  "C:\\Windows\\System32", // Windows absolute
  "/etc/passwd", // Unix absolute
];

for (const input of maliciousInputs) {
  assert(!isPathSafe(input, "/allowed/base"));
}
```

### Code Review Context

This bug was identified during a 2026-05-09 code review applying 14 findings across a full-stack monorepo. The lesson learned: "Path traversal checks: comparing `resolve(input) === resolve(input)` is always true; must compare raw vs resolved."

## Related Concepts

- [[concepts/http-endpoint-authentication-patterns]] — Authentication as another layer of API security
- [[concepts/qr-pairing-security-antipattern]] — Another security antipattern identified in the same audit

## Sources

- [[daily/2026-05-09.md]] — "Path traversal checks: comparing `resolve(input) === resolve(input)` is always true; must compare raw vs resolved"
