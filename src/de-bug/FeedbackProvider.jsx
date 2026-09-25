import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { FeedbackContext } from './feedbackContext.js'
import { ToastProvider, useToast } from './ToastContext.jsx'
import { createSupabaseFeedbackStore } from './supabaseStore.js'
import { FeedbackWidget } from './FeedbackWidget.jsx'

// ─── FeedbackProvider ────────────────────────────────────────────────────────
// Self-contained state + persistence for the Bugs & Ideas kit — the extracted
// equivalent of Balance's AppContext feedback wiring.
//
// Storage modes (same graceful degrade as Balance):
//   remote — pass a Supabase client via `supabase`; items live in the
//            feedback_items table, synced across browsers via realtime.
//   local  — no client (or the table/list call fails, e.g. pre-migration):
//            items persist to localStorage, per browser. Any local reports are
//            imported to the table once remote mode comes online.
//
// Props:
//   supabase   Supabase client (optional — omit for localStorage mode)
//   user       { id, name } of the signed-in user (optional)
//   canTriage  can change status / resolution notes (default false)
//   canDelete  can delete reports (default: same as canTriage)
//   canFlagForAgent  may flag a report "🤖 Send to an agent as a prompt"
//              (default false). A boolean, or a function of the current user:
//              `(user) => boolean`. Only a trusted reporter should get it: an
//              agent watcher acts on flagged reports, and the report text is
//              untrusted input. This is the UI gate; the agent_prompt migration
//              adds the database gate (see README → "Agent watch").
//   appInfo    { name, description } — describes YOUR app in exported prompts
//   widget     mount the floating report widget on every page (default true).
//              Set false to opt out app-wide, or place <FeedbackWidget />
//              yourself wherever you want it.
//   storageKey prefix for the kit's localStorage keys (default 'bugs_ideas')
export function FeedbackProvider(props) {
  return (
    <ToastProvider>
      <FeedbackCore {...props} />
    </ToastProvider>
  )
}

