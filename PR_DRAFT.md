# PR draft: chore/tests-and-ci-gate

**Do not push from the AFK machine until `gh` / git remote auth is available.**

## Title
Add Vitest coverage for sync/SRT/playback and CI quality gate

## Summary
- Extract `parseTimestamp`, `parseSrt`, and `SubtitleCue` from `apps/web/src/main.tsx` into `apps/web/src/parseSrt.ts` so SRT parsing is unit-testable.
- Add Vitest in both workspaces with focused tests for:
  - `syncClock` (anchor projection, drift ignore / smooth / snap, stale disconnect, session resync)
  - `parseSrt` (multi-cue, HTML strip, sort, empty/invalid errors)
  - `playbackStore` (empty snapshot, Jellyfin→session mapping, forward projection, drop/replace sessions)
- Add root scripts `test` and `typecheck`, plus per-workspace `test` scripts.
- Add `.github/workflows/ci.yml` on `pull_request` and `push` to `main`: Node 22 → `npm ci` → `npm run typecheck` → `npm test`.
- Leave `docker.yml` as-is (publish on main/tags). PRs get the CI gate; Docker publish stays separate.

## Test plan
- [ ] `npm ci`
- [ ] `npm run typecheck` (workspace builds)
- [ ] `npm test` — expect 24 passing (18 web + 6 server)
- [ ] Confirm CI workflow appears on the PR and goes green
- [ ] Spot-check web still loads SRT upload after parse extract (manual smoke if desired)

## Push + open PR (once authenticated)

```bash
cd /workspace/sidesubs
git checkout chore/tests-and-ci-gate
git push -u origin HEAD

gh pr create --title "Add Vitest coverage for sync/SRT/playback and CI quality gate" --body "$(cat <<'EOF'
## Summary
- Extract SRT parsing into `parseSrt.ts` for unit testing
- Add Vitest tests for `syncClock`, `parseSrt`, and `playbackStore`
- Add CI workflow (`typecheck` + `test`) on PR and push to main

## Test plan
- [ ] `npm ci && npm run typecheck && npm test`
- [ ] CI checks green on this PR
EOF
)"
```
