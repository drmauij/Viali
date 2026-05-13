# Perioperative Risk Grade — Resume Notes

**Last updated:** 2026-05-13 (interrupted mid-execution; user closing laptop)

## Where we are

**Branch:** `feat/perioperative-risk-grade`
**Worktree:** `/home/mau/viali/.worktrees/perioperative-risk-grade`
**Execution method:** subagent-driven-development (option 1)
**Spec:** `docs/superpowers/specs/2026-05-13-perioperative-risk-grade-design.md` (on main)
**Plan:** `docs/superpowers/plans/2026-05-13-perioperative-risk-grade.md` (on main)

## Tasks completed

| # | Task | Commit | Notes |
|---|---|---|---|
| 1 | Schema & migration | `07f2058e` | Migration `0255_perioperative_risk.sql`. Added 3 columns + index. Idempotency verified (ran 3 times clean). `npm run check` clean. Journal entry `when: 1780900000000`. |

**Spec compliance review for Task 1: NOT YET RUN** — should be the first thing to do on resume before moving to Task 2.

## Tasks remaining

- Task 1 — Spec review + Code quality review (deferred — Task 1 already committed)
- Tasks 2–8 — Phase 2: Scoring engine (TDD, 7 sub-tasks: types, cardiac band, VTE band, pulmonary v1, mFI-5, surgery band, composite)
- Tasks 9–14 — Phase 3: Server adapter, recalc hooks, backfill
- Tasks 15–18 — Phase 4: Frontend foundation (RiskChip, popover, header, wire into 3 places)
- Tasks 19–22 — Phase 5: OP Calendar (remove ambulant pill, toggle, heat-map, month dots)
- Tasks 23–24 — Phase 6: Methodology page + admin link
- Task 25 — Phase 7: Final verification + final code review

## Resume checklist for next session

1. `cd /home/mau/viali/.worktrees/perioperative-risk-grade`
2. `git status` → should be clean on `feat/perioperative-risk-grade`
3. `git log --oneline -3` → top should be `07f2058e feat(risk): schema columns ...`
4. `npm run check` → should be clean
5. Re-invoke `superpowers:subagent-driven-development` and continue from Task 2.

## Pre-flight notes (carry-over from plan)

- `patients.smokingStatus` (varchar, 'never'|'former'|'current') already exists at `shared/schema.ts:4558` — no smoking-field migration needed.
- Illnesses live on the `patients` row as `heartIllnesses`, `lungIllnesses`, etc. JSONB columns.
- Concept-tag resolution helper: `shared/scoring/findConcept.ts` (already exists).
- Existing ambulant calculator pattern in `server/routes/anesthesia/surgeries.ts:39` (`applyAmbulantValidation`) — Task 10 mirrors this with `applyPerioperativeRiskRecalc`.
- Drizzle journal `when` for our migration: `1780900000000`. If the user adds another migration in the meantime, the next perioperative-risk-related entries (none expected) would need to use a still-higher `when`.

## Decisions locked in

- **Heat-map treatment:** D combo (soft tint + left accent strip) + risk chip top-right.
- **Toggle placement:** inline next to Day/Week/Month view switcher; `localStorage` key `opCalendar.heatmapEnabled`.
- **Patient header chip:** "MED · CARDIAC" format — driver domain from `worstDomain`.
- **Ambulant nesting:** sub-line under meta, only when `stayType === 'ambulant'`.
- **Methodology page:** at `/risk-methodology`, linked from every risk chip popover + admin settings.
- **Scoring composite:** worst-domain across {RCRI cardiac, Caprini VTE, Viali pulmonary v1, mFI-5 frailty, surgery weight} + age modifier (≥75 bumps up one band).
- **Existing ambulant gate:** unchanged. Only the OP calendar pill is removed; same data resurfaces as the header sub-line.

## Visual companion

Browser companion was running on `http://localhost:57673`. State dir: `/home/mau/viali/.superpowers/brainstorm/48816-1778653752/`. Will auto-exit after 30 min idle. Safe to ignore.
