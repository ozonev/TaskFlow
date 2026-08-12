import path from 'node:path';
import { PreflightError } from './exit.js';

export interface Approval {
  approver: string;
  date: string;
  base: string;
}

export interface ArtifactFilenames {
  proposed: string;
  approved: string;
  /** What to call the artifact in error messages, e.g. "approved plan" / "approved ticket brief". */
  label: string;
}

// intake and plan each produce a proposal a human must review before the next phase will accept it as
// input. execute has no proposal file of its own (its input already carries the approval header), so
// this is only ever called for 'intake'/'plan'.
const ARTIFACT_NAMES: Record<'intake' | 'plan', ArtifactFilenames> = {
  intake: { proposed: 'ticket-brief.proposed.md', approved: 'ticket-brief.approved.md', label: 'approved ticket brief' },
  plan: { proposed: 'plan.proposed.md', approved: 'plan.approved.md', label: 'approved plan' },
};

export function filenamesFor(mode: 'intake' | 'plan'): ArtifactFilenames {
  return ARTIFACT_NAMES[mode];
}

// Deliberately strict: the header is the entire approval boundary, so a near-miss must fail rather than be generously interpreted.
const HEADER = /^<!--\s*approved-by:\s*(\S.*?)\s+(\d{4}-\d{2}-\d{2})\s+base:\s*([0-9a-fA-F]{7,40})\s*-->$/;

export function approvalHeaderExample(baseCommit: string): string {
  return `<!-- approved-by: Your Name ${new Date().toISOString().slice(0, 10)} base: ${baseCommit.slice(0, 12)} -->`;
}

export function parseApprovalHeader(fileText: string, label = 'approved plan'): Approval {
  const firstLine = fileText.split(/\r?\n/, 1)[0]?.trim() ?? '';
  const match = HEADER.exec(firstLine);
  if (match === null) {
    throw new PreflightError(
      `the ${label}'s first line is not an approval header.\n` +
        `  found:    ${firstLine === '' ? '(empty line)' : firstLine}\n` +
        `  expected: <!-- approved-by: Your Name YYYY-MM-DD base: <commit-sha> -->`,
    );
  }
  return { approver: match[1]!.trim(), date: match[2]!, base: match[3]!.toLowerCase() };
}

export interface ApprovalCheck {
  approvedPath: string;
  approvedText: string;
  proposedText: string | null;
  baseCommit: string;
  filenames: ArtifactFilenames;
}

// The three ways an "approved" plan (or ticket brief) can turn out not to be one. Ordered so the most likely operator mistake produces the most specific message.
export function verifyApproval(check: ApprovalCheck): Approval {
  const { approvedPath, approvedText, proposedText, baseCommit, filenames } = check;
  const { proposed, approved, label } = filenames;

  if (path.basename(approvedPath) === proposed) {
    throw new PreflightError(
      `${proposed} is the agent's proposal, not an ${label}.\n` +
        `  Review it, copy it to ${approved}, then add the approval header.`,
    );
  }

  if (proposedText !== null && approvedText === proposedText) {
    throw new PreflightError(
      `the ${label} is byte-identical to ${proposed}, so it carries no approval.\n` +
        `  Add this line at the top once you have actually reviewed it:\n` +
        `    ${approvalHeaderExample(baseCommit)}`,
    );
  }

  const approval = parseApprovalHeader(approvedText, label);

  if (!baseCommit.toLowerCase().startsWith(approval.base)) {
    throw new PreflightError(
      `the approval is for a different base commit than this worktree.\n` +
        `  approved against: ${approval.base}\n` +
        `  worktree base:    ${baseCommit.slice(0, 12)}\n` +
        `  Re-review against the current base, then update the header.`,
    );
  }

  const body = approvedText.split(/\r?\n/).slice(1).join('\n').trim();
  if (body === '') {
    throw new PreflightError(`the ${label} has an approval header but no content under it.`);
  }

  return approval;
}
