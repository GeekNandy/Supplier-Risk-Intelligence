/**
 * Resolved Siemens iX theme colours for SVG charts. Recharts writes colours into SVG attributes,
 * so the iX CSS variables are read once from the document instead of hard-coding hex values.
 */
export type ThemeColors = {
  primary: string;
  success: string;
  warning: string;
  critical: string;
  alarm: string;
  neutral: string;
  text: string;
  softText: string;
  grid: string;
  surface: string;
  series: string[];
};

let cached: ThemeColors | null = null;

const read = (style: CSSStyleDeclaration, name: string) => style.getPropertyValue(`--theme-${name}`).trim();

export function themeColors(): ThemeColors {
  if (cached && cached.primary) return cached;
  const style = getComputedStyle(document.documentElement);
  cached = {
    primary: read(style, 'color-primary'),
    success: read(style, 'color-success'),
    warning: read(style, 'color-warning'),
    critical: read(style, 'color-critical'),
    alarm: read(style, 'color-alarm'),
    neutral: read(style, 'color-neutral'),
    text: read(style, 'color-std-text'),
    softText: read(style, 'color-soft-text'),
    grid: read(style, 'color-x-weak-bdr'),
    surface: read(style, 'color-2'),
    // Shortlist series: iX chart palette entries that do not clash with the risk-level colours.
    series: [read(style, 'color-primary'), read(style, 'chart-10'), read(style, 'chart-16')],
  };
  return cached;
}

/** Dataset risk level → iX status colour. */
export function levelColor(level: string): string {
  const colors = themeColors();
  return ({ Low: colors.success, Medium: colors.warning, High: colors.critical, Critical: colors.alarm } as Record<string, string>)[level] ?? colors.neutral;
}
