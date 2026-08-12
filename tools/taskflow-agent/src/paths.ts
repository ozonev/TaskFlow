import fs from 'node:fs';
import path from 'node:path';

export function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Windows paths differ in case and separator between what git prints (forward
 * slashes) and what path.resolve produces (backslashes), so every comparison
 * has to go through here rather than using ===.
 */
export function normalizeForCompare(p: string): string {
  const normalized = toPosix(path.resolve(p)).replace(/\/+$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

export function samePath(a: string, b: string): boolean {
  return normalizeForCompare(a) === normalizeForCompare(b);
}

export function isInsideDir(child: string, parent: string): boolean {
  const rel = path.relative(normalizeForCompare(parent), normalizeForCompare(child));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Resolves symlinks as far up the path as actually exists, then re-appends the
 * missing tail. `fs.realpathSync` throws on a path that does not exist yet, but
 * a jail check has to work for files the agent is about to create — and it has
 * to see through a symlinked parent directory, which plain path.resolve cannot.
 */
export function realpathNearest(target: string): string {
  const absolute = path.resolve(target);
  const missing: string[] = [];
  let current = absolute;

  for (;;) {
    try {
      const real = fs.realpathSync(current);
      return missing.length > 0 ? path.join(real, ...missing.reverse()) : real;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return absolute;
      missing.push(path.basename(current));
      current = parent;
    }
  }
}
