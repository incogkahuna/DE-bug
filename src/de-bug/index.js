// ─── Bugs & Ideas kit — public API ───────────────────────────────────────────
// Typical integration needs only FeedbackProvider + FeedbackPage; everything
// else is exported for apps that want to compose the pieces differently.

export { FeedbackProvider } from './FeedbackProvider.jsx'
export { useFeedback } from './feedbackContext.js'
export { FeedbackPage } from './FeedbackPage.jsx'
export { FeedbackWidget } from './FeedbackWidget.jsx'

export { ToastProvider, useToast } from './ToastContext.jsx'
export { Modal } from './ui/Modal.jsx'
export { ConfirmDialog } from './ui/ConfirmDialog.jsx'
export { ScreenshotAttach } from './ScreenshotAttach.jsx'

export {
  FEEDBACK_KIND,
  FEEDBACK_KIND_LABEL,
  FEEDBACK_STATUS,
  createFeedbackItem,
} from './models.js'

export {
  formatFeedbackPrompt,
  formatFeedbackPromptBatch,
  copyText,
} from './feedbackPrompt.js'

export { createSupabaseFeedbackStore } from './supabaseStore.js'
export { fileToJpegDataUrl } from './lib/imageDataUrl.js'