function FeedbackCore({
  children,
  supabase = null,
  user = null,
  canTriage = false,
  canDelete,
  canFlagForAgent = false,
  appInfo = null,
  widget = true,
  storageKey = 'bugs_ideas',
}) {
  const toast = useToast()

  const ITEMS_KEY = `${storageKey}_items_v1`
  const readLocalFeedback = useCallback(() => {
    try {
      const raw = window.localStorage.getItem(ITEMS_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      return Array.isArray(parsed) ? parsed : []
    } catch { return [] }
  }, [ITEMS_KEY])

  const [feedbackItems, setFeedbackItemsState] = useState(() =>
    typeof window === 'undefined' ? [] : readLocalFeedback())
  const feedbackModeRef = useRef('local') // 'local' | 'remote'

  const store = useMemo(
    () => (supabase ? createSupabaseFeedbackStore(supabase) : null),
    [supabase],
  )

  // Keep the latest user in a ref so the CRUD callbacks don't need it as a
  // dep (callers pass it fresh each render).
  const userRef = useRef(user)
  useEffect(() => { userRef.current = user }, [user])

  // Who may flag a report for an agent: the host app decides (boolean, or a
  // function of the current user). Anything but a true answer means no.
  const mayFlagForAgent = typeof canFlagForAgent === 'function'
    ? canFlagForAgent(user) === true
    : canFlagForAgent === true
  const mayFlagRef = useRef(mayFlagForAgent)
  useEffect(() => { mayFlagRef.current = mayFlagForAgent }, [mayFlagForAgent])

  // ─── Hydrate from Supabase + subscribe to realtime ─────────────────────────
  // Re-runs when the user signs in (user?.id), so a list that failed under RLS
  // before auth retries once a session exists.
  useEffect(() => {
    if (!store) return
    let cancelled = false

    store.list()
      .then(async (rows) => {
        if (cancelled) return
        feedbackModeRef.current = 'remote'
        setFeedbackItemsState(rows)
        // One-time import of any pre-remote local reports.
        const local = readLocalFeedback()
        if (local.length > 0) {
          for (const item of local) {
            if (!item?.title) continue
            try {
              const created = await store.create({
                id: item.id,
                kind: item.kind || 'note',
                title: item.title,
                description: item.description || '',
                context: item.context || '',
                screenshot: item.screenshot || '',
                status: item.status || 'New',
                submittedBy: item.submittedBy || userRef.current?.id || null,
                submittedByName: item.submittedByName || '',
                resolutionNote: item.resolutionNote || '',
                agentPrompt: item.agentPrompt === true,
              })
              setFeedbackItemsState(prev => prev.some(f => f.id === created.id) ? prev : [created, ...prev])
            } catch (err) {
              if (err?.code !== '23505') {
                console.warn('[FeedbackProvider] feedback import halted:', err?.message || err)
                return
              }
            }
          }
          try {
            window.localStorage.setItem(`${ITEMS_KEY}_backup`, JSON.stringify(local))
            window.localStorage.removeItem(ITEMS_KEY)
          } catch { /* noop */ }
        }
      })
      .catch(() => {
        // Table missing (pre-migration) or not authorized yet — stay local.
        if (!cancelled) feedbackModeRef.current = 'local'
      })

    const unsub = store.subscribe((event) => {
      setFeedbackItemsState((prev) => {
        if (event.type === 'INSERT') {
          if (prev.some(f => f.id === event.row.id)) return prev
          return [event.row, ...prev]
        }
        if (event.type === 'UPDATE') return prev.map(f => f.id === event.row.id ? event.row : f)
        if (event.type === 'DELETE') return prev.filter(f => f.id !== event.id)
        return prev
      })
    })

    return () => { cancelled = true; unsub() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, user?.id])

  // Local-mode persistence (no Supabase / pre-migration only).
  useEffect(() => {
    if (feedbackModeRef.current !== 'local') return
    try {
      window.localStorage.setItem(ITEMS_KEY, JSON.stringify(feedbackItems))
    } catch { /* noop */ }
  }, [feedbackItems, ITEMS_KEY])

  // ─── CRUD (optimistic; remote errors roll back + toast) ────────────────────
  const addFeedbackItem = useCallback((item) => {
    const full = {
      ...item,
      // only a reporter the app trusts can flag a report for an agent
      agentPrompt: item.agentPrompt === true && mayFlagRef.current,
      submittedBy: item.submittedBy || userRef.current?.id || '',
      submittedByName: item.submittedByName || userRef.current?.name || 'Anonymous',
      submittedAt: item.submittedAt || new Date().toISOString(),
    }
    setFeedbackItemsState(prev => [full, ...prev])
    if (feedbackModeRef.current !== 'remote') return
    store.create(full).catch((err) => {
      console.error('[FeedbackProvider] addFeedbackItem failed:', err)
      toast.error(`Couldn't send feedback — ${err?.message || 'unknown error'}`)
      setFeedbackItemsState(prev => prev.filter(f => f.id !== full.id))
    })
  }, [store, toast])

  const updateFeedbackItem = useCallback((id, patch) => {
    // setting the agent flag needs the same trust as filing with it; clearing it doesn't
    if (patch.agentPrompt === true && !mayFlagRef.current) {
      const { agentPrompt: _dropped, ...rest } = patch
      patch = rest
      if (Object.keys(patch).length === 0) return
    }
    let prevItem = null
    setFeedbackItemsState(prev => prev.map(f => {
      if (f.id !== id) return f
      prevItem = f
      return { ...f, ...patch, updatedAt: new Date().toISOString() }
    }))
    if (feedbackModeRef.current !== 'remote') return
    store.update(id, patch).catch((err) => {
      console.error('[FeedbackProvider] updateFeedbackItem failed:', err)
      toast.error(`Couldn't save feedback changes — ${err?.message || 'unknown error'}`)
      if (prevItem) setFeedbackItemsState(prev => prev.map(f => f.id === id ? prevItem : f))
    })
  }, [store, toast])

  const deleteFeedbackItem = useCallback((id) => {
    setFeedbackItemsState(prev => prev.filter(f => f.id !== id))
    if (feedbackModeRef.current !== 'remote') return
    store.remove(id).catch((err) => {
      console.error('[FeedbackProvider] deleteFeedbackItem failed:', err)
      toast.error(`Couldn't delete feedback — ${err?.message || 'unknown error'}. Refresh to restore.`)
    })
  }, [store, toast])

  // ─── Widget visibility (the kit's one addition over Balance) ───────────────
  // A per-browser "hide the floating widget" toggle, persisted so it stays
  // hidden across reloads. Hide from the widget panel itself; bring it back
  // from the Bugs & Ideas board header.
  const HIDDEN_KEY = `${storageKey}_widget_hidden_v1`
  const [widgetHidden, setWidgetHiddenState] = useState(() => {
    try { return window.localStorage.getItem(HIDDEN_KEY) === '1' } catch { return false }
  })
  const setWidgetHidden = useCallback((hidden) => {
    setWidgetHiddenState(hidden)
    try {
      if (hidden) window.localStorage.setItem(HIDDEN_KEY, '1')
      else window.localStorage.removeItem(HIDDEN_KEY)
    } catch { /* noop */ }
  }, [HIDDEN_KEY])

  const value = {
    user,
    canTriage,
    canDelete: canDelete ?? canTriage,
    canFlagForAgent: mayFlagForAgent,
    appInfo,
    storageKey,
    // Items + CRUD
    feedbackItems,
    addFeedbackItem,
    updateFeedbackItem,
    deleteFeedbackItem,
    // Widget visibility
    widgetEnabled: widget,
    widgetHidden,
    setWidgetHidden,
  }

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {widget && <FeedbackWidget />}
    </FeedbackContext.Provider>
  )
}
