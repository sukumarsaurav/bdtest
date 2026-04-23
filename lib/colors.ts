/**
 * colors.ts — single source of truth for the Flix brand palette.
 *
 * ONLY 4 hex codes + intensity variants. No exceptions.
 *   #FFAD00  amber     — overpaying, warnings, high-cost
 *   #73D700  green     — healthy, positive, Flix brand accent
 *   #FFFFFF  white     — page backgrounds, card surfaces
 *   #444444  charcoal  — headers, body text, dark backgrounds
 */

export const C = {
  amber:     '#FFAD00',
  amberTint: 'rgba(255,173,0,0.25)',  // marginal state (lighter, same hue)
  green:     '#73D700',
  white:     '#FFFFFF',
  charcoal:  '#444444',
  border:    'rgba(68,68,68,0.15)',    // card borders (visible on white bg)
} as const

// Keep legacy name for existing imports
export const COLORS = C

/** Chart series palette — 4 brand colors + opacity variants. */
export const CHART_COLORS = [
  '#73D700',  // green
  '#FFAD00',  // amber
  '#444444',  // charcoal
  '#B9EB80',  // green 50%
  '#FFD680',  // amber 50%
  '#888888',  // charcoal 50%
  '#FFFFFF',  // white
] as const

/** Health status → brand color mapping.
 *  overpaying = solid amber, marginal = amber tint (same hue, different weight). */
export const HEALTH_COLORS: Record<string, string> = {
  healthy:    '#73D700',
  marginal:   '#FFAD00',
  overpaying: '#FFAD00',
  unknown:    '#444444',
}

/** Health badge styles for inline use.
 *  Marginal = light amber tint + amber border (visually distinct from solid overpaying). */
export const HEALTH_BADGE_STYLES: Record<string, { bg: string; text: string; border?: string }> = {
  healthy:    { bg: '#73D700', text: '#FFFFFF' },
  marginal:   { bg: 'rgba(255,173,0,0.18)', text: '#444444', border: '1.5px solid #FFAD00' },
  overpaying: { bg: '#FFAD00', text: '#444444' },
  unknown:    { bg: 'rgba(68,68,68,0.08)', text: '#444444', border: '1px solid rgba(68,68,68,0.2)' },
}

/** Priority badge colors. */
export const PRIORITY_COLORS: Record<string, string> = {
  HIGH: '#FFAD00',
  MED:  '#FFAD00',
  LOW:  '#444444',
}

/** Border color for card edges (visible on white backgrounds). */
export const BORDER_COLOR = 'rgba(68, 68, 68, 0.15)'
