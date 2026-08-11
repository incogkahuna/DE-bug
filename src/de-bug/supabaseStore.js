// ─── Supabase storage adapter ────────────────────────────────────────────────
// Direct port of Balance's feedback data layer, parameterized by client so the
// kit doesn't own your Supabase setup. Pass any @supabase/supabase-js v2
// client; the table comes from supabase/migrations/ in this repo.
//
// Item shape (camelCase, see models.js):
//   { id, kind, title, description, context, screenshot, status,
//     submittedBy, submittedByName, resolutionNote, submittedAt, updatedAt }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const asUuidOrNull = (v) =>
  typeof v === 'string' && UUID_RE.test(v) ? v : null

function rowToItem(r) {
  return {
    id:              r.id,
    kind:            r.kind,
    title:           r.title,
    description:     r.description,
    context:         r.context ?? '',
    screenshot:      r.screenshot ?? '',
    status:          r.status,
    submittedBy:     r.submitted_by,
    submittedByName: r.submitted_by_name,
    resolutionNote:  r.resolution_note,
    submittedAt:     r.created_at,
    updatedAt:       r.updated_at,
  }
}

function itemToRow(i) {
  const row = {}
  if (i.id              !== undefined) row.id                = i.id
  if (i.kind            !== undefined) row.kind              = i.kind
  if (i.title           !== undefined) row.title             = i.title
  if (i.description     !== undefined) row.description       = i.description
  if (i.status          !== undefined) row.status            = i.status
  if (i.submittedBy     !== undefined) row.submitted_by      = asUuidOrNull(i.submittedBy)
  if (i.submittedByName !== undefined) row.submitted_by_name = i.submittedByName
  if (i.resolutionNote  !== undefined) row.resolution_note   = i.resolutionNote
  // Only reference the newer columns when they carry data, so a plain report
  // still inserts on a DB where the context/screenshot columns migration
  // hasn't been run yet. Empty values are omitted rather than sent as ''.
  if (i.context)    row.context    = i.context
  if (i.screenshot) row.screenshot = i.screenshot
  return row
}

export function createSupabaseFeedbackStore(supabase, { table = 'feedback_items' } = {}) {
  async function list() {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(rowToItem)
  }

  async function create(item) {
    if (!item.title) throw new Error('Feedback title is required')
    const { data, error } = await supabase
      .from(table)
      .insert(itemToRow(item))
      .select('*')
      .single()
    if (error) throw error
    return rowToItem(data)
  }

  async function update(id, patch) {
    const { data, error } = await supabase
      .from(table)
      .update(itemToRow(patch))
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return rowToItem(data)
  }

  async function remove(id) {
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) throw error
  }

  // subscribe(onChange) — realtime postgres_changes. onChange receives
  // { type: 'INSERT'|'UPDATE', row } or { type: 'DELETE', id }.
  // Returns an unsubscribe function.
  function subscribe(onChange) {
    const channel = supabase
      .channel(`${table}-changes`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            onChange({ type: 'INSERT', row: rowToItem(payload.new) })
          } else if (payload.eventType === 'UPDATE') {
            onChange({ type: 'UPDATE', row: rowToItem(payload.new) })
          } else if (payload.eventType === 'DELETE') {
            const id = payload.old?.id
            if (id) onChange({ type: 'DELETE', id })
          }
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }

  return { list, create, update, remove, subscribe }
}
