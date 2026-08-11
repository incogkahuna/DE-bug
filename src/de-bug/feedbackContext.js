import { createContext, useContext } from 'react'

// Context lives in its own module so FeedbackProvider, FeedbackWidget and
// FeedbackPage can all import it without circular imports.
export const FeedbackContext = createContext(null)

export function useFeedback() {
  const ctx = useContext(FeedbackContext)
  if (!ctx) throw new Error('useFeedback must be used within FeedbackProvider')
  return ctx
}
