# DE-bug

Bug reporting solution to track ideas, notes, and bugs — then kick the reports out to Claude as a paste-ready prompt.

Extracted from **Balance** (Orbital Studios' production-management app) as a drop-in module for any React app. Three pieces, working together:

- **Floating widget** — a draggable button on every page. Tap it, pick *Note / Feature / Bug*, type a title, optionally add details, a "where in the app?" line, and a screenshot (file pick **or** clipboard paste), hit send. No navigation, no context lost. The widget is **hideable**: an eye-off button in its panel hides it per-browser, and the board header has the toggle to bring it back.
- **Board page** (`FeedbackPage`) — every report with type + status filters, expandable rows, post-submit editing (author or triager), status pills, resolution notes, and delete-with-confirm.
- **Prompt export** — the reason this exists. Select reports into a "cart" across filters, then **Copy all as prompt**: one paste-ready markdown prompt for a coding agent (Claude Code), with a header describing your app and working instructions per report kind. Batch-set status on everything you just exported. Individual rows have "Copy as prompt" too.

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

**Skipping Supabase entirely?** Omit the `supabase` prop and step 5 is unnecessary — reports persist to localStorage per browser, which is fine for trying it out or single-user tools.

---

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
  useFeedback,        // { user, canTriage, canDelete, appInfo, feedbackItems,
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

- **Widget is hideable** (the one feature addition — see above).
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
supabase/migrations/    standalone feedback_items migration
examples/               minimal wiring example
```
