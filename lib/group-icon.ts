const PALETTE = [
  { bg: "var(--color-blue-bg)", fg: "var(--color-blue)" },
  { bg: "var(--color-teal-bg)", fg: "var(--color-teal)" },
  { bg: "var(--color-amber-bg)", fg: "var(--color-amber)" },
  { bg: "var(--color-pink-bg)", fg: "var(--color-pink)" },
  { bg: "var(--color-green-bg)", fg: "var(--color-green)" },
];

export function groupIcon(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const { bg, fg } = PALETTE[hash % PALETTE.length];
  return { letter: (name[0] ?? "?").toUpperCase(), bg, fg };
}
