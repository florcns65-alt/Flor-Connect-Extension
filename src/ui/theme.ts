export const theme = {
  bg: "#f4f1ea",
  surface: "#ffffff",
  ink: "#1c2420",
  muted: "#5e675f",
  faint: "#8a9188",
  primary: "#1b5e4c",
  primaryDeep: "#15493c",
  sage: "#e5f0ea",
  sageDeep: "#d5e4db",
  line: "#e6e1d8",
  good: "#2f7d5b",
  warn: "#b7771f",
  danger: "#a33d3d",
  dangerBg: "#fdeceb",
  shadow: "0 10px 28px rgba(48, 58, 50, 0.06)",
  radius: "22px",
  font: '"Segoe UI", ui-sans-serif, system-ui, -apple-system, sans-serif',
} as const;

export function applyTheme(target: HTMLElement = document.documentElement): void {
  const entries: Array<[string, string]> = [
    ["--bg", theme.bg],
    ["--surface", theme.surface],
    ["--ink", theme.ink],
    ["--muted", theme.muted],
    ["--faint", theme.faint],
    ["--primary", theme.primary],
    ["--primary-deep", theme.primaryDeep],
    ["--sage", theme.sage],
    ["--sage-deep", theme.sageDeep],
    ["--line", theme.line],
    ["--good", theme.good],
    ["--warn", theme.warn],
    ["--danger", theme.danger],
    ["--danger-bg", theme.dangerBg],
    ["--shadow", theme.shadow],
    ["--radius", theme.radius],
    ["--font", theme.font],
  ];
  for (const [name, value] of entries) target.style.setProperty(name, value);
}
