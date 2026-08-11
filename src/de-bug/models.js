// ─── Feedback data model ─────────────────────────────────────────────────────
// Extracted from Balance (Orbital Studios). Shapes and constants are shared by
// the widget, the board page, the prompt export, and both storage modes.

export const FEEDBACK_KIND = {
  NOTE: 'note',
  IDEA: 'idea',
  BUG:  'bug',
}

export const FEEDBACK_KIND_LABEL = {
  [FEEDBACK_KIND.NOTE]: 'Note',
  [FEEDBACK_KIND.IDEA]: 'Feature',
  [FEEDBACK_KIND.BUG]:  'Bug',
}

export const FEEDBACK_STATUS = {
  NEW:         'New',
  ACKNOWLEDGED:'Acknowledged',
  IN_PROGRESS: 'In Progress',
  REVISIT:     'Revisit',      // parked deliberately — come back to it
  SHIPPED:     'Shipped',
  WONT_FIX:    "Won't Fix",
}

export function createFeedbackItem(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    kind: FEEDBACK_KIND.IDEA,
    title: '',
    description: '',
    context: '',             // optional "where / expected" line (e.g. "Team tab, inside a production")
    screenshot: '',          // optional compressed JPEG data URL
    status: FEEDBACK_STATUS.NEW,
    submittedBy: '',         // user id
    submittedByName: '',     // snapshot at submit time (users can't always be looked up later)
    submittedAt: new Date().toISOString(),
    resolutionNote: '',      // admin-set when status moves to Shipped / Won't Fix
    ...overrides,
  }
}
