// Crash-proof drop-in for date-fns `format`.
//
// `format(parseISO(x), …)` where x is truthy but unparseable throws a
// RangeError inside render, killing the whole page. This wrapper is used
// wherever the kit formats dates for DISPLAY: on any invalid input it renders
// '' instead of throwing. A page must never die because one row carries a bad
// date.
import { format as dfFormat } from 'date-fns'

export function format(date, pattern, options) {
  try {
    return dfFormat(date, pattern, options)
  } catch {
    return ''
  }
}
