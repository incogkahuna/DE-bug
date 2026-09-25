// ─── Minimal integration example ─────────────────────────────────────────────
// Copy src/de-bug/ into your app first (see README), then wire it up
// like this. Works with or without Supabase — omit the `supabase` prop and
// reports persist to localStorage instead.

import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { createClient } from '@supabase/supabase-js'
import { FeedbackProvider, FeedbackPage } from '../src/de-bug/index.js'
import '../src/de-bug/styles/de-bug.css'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

// In a real app this comes from your auth context.
const currentUser = { id: 'a0000000-0000-0000-0000-000000000001', name: 'Danny', role: 'admin' }

export default function ExampleApp() {
  return (
    <BrowserRouter>
      <FeedbackProvider
        supabase={supabase}                 // omit for localStorage-only mode
        user={currentUser}
        canTriage={true}                    // gate on your app's roles
        // who may tick "🤖 Send to an agent as a prompt" — trusted reporters only
        // (a boolean, or a function of the user). Default false. See README → Agent watch.
        canFlagForAgent={(user) => user?.role === 'admin'}
        appInfo={{
          name: 'MyApp',
          description: 'a React 18 + Vite + Tailwind + Supabase app (pages in `src/pages/`, data layer in `src/lib/`)',
        }}
        // widget={false}                   // app-wide off switch for the floating widget
      >
        <nav className="p-4">
          <Link to="/feedback" className="btn-secondary">Bugs &amp; Ideas</Link>
        </nav>
        <Routes>
          <Route path="/feedback" element={<FeedbackPage />} />
          <Route path="*" element={<p className="p-4 text-orbital-subtle">Your app here.</p>} />
        </Routes>
      </FeedbackProvider>
    </BrowserRouter>
  )
}
