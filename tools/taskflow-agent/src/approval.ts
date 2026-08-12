import path from 'node:path';
import { PreflightError } from './exit.js';

export interface Approval {
  approver: string;
  date: string;
  base: string;
}

export const PROPOSAL_FILENAME = 'plan.proposed.md';
export const APPROVED_FILENAME = 'plan.approved.md';

/**
 * Deliberately strict: the header is the entire approval boundary, so a
 * near-miss must fail rather than be generously interpreted.
 */
const HEADER = /^<!--\s*approved-by:\s*(\S.*?)\s+(\d{4}-\d{2}-\d{2})\s+base:\s*([0-9a-fA-F]{7,40})\s*-->$/;

export function approvalHeaderExample(baseCommit: string): string {
  return `<!-- approved-by: Your Name ${new Date().toISOString().slice(0, 10)} base: ${baseCommit.slice(0, 12)} -->`;
}

export function parseApprovalHeader(fileText: string): Approval {
  const firstLine = fileText.split(/\r?\n/, 1)[0]?.trim() ?? '';
  const match = HEADER.exec(firstLine);
  if (match === null) {
    throw new PreflightError(
      `the approved plan's first line is not an approval header.\n` +
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
}

/**
 * The three ways an "approved" plan can turn out not to be one. Ordered so the
 * most likely operator mistake produces the most specific message.
 */
export function verifyApproval(check: ApprovalCheck): Approval {
  const { approvedPath, approvedText, proposedText, baseCommit } = check;

  if (path.basename(approvedPath) === PROPOSAL_FILENAME) {
    throw new PreflightError(
      `${PROPOSAL_FILENAME} is the agent's proposal, not an approved plan.\n` +
        `  Review it, copy it to ${APPROVED_FILENAME}, then add the approval header.`,
    );
  }

  if (proposedText !== null && approvedText === proposedText) {
    throw new PreflightError(
      `the approved plan is byte-identical to ${PROPOSAL_FILENAME}, so it carries no approval.\n` +
        `  Add this line at the top once you have actually reviewed it:\n` +
        `    ${approvalHeaderExample(baseCommit)}`,
    );
  }

  const approval = parseApprovalHeader(approvedText);

  if (!baseCommit.toLowerCase().startsWith(approval.base)) {
    throw new PreflightError(
      `the approval is for a different base commit than this worktree.\n` +
        `  approved against: ${approval.base}\n` +
        `  worktree base:    ${baseCommit.slice(0, 12)}\n` +
        `  Re-review the plan against the current base, then update the header.`,
    );
  }

  const body = approvedText.split(/\r?\n/).slice(1).join('\n').trim();
  if (body === '') {
    throw new PreflightError('the approved plan has an approval header but no plan under it.');
  }

  return approval;
}
