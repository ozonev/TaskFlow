import crypto from 'node:crypto';

export function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Short digest for journal lines, where the full tool input would be noise. */
export function digest(value: unknown): string {
  return sha256(typeof value === 'string' ? value : JSON.stringify(value ?? null)).slice(0, 12);
}
