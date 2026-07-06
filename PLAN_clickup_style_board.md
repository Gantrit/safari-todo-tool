# Plan: ClickUp-style board cleanup + Create Task redesign

Status: **draft, not implemented**. Handed off for implementation (Claude Code or Codex).
Do not commit/push until reviewed.

## Goals (from user feedback, 2026-07-06)

1. Remove `IMMINENT` as a `TaskSection`. Priority already exists (LOW/MEDIUM/HIGH); a separate
   "imminent" bucket is redundant as a *column*.
2. Replace the imminent bucket with a dynamic, deadline-proximity XP bonus (decided over
   priority-coupling or full removal — see "XP bonus" below).
3. Create Task modal: collapse the Assignees list behind a disclosure toggle (don't show all
   members expanded by default).
4. Reminders: shrink from big toggle rows to compact checkboxes.
5. Add a **Category** field (`DAILY` / `WEEKLY` / `MONTHLY`) in the Create Task modal, placed
   between Reminders and Recurring task. Default = `DAILY` if left unset.
6. Hide sections/columns with zero tasks instead of always rendering an empty box — closer to
   ClickUp, less visual noise on days with few tasks.

## Decision: XP bonus replacement

User chose: **couple the bonus to deadline proximity at completion time**, not to Priority.
Rationale: keeps "imminent" as a real emergent property (how close to the deadline you are) not
a static flag, and doesn't collapse imminent-ness into the priority axis where it doesn't
semantically belong.

Concretely, in `lib/types.ts` `calculateApprovalXp`:

```ts
// current:
const imminent = task.section === 'IMMINENT' ? IMMINENT_XP_BONUS : 0

// new: reward completing close to the deadline (not before it, not late)
// e.g. within the last 20% of the task's lifetime, or within a fixed window (24h) of deadline_at
const deadline = getTaskDeadline(task)
const imminentBonus = deadline && isCompletedNearDeadline(task, completedAt) ? IMMINENT_XP_BONUS : 0
```

Needs a concrete definition of "near deadline" — proposed: completed within 24h before the
deadline (not after; overdue already has its own penalty path). This needs explicit sign-off
before coding since it changes the XP formula (server-side RPC `approve_task`, migration 007,
must match whatever `calculateApprovalXp` documents client-side — check if the RPC duplicates
this logic in SQL and needs a new migration).

**Action before implementation:** grep `supabase/migrations/007*` for the imminent bonus logic in
SQL and mirror the exact same "near deadline" rule there. This is a schema/RPC change → new
numbered migration, per `AGENTS.md` working rules.

## Type changes

`lib/types.ts`:
- `TaskSection`: drop `'IMMINENT'` → `'DAILY' | 'WEEKLY' | 'MONTHLY'`.
- Remove `IMMINENT_XP_BONUS` constant name or repurpose it as `NEAR_DEADLINE_XP_BONUS`.
- `calculateApprovalXp`: replace `task.section === 'IMMINENT'` check with the deadline-proximity
  check described above.

## Data migration concern

Existing tasks with `section = 'IMMINENT'` in the DB need a migration path — e.g. backfill them
to `DAILY` (or infer WEEKLY/MONTHLY from their deadline_at delta) in the same migration that
drops the enum value. Postgres enums require `ALTER TYPE ... DROP VALUE` workaround (drop+recreate
type) if `TaskSection` is a native enum — check `supabase/migrations/` for how it's defined before
assuming a simple ALTER works.

## UI changes

### `components/board/MemberColumn.tsx`
- `SECTIONS` array: remove `'IMMINENT'`.
- Default "Add task" button (header +) currently hardcodes `'DAILY'` — keep as-is, fine.

### `components/board/TaskSection.tsx`
- Remove `IMMINENT` entry from `SECTION_LABELS`.
- Hide-when-empty: wrap the whole `<section>` render in `tasks.length > 0 || <some create affordance>`.
  Concretely: if `tasks.length === 0`, render a **compact single-line "+ {label}" chip** instead of
  the full section (header + empty card stack + quick-add box). Clicking the chip either:
  (a) expands it into the full section inline (with just the quick-add row visible), or
  (b) opens the Create Task modal pre-filled with that section's category.
  Recommend (a) for consistency with existing quick-add UX, unless it feels janky in practice —
  cheap to try both.
- Keep the section fully rendered (not collapsed to a chip) if the user has manually expanded it
  via the existing `collapsed` state, so this doesn't fight the current collapse feature.

### `components/task/TaskForm.tsx`
- **Assignees**: wrap the current always-expanded member list in a disclosure. Add
  `const [assigneesOpen, setAssigneesOpen] = useState(false)`. Header row becomes a button showing
  a summary chip row of currently selected assignees (avatars) + a chevron; clicking toggles the
  full list open. Keep `assignedTo` state and `toggleAssignee` logic unchanged.
- **Reminders**: replace the two `Toggle` "switch" rows with plain checkboxes (smaller, inline,
  e.g. `<label className="flex items-center gap-2 text-xs"><input type="checkbox" .../> 3 days
  before</label>`). Purely visual, no state shape change (`remind3d`/`remind24h` stay booleans).
- **New Category field**: add `const [category, setCategory] = useState<TaskSection>(section ??
  'DAILY')`. Render a `<select>` (or segmented button group, ClickUp-style) with `DAILY / WEEKLY /
  MONTHLY`, default `DAILY`, placed in the aside between the Reminders block and the Recurring
  task block (i.e. move Recurring block below Category in JSX order).
  On submit, use `category` instead of the `section` prop when inserting into `tasks.section`.
- Note: `TaskForm` currently receives `section` as a prop from the caller (which section's "+" was
  clicked). With category now user-editable, `section` prop becomes just the **initial default**
  for the new field, not the final value used at submit time.

### Recurring frequency field
- Already exists (`recurringFrequency`: DAILY/WEEKLY/MONTHLY/CUSTOM) — separate concept from the
  new Category field (one is "how often does this repeat", the other is "which board bucket does
  it live in"). Keep them visually adjacent per the user's ask but don't merge the state — verify
  this distinction doesn't confuse users in practice (worth a quick usability gut-check once built,
  not upfront design work).

## Open questions to confirm before coding

1. Exact "near deadline" window for the XP bonus — 24h before deadline? Percentage-of-lifetime?
2. Existing `IMMINENT` tasks in prod DB — backfill to DAILY, or infer WEEKLY/MONTHLY from
   `deadline_at`?
3. Empty-section chip: auto-expand-in-place vs. open modal — pick one to build first.
4. `TaskSection` enum: confirm how it's declared in `supabase/migrations/` (native Postgres enum
   vs. text + check constraint) before planning the DROP migration — enum drops are the fiddly
   part here.

## Order of implementation (suggested)

1. Confirm open questions above with user.
2. New migration: backfill IMMINENT tasks, update `TaskSection` type/constraint, update
   `approve_task` RPC XP logic to the deadline-proximity rule.
3. `lib/types.ts`: type + `calculateApprovalXp` changes.
4. `MemberColumn.tsx` / `TaskSection.tsx`: drop IMMINENT column, empty-section collapse.
5. `TaskForm.tsx`: assignee disclosure, reminder checkboxes, Category field.
6. `npm run build` (Windows: `npm.cmd run build`), manual browser check via `/board/[boardId]`.
7. `COLLAB_LOG.md` entry per `AGENTS.md` handoff protocol — call out the migration explicitly.
