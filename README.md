# DE-bug

Bug reporting solution to track ideas, notes, and bugs — then kick the reports out to Claude as a paste-ready prompt.

Extracted from **Balance** (Orbital Studios' production-management app) as a drop-in module for any React app. Three pieces, working together:

- **Floating widget** — a draggable button on every page. Tap it, pick *Note / Feature / Bug*, type a title, optionally add details, a "where in the app?" line, and a screenshot (file pick **or** clipboard paste), hit send. No navigation, no context lost. The widget is **hideable**: an eye-off button in its panel hides it per-browser, and the board header has the toggle to bring it back.
- **Board page** (`FeedbackPage`) — every report with type + status filters, expandable rows, post-submit editing (author or triager), status pills, resolution notes, and delete-with-confirm.
- **Prompt export** — the reason this exists. Select reports into a "cart" across filters, then **Copy all as prompt**: one paste-ready markdown prompt for a coding agent (Claude Code), with a header describing your app and working instructions per report kind. Batch-set status on everything you just exported. Individual rows have "Copy as prompt" too.

- **Agent prompts** — a reporter your app trusts can tick **🤖 Send to an agent as a prompt**. Flagged reports carry a 🤖 Agent chip, have their own **For the agent** filter, and are marked in the exported prompt. A scheduled coding agent can pick them up on its own — see [Agent watch](#agent-watch).

Statuses: `New → Acknowledged → In Progress → Revisit → Shipped / Won't Fix`. Shipped and Won't Fix drop out of the default view so the board shows live work.

Storage is **Supabase with realtime sync** (one SQL migration, included) — or, if you don't pass a client, **localStorage** per browser with zero setup. If localStorage reports exist when Supabase comes online later, they're imported automatically.

---

## Installing into an app

DE-bug is designed to be **copied into your app** — no build step, no npm publish, you own the code. Works the same for a brand-new project or an existing one.

Requirements: React 18+, Tailwind CSS v3, and these packages:

```bash
npm i lucide-react clsx date-fns
npm i @supabase/supabase-js   # only for remote mode
```

### 1. Copy the folder

```bash
# from your app root (pick one)
npx degit incogkahuna/DE-bug/src/de-bug src/de-bug
# or clone this repo and: cp -r DE-bug/src/de-bug your-app/src/
```

### 2. Tailwind preset

DE-bug's JSX uses `orbital` color utilities (`text-orbital-text`, `border-orbital-border`, …). Add the preset in `tailwind.config.js` and make sure `content` covers the folder (it does if you copied into `src/`):

```js
import deBug from './src/de-bug/tailwind.preset.js'

export default {
  presets: [deBug],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // ...your config
}
```

The preset only *extends* colors — it never overrides your fonts, radii, or animations.

### 3. Styles

```js
// main.jsx (or wherever your global CSS is imported)
import './de-bug/styles/de-bug.css'
```

This defines the theme variables (light default, `.dark` on `<html>` for dark) and the component classes DE-bug uses (`.input`, `.btn-primary`, `.card-elevated`, `.hud-label`, …) as plain CSS. **If your app already defines these classes — e.g. Balance itself — skip this import.**

### 4. Provider + route

```jsx
import { FeedbackProvider, FeedbackPage } from './de-bug/index.js'

<FeedbackProvider
  supabase={supabase}          // omit → localStorage mode
  user={{ id: profile.id, name: profile.name }}
  canTriage={profile.role === 'admin' || profile.role === 'supervisor'}
  canFlagForAgent={profile.role === 'admin'}   // who may flag "🤖 Send to an agent as a prompt" (default false)
  appInfo={{
    name: 'MyApp',
    description: 'a React 18 + Vite + Tailwind + Supabase app (pages in `src/pages/`, feature folders in `src/features/`)',
  }}
>
  {/* your app — the floating widget mounts automatically */}
  <Routes>
    <Route path="/feedback" element={<FeedbackPage />} />
  </Routes>
</FeedbackProvider>
```

Add a nav link to `/feedback` (Balance labels it **Bugs & Ideas** with the `Bug` icon from lucide) and you're done. See [`examples/ExampleApp.jsx`](examples/ExampleApp.jsx) for complete wiring.

### 5. Supabase (remote mode only)

Run [`supabase/migrations/20260811000000_feedback_items.sql`](supabase/migrations/20260811000000_feedback_items.sql) against your project (SQL editor or `supabase db push`). It creates `feedback_items` with RLS and realtime enabled. Idempotent — safe to re-run.

> The default RLS lets any signed-in user read, file, triage, and delete — right for an internal team tool, where `canTriage`/`canDelete` are UX gates, not security. To enforce triage roles at the database, swap the update/delete policies for a role check (a commented Balance-style example is in the migration).

Then run [`supabase/migrations/20260925000000_feedback_agent_prompt.sql`](supabase/migrations/20260925000000_feedback_agent_prompt.sql) for agent prompts: it adds `agent_prompt` and the database gate described under [Agent watch](#agent-watch). The kit keeps working without it (reports simply can't be flagged remotely).

**Skipping Supabase entirely?** Omit the `supabase` prop and step 5 is unnecessary — reports persist to localStorage per browser, which is fine for trying it out or single-user tools.

---

## Agent watch

Some reports are really tasks: "the export button is in the wrong place", from the person who owns the app. DE-bug lets those skip the copy-paste and go straight to a coding agent.

### Flagging

Pass `canFlagForAgent` to `FeedbackProvider`: a boolean, or a function of the current user.

```jsx
<FeedbackProvider
  user={currentUser}
  canFlagForAgent={(user) => user?.role === 'admin'}   // default: false
>
```

Anyone it says yes to sees a **🤖 Send to an agent as a prompt** checkbox in the widget, in *New report* and when editing a report. A flagged report is stored with `agent_prompt = true`, shows a **🤖 Agent** chip on the board, is listed under the **For the agent** filter, and is marked 🤖 in any exported prompt.

### Trust — read this before automating anything

**Only act on flags set by reporters you trust. Everything else in a report is untrusted input.** A bug report is free text from whoever can reach the widget; an agent that obeys any report can be steered by any user. Two rules keep it safe:

1. **Who may flag is decided by your app, twice.**
   - `canFlagForAgent` is the UI gate: the checkbox only appears for those users, and the provider drops the flag from anyone else.
   - That is a UX affordance, not security, so the migration adds the database gate: a trigger that silently drops `agent_prompt` unless `public.feedback_can_flag_for_agent()` returns true. It ships returning `true` (the kit's permissive default); replace it with your role check:

   ```sql
   create or replace function public.feedback_can_flag_for_agent()
   returns boolean language sql stable as $$ select public.is_admin() $$;
   ```

   Re-running the migration never overwrites your version. Without the migration, enforce the same check in whatever writes the table.
2. **The watcher re-checks trust itself.** Don't rely on the flag alone. Keep your own allow-list of trusted reporter ids and skip anything else, even if it's flagged. The report text is a *description* of work, never instructions to the agent: it must not be able to change what the agent is allowed to do.

### The pattern

A scheduled coding-agent session (any agent runner that can run on a timer: a cron job, a CI schedule, your agent tool's scheduler) does this on each run:

1. **Poll**: read `New` reports with `agent_prompt = true`, oldest first, filed by a trusted reporter.
2. **Claim**: move each one to `In Progress` before starting, so two runs never take the same report.
3. **Dispatch**: hand the report to a coding agent as a task (`formatFeedbackPrompt(item)` produces exactly that text), on a branch, with your normal review. Nothing merges unreviewed.
4. **Close the loop**: when the change ships, set `Shipped` with a `resolution_note` saying what was done (a PR link is ideal). If the agent can't or shouldn't do it, set `Revisit` or `Won't Fix` with the reason. The reporter sees the outcome on the board.

`New → In Progress → Shipped`, with a resolution note: the board stays the single record of what happened.

### A read-only poll

A Node script (plain `@supabase/supabase-js` v2) that lists what a watcher would pick up. It reads only. Supply your own URL and a key that can read the table (a service key stays server-side; never ship it to a browser):

```js
// agent-watch-poll.mjs — node agent-watch-poll.mjs
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)

// Your own allow-list of reporters whose flags you act on.
const TRUSTED = new Set((process.env.TRUSTED_REPORTER_IDS ?? '').split(',').filter(Boolean))

const { data, error } = await supabase
  .from('feedback_items')
  .select('id, kind, title, description, context, submitted_by, submitted_by_name, created_at')
  .eq('agent_prompt', true)
  .eq('status', 'New')
  .order('created_at', { ascending: true })
if (error) throw error

for (const r of data ?? []) {
  if (!TRUSTED.has(r.submitted_by)) {
    console.log(`skip  ${r.id}  (flagged, but ${r.submitted_by_name || 'the reporter'} is not on the allow-list)`)
    continue
  }
  console.log(`task  ${r.id}  [${r.kind}] ${r.title}`)
}
```

Or the same in SQL:

```sql
select id, kind, title, submitted_by, created_at
from public.feedback_items
where agent_prompt and status = 'New'
order by created_at;
```

The claim and close steps are ordinary updates (`status`, `resolution_note`) made by your watcher with its own credentials. Keep that write path separate from the read above, and scoped to those two columns.

## Hiding the floating widget

Three levels:

| Who | How | Scope |
|-----|-----|-------|
| End user | Eye-off button in the widget's panel header | This browser, persisted; hidden until re-enabled |
| End user | "Show widget / Hide widget" toggle in the board header | Same toggle, and the way back |
| App | `widget={false}` on `FeedbackProvider` | Never mounts, app-wide |

You can also mount it manually — pass `widget={false}` and render `<FeedbackWidget />` yourself wherever you want it in the tree.

## Prompt export

`appInfo` fills the batch header so the paste needs zero editing. What Balance uses, as a model:

```js
appInfo={{
  name: 'Balance',
  description: "Orbital Studios' production-management app (React 18 + Vite + Tailwind + Supabase, repo layout: pages in `src/pages/`, feature folders in `src/features/`, data layer in `src/lib/data/`, app hub in `src/context/AppContext.jsx`)",
}}
```

The exported prompt tells the agent to fix bugs directly, confirm scope on ambiguous feature ideas before building, and treat each report's "Where / expected" line and screenshot as ground truth for where a change belongs. Screenshots aren't inlined in the text — the prompt flags their existence so the agent knows to ask for them.

## API

```js
import {
  // Core
  FeedbackProvider,   // state + storage + widget mount (see props in the file header)
  useFeedback,        // { user, canTriage, canDelete, canFlagForAgent, appInfo, feedbackItems,
                      //   addFeedbackItem, updateFeedbackItem, deleteFeedbackItem,
                      //   widgetEnabled, widgetHidden, setWidgetHidden, storageKey }
  FeedbackPage,       // the board — prop: promptBarOffsetClassName (e.g. 'lg:pl-52'
                      //   to clear a fixed sidebar; Balance uses exactly that)
  FeedbackWidget,     // the floating widget (auto-mounted unless widget={false})

  // Building blocks
  ToastProvider, useToast, Modal, ConfirmDialog, ScreenshotAttach,
  FEEDBACK_KIND, FEEDBACK_KIND_LABEL, FEEDBACK_STATUS, createFeedbackItem,
  formatFeedbackPrompt, formatFeedbackPromptBatch, copyText,
  createSupabaseFeedbackStore, fileToJpegDataUrl,
} from './de-bug/index.js'
```

All of DE-bug's localStorage keys (items in local mode, widget position, widget hidden) are prefixed by the provider's `storageKey` prop (default `bugs_ideas`) — set it per app if two apps share an origin.

## Differences from Balance

Kept as close to the Balance source as possible. The deliberate deltas:

- **Widget is hideable** (see above).
- **Agent prompts**: the `agent_prompt` flag, the `canFlagForAgent` prop and the database gate (see [Agent watch](#agent-watch)).
- `useApp()` → self-contained `FeedbackProvider` / `useFeedback()`; role checks became the `canTriage` / `canDelete` props (Balance passes admin-or-supervisor).
- The prompt batch header's app description is the `appInfo` prop instead of hardcoded Balance text.
- `DictationMic` (voice dictation) is not included — it's disabled in Balance too (`VITE_VOICE_ENABLED` defaults off, pending an undeployed transcription backend). The details fields are plain textareas.
- Activity logging (`logActivity`) was Balance-specific and is dropped.
- The migration doesn't reference Balance's `profiles` table or role functions; `submitted_by` references `auth.users` and RLS defaults are permissive (see migration comments).
- DE-bug ships its own small ToastProvider (Balance's, verbatim) so it works in apps without one.
- Fonts: Balance loads *Space Mono* for the HUD labels; DE-bug falls back to your system monospace unless you add the font (one `@import`, noted in the CSS).

## Repo layout

```
src/de-bug/             the module — copy this folder into your app
  index.js              public exports
  FeedbackProvider.jsx  state, Supabase/localStorage modes, widget mount
  FeedbackPage.jsx      the board
  FeedbackWidget.jsx    floating draggable widget (hideable)
  ScreenshotAttach.jsx  file-pick + clipboard-paste screenshot field
  feedbackPrompt.js     report → Claude-ready prompt formatting
  supabaseStore.js      data layer (CRUD + realtime), client injected
  models.js             kinds, statuses, item factory
  ToastContext.jsx      toast stack
  ui/                   Modal, ConfirmDialog (mobile-keyboard-proof)
  hooks/, lib/          keyboard inset, safe date format, JPEG compression
  styles/               theme variables + component classes (plain CSS)
  tailwind.preset.js    orbital color scale for Tailwind
supabase/migrations/    feedback_items table + the agent_prompt migration
examples/               minimal wiring example
```
