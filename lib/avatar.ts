/** Deterministic gradient avatars derived from a string (name/id). */

const GRADIENTS = [
  "from-brand-purple to-brand-blue",
  "from-brand-blue to-brand-cyan",
  "from-brand-cyan to-brand-green",
  "from-brand-violet to-brand-purple",
  "from-brand-green to-brand-cyan",
  "from-fuchsia-500 to-brand-purple",
  "from-indigo-500 to-brand-blue",
  "from-sky-500 to-brand-cyan",
];

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** Pick a stable gradient class for a seed string. */
export function avatarGradient(seed: string): string {
  return GRADIENTS[hash(seed) % GRADIENTS.length];
}

/** Up to two initials from a name. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
