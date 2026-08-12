import fs from 'node:fs';

export type JournalEvent =
  | 'run.start'
  | 'run.input'
  | 'run.refused'
  | 'run.end'
  | 'worktree.created'
  | 'worktree.reused'
  | 'approval.accepted'
  | 'tool.decision'
  | 'tool.result'
  | 'assistant.turn'
  | 'assistant.final'
  | 'sdk.init'
  | 'sdk.result'
  | 'sdk.interrupt'
  | 'verify.step'
  | 'verify.skipped';

// Appends synchronously on every call. A Ctrl-C or a hard crash mid-run must still leave a complete record up to that point, which a buffered writer would lose, and the volume here (a few hundred lines) makes the cost irrelevant.
export class Journal {
  private readonly file: string;

  constructor(file: string) {
    this.file = file;
  }

  get path(): string {
    return this.file;
  }

  append(event: JournalEvent, payload: Record<string, unknown> = {}): void {
    const line = JSON.stringify({ ts: new Date().toISOString(), event, ...payload });
    fs.appendFileSync(this.file, `${line}\n`, 'utf8');
  }
}
