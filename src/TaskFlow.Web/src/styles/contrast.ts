/* WCAG 2.x relative luminance and contrast ratio, used only by contrast.test.ts.

   This exists because axe in jsdom cannot evaluate contrast — there is no layout
   and no paint, so the accessibility suite is structurally blind to the exact
   thing that drove the token-step decisions in overrides.css. Without an
   executable check those decisions are prose in a comment, and a future token
   edit could silently undo them. */

export function parseTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>()
  const pattern = /(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g
  for (const match of css.matchAll(pattern)) {
    const [, name, value] = match
    if (name && value) {
      tokens.set(name, value.toLowerCase())
    }
  }
  return tokens
}

function toChannels(hex: string): [number, number, number] {
  const raw = hex.replace('#', '')
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw
  const int = Number.parseInt(full.slice(0, 6), 16)
  return [(int >> 16) & 0xff, (int >> 8) & 0xff, int & 0xff]
}

export function relativeLuminance(hex: string): number {
  const linear = toChannels(hex).map((channel) => {
    const s = channel / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]

  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}
