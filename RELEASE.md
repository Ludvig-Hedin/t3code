# How to Create a Release

## Quick Start

To release version `0.0.16`:

```bash
git tag v0.0.16
git push origin v0.0.16
```

Wait ~20 minutes for the CI to complete. That's it. ✅

---

## What Happens Automatically

When you push a tag matching `v*.*.*`, GitHub Actions runs the release workflow:

1. **Preflight** (3-4 min)
   - Lint, typecheck, test all code
   - Must pass or the build stops

2. **Build** (15 min total, parallel)
   - Builds Electron app for macOS arm64, macOS x64, Windows x64, Linux x64
   - All 4 platform binaries built in parallel

3. **Publish GitHub Release**
   - Creates https://github.com/Ludvig-Hedin/t3code/releases/tag/vX.Y.Z
   - Uploads all platform binaries (DMG, EXE, AppImage)
   - Uploads auto-updater manifests (latest-mac.yml, latest.yml, latest-linux.yml)

4. **Finalize**
   - Updates package.json versions across the repo
   - Commits version bump back to main

---

## What You Need to Do Before Tagging

✅ **All work is committed and pushed to main**
```bash
git status  # Should be clean
git log --oneline | head  # Latest commit visible on GitHub
```

✅ **All tests pass locally** (optional but recommended)
```bash
bun run test
```

✅ **Version makes sense**
- Patch: bug fixes → `0.0.16`
- Minor: new features → `0.1.0`
- Major: breaking changes → `1.0.0`

---

## After Release

1. **Check GitHub Release**
   - https://github.com/Ludvig-Hedin/t3code/releases
   - All 4 platform binaries should be there

2. **Check download page**
   - https://marketing-nu-six.vercel.app/download
   - Should auto-fetch the latest release from GitHub

3. **Download & test**
   - Try downloading the DMG/EXE/AppImage from the release page
   - Verify the app runs

---

## Troubleshooting

### Release is stuck in "Preflight"
- Check the CI logs: https://github.com/Ludvig-Hedin/t3code/actions
- Common issues: failing tests, lint errors, type errors
- Fix locally, commit, and re-tag with the same version (force-push the tag if needed)

### Binaries missing from release
- Check the "Build" jobs in CI — one platform may have failed
- Re-run the failed job or re-trigger the workflow

### Download page doesn't update
- It caches for ~5 minutes; refresh after waiting
- Check browser DevTools → Network → see if GitHub API call succeeds

---

## Release Checklist

- [ ] All commits pushed to main
- [ ] Tests pass: `bun run test`
- [ ] Lint/typecheck pass: `bun run lint && bun run typecheck`
- [ ] New version number decided (e.g., `0.0.16`)
- [ ] Tag created and pushed: `git tag v0.0.16 && git push origin v0.0.16`
- [ ] CI workflow complete (watch https://github.com/Ludvig-Hedin/t3code/actions)
- [ ] GitHub Release published with all 4 platform binaries
- [ ] Download page shows new version
- [ ] Test download one binary
