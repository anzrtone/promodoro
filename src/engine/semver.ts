/** Just enough semver for "is the release on GitHub newer than this build?". Tags look like `v0.1.2`. */

export interface Version {
  parts: [number, number, number];
  /** Anything after a `-`, e.g. `beta.1`. A prerelease sorts before the same version without one. */
  pre: string;
}

export function parseVersion(raw: string): Version | null {
  const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(raw.trim());
  if (!m) return null;
  return { parts: [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)], pre: m[4] ?? '' };
}

/** Negative, zero or positive like a sort comparator; null when either side isn't a version. */
export function compareVersions(a: string, b: string): number | null {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x.parts[i] !== y.parts[i]) return x.parts[i] - y.parts[i];
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre < y.pre ? -1 : 1;
}

export const isNewerVersion = (candidate: string, current: string): boolean => (compareVersions(candidate, current) ?? 0) > 0;

/** `v0.1.2` → `0.1.2`. */
export const cleanVersion = (raw: string): string => raw.trim().replace(/^v/i, '');
