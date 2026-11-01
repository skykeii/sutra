# Fix log

## Baseline (tag `pre-fixes`)

| Check | Result |
|---|---|
| `tsc --noEmit` | Pass |
| `next lint` | Pass |
| `npm run test` | Pass, 80 tests |
| `npm run smoke` | Pass; lists the 4 known older audit entries |
| `npm run verify:seed` | Pass |
| `npm run e2e pages`, `verify`, `security`, `marks`, `ai` | Pass |
| `npm run e2e reports` | **5 checks fail (pre-existing).** All come from the stray `REQUIRED_STREAM = "MPc"` rule that Fix 2 removes |
| `npm run e2e upload`, `scenarios` | Not run. They submit over-intake uploads, which rule 5 forbids on the shared database |

## Blockers

None so far.
