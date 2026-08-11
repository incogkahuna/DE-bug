// ─── Tailwind preset for DE-bug ──────────────────────────────────────────────
// Adds the `orbital` color scale the kit's JSX uses (text-orbital-text,
// bg-orbital-surface, border-orbital-border, …). Values route through the CSS
// variables defined in styles/de-bug.css, so light/dark and any
// re-theming happen in CSS — this preset never needs to change.
//
// Usage (tailwind.config.js):
//   import deBug from './src/de-bug/tailwind.preset.js'
//   export default {
//     presets: [deBug],
//     content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],  // must cover the kit folder
//     ...
//   }
//
// Deliberately minimal: no font, radius, or animation overrides, so dropping
// it into an existing app never changes the host's look. (Balance's hard-edge
// aesthetic comes from its own global borderRadius override — see README.)
export default {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        orbital: {
          bg:      'var(--orbital-bg)',
          surface: 'var(--orbital-surface)',
          panel:   'var(--orbital-panel)',
          border:  'var(--orbital-border)',
          chrome:  'var(--orbital-chrome)',
          muted:   'var(--orbital-muted)',
          text:    'var(--orbital-text)',
          subtle:  'var(--orbital-subtle)',
          dim:     'var(--orbital-dim)',
        },
      },
    },
  },
}
