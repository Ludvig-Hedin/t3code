---
title: Knowledge Base Index
sources:
  - memory-compiler/daily/
  - memory-compiler/scripts/compile.py
created: "2026-04-09"
updated: "2026-04-09"
---

# Knowledge Base Index

| Article | Summary | Compiled From | Updated |
|---------|---------|---------------|---------|
| [[concepts/memory-compiler-three-stage-pipeline]] | 3-stage data flow: SessionStart (inject), SessionEnd/PreCompact (capture), compile.py (extract) | daily/2026-04-09.md | 2026-04-09 |
| [[concepts/python-path-resolution]] | Use Path(__file__).resolve() to locate ROOT; essential for variable hook cwd | daily/2026-04-09.md | 2026-04-09 |
| [[concepts/venv-isolation-with-uv]] | Isolate memory-compiler in subdirectory with uv run --directory; avoids monorepo conflicts | daily/2026-04-09.md | 2026-04-09 |
| [[concepts/hook-execution-context]] | SessionStart/SessionEnd/PreCompact hooks fire with project root cwd; spawn detached subprocesses | daily/2026-04-09.md | 2026-04-09 |
| [[concepts/subprocess-detachment-macos]] | Use start_new_session=True to detach processes; critical for background compilation | daily/2026-04-09.md | 2026-04-09 |
| [[concepts/auto-compilation-triggers]] | Compile.py auto-triggers at 6 PM if daily log changed; uses SHA-256 hashing for state | daily/2026-04-09.md | 2026-04-09 |
| [[concepts/knowledge-base-index-and-log]] | Index.md: master catalog with table; log.md: append-only compile history | daily/2026-04-09.md | 2026-04-09 |
| [[concepts/systematic-feature-implementation-phases]] | Break complex features into 8 phases (contracts → shared → logic → clients → adapters → RPC → UI → auth) | daily/2026-04-09.md | 2026-04-09 |
| [[concepts/effect-services-layers-pattern]] | Services structured as contracts, business logic, persistence, and RPC handlers; enables testing and swapping implementations | daily/2026-04-09.md | 2026-04-09 |
| [[concepts/http-endpoint-authentication-patterns]] | Public endpoints (discovery) vs authenticated endpoints (operations); Bearer tokens and env var API keys | daily/2026-04-09.md | 2026-04-09 |
| [[concepts/provider-adapter-shape-pattern]] | Providers implement ProviderAdapterShape interface (initialize, validate, call, stream, cleanup) for pluggability | daily/2026-04-09.md | 2026-04-09 |
| [[concepts/typecheck-validation-gates]] | Run TypeCheck between phases to catch integration bugs early; type safety enforces contracts | daily/2026-04-09.md | 2026-04-09 |
| [[concepts/agent-discovery-endpoints]] | Public endpoint advertising agent capabilities, methods, and parameter schemas for dynamic client adaptation | daily/2026-04-09.md | 2026-04-09 |
| [[concepts/settings-ui-management-pattern]] | Settings panel for managing integrations: discover, register, remove operations with feedback states | daily/2026-04-09.md | 2026-04-09 |
| [[connections/architecture-depends-on-hooks]] | 3-stage pipeline works because hooks fire predictably with correct context and detachment | daily/2026-04-09.md | 2026-04-09 |
| [[connections/environment-setup-patterns]] | Path resolution + venv isolation are complementary patterns ensuring correct environment | daily/2026-04-09.md | 2026-04-09 |
| [[connections/a2a-endpoints-and-http-authentication]] | Strategic separation: discovery (public) vs operations (authenticated) enables secure extensibility | daily/2026-04-09.md | 2026-04-09 |
| [[connections/systematic-phases-and-validation-gates]] | Phasing without validation is brittle; TypeCheck gates ensure each phase matches previous assumptions | daily/2026-04-09.md | 2026-04-09 |
| [[connections/effect-pattern-and-adapter-shape]] | ProviderAdapterShape is the contract layer of effect services pattern made reusable across providers | daily/2026-04-09.md | 2026-04-09 |
