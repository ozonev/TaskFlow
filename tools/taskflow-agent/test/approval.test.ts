import assert from 'node:assert/strict';
import path from 'node:path';
import test, { describe } from 'node:test';
import { filenamesFor, parseApprovalHeader, verifyApproval } from '../src/approval.js';
import { PreflightError } from '../src/exit.js';

const BASE = '539b3f3e1a2b4c5d6e7f8091a2b3c4d5e6f70819';
const PLAN_FILENAMES = filenamesFor('plan');
const APPROVED_PATH = path.join('artifacts', 'run-1', PLAN_FILENAMES.approved);
const HEADER = `<!-- approved-by: Vitalii Ilchenko 2026-08-11 base: ${BASE.slice(0, 12)} -->`;
const BODY = '\n\n## Plan\n\nChange src/Foo.cs.\n';

function check(overrides: Partial<Parameters<typeof verifyApproval>[0]> = {}) {
  return verifyApproval({
    approvedPath: APPROVED_PATH,
    approvedText: HEADER + BODY,
    proposedText: 'a proposal without a header\n',
    baseCommit: BASE,
    filenames: PLAN_FILENAMES,
    ...overrides,
  });
}

describe('parseApprovalHeader', () => {
  test('accepts a well-formed header', () => {
    const approval = parseApprovalHeader(HEADER + BODY);
    assert.equal(approval.approver, 'Vitalii Ilchenko');
    assert.equal(approval.date, '2026-08-11');
    assert.equal(approval.base, BASE.slice(0, 12));
  });

  test('accepts a full-length sha and lowercases it', () => {
    const approval = parseApprovalHeader(`<!-- approved-by: A B 2026-01-02 base: ${BASE.toUpperCase()} -->${BODY}`);
    assert.equal(approval.base, BASE);
  });

  test('tolerates CRLF line endings', () => {
    assert.equal(parseApprovalHeader(`${HEADER}\r\nbody\r\n`).date, '2026-08-11');
  });

  for (const [label, text] of [
    ['an empty file', ''],
    ['a plain heading', '# My plan\n\nstuff'],
    ['a header on the second line', `# Plan\n${HEADER}\n`],
    ['a missing approver', '<!-- approved-by: 2026-08-11 base: 539b3f3e1a2b -->'],
    ['a missing date', '<!-- approved-by: Someone base: 539b3f3e1a2b -->'],
    ['a malformed date', '<!-- approved-by: Someone 11-08-2026 base: 539b3f3e1a2b -->'],
    ['a too-short sha', '<!-- approved-by: Someone 2026-08-11 base: 539b3f -->'],
    ['a non-hex sha', '<!-- approved-by: Someone 2026-08-11 base: zzzzzzzzzzzz -->'],
    ['a missing base', '<!-- approved-by: Someone 2026-08-11 -->'],
    ['an unclosed comment', '<!-- approved-by: Someone 2026-08-11 base: 539b3f3e1a2b'],
  ] as const) {
    test(`rejects ${label}`, () => {
      assert.throws(() => parseApprovalHeader(text), PreflightError);
    });
  }
});

describe('verifyApproval', () => {
  test('accepts a reviewed and approved plan', () => {
    assert.equal(check().approver, 'Vitalii Ilchenko');
  });

  test('accepts an abbreviated base that prefixes the real commit', () => {
    assert.doesNotThrow(() =>
      check({ approvedText: `<!-- approved-by: A B 2026-08-11 base: ${BASE.slice(0, 7)} -->${BODY}` }),
    );
  });

  test('refuses the proposal file itself, by name', () => {
    assert.throws(
      () => check({ approvedPath: path.join('artifacts', 'run-1', PLAN_FILENAMES.proposed) }),
      /is the agent's proposal, not an approved plan/,
    );
  });

  test('refuses a copy that is byte-identical to the proposal', () => {
    const proposal = '# Plan\n\nDo the thing.\n';
    assert.throws(
      () => check({ approvedText: proposal, proposedText: proposal }),
      /byte-identical/,
    );
  });

  test('refuses an approval bound to a different base commit', () => {
    assert.throws(
      () => check({ approvedText: `<!-- approved-by: A B 2026-08-11 base: aaaaaaaaaaaa -->${BODY}` }),
      /different base commit/,
    );
  });

  test('refuses a header with no plan under it', () => {
    assert.throws(() => check({ approvedText: `${HEADER}\n\n   \n` }), /no content under it/);
  });

  test('an edited copy is accepted — the reviewer may change the plan', () => {
    assert.doesNotThrow(() => check({ approvedText: `${HEADER}\n\nA completely different plan.\n` }));
  });

  test('works when no proposal file exists at all', () => {
    assert.doesNotThrow(() => check({ proposedText: null }));
  });
});

describe('filenamesFor', () => {
  test('plan uses plan.proposed.md / plan.approved.md', () => {
    const filenames = filenamesFor('plan');
    assert.equal(filenames.proposed, 'plan.proposed.md');
    assert.equal(filenames.approved, 'plan.approved.md');
  });

  test('intake uses ticket-brief.proposed.md / ticket-brief.approved.md', () => {
    const filenames = filenamesFor('intake');
    assert.equal(filenames.proposed, 'ticket-brief.proposed.md');
    assert.equal(filenames.approved, 'ticket-brief.approved.md');
  });
});

// Re-runs a representative subset of the verifyApproval scenarios above against intake's filenames,
// to prove the generalization is genuinely parametric and didn't just special-case "plan" internally.
describe('verifyApproval — parametric over filenamesFor', () => {
  const INTAKE_FILENAMES = filenamesFor('intake');

  function checkIntake(overrides: Partial<Parameters<typeof verifyApproval>[0]> = {}) {
    return verifyApproval({
      approvedPath: path.join('artifacts', 'run-1', INTAKE_FILENAMES.approved),
      approvedText: HEADER + BODY,
      proposedText: 'a proposal without a header\n',
      baseCommit: BASE,
      filenames: INTAKE_FILENAMES,
      ...overrides,
    });
  }

  test('accepts a reviewed and approved ticket brief', () => {
    assert.equal(checkIntake().approver, 'Vitalii Ilchenko');
  });

  test('refuses the proposal file itself, by name, and says "ticket brief"', () => {
    assert.throws(
      () => checkIntake({ approvedPath: path.join('artifacts', 'run-1', INTAKE_FILENAMES.proposed) }),
      /is the agent's proposal, not an approved ticket brief/,
    );
  });

  test('refuses a copy that is byte-identical to the proposal, and says "ticket brief"', () => {
    const proposal = '# Brief\n\nDo the thing.\n';
    assert.throws(
      () => checkIntake({ approvedText: proposal, proposedText: proposal }),
      /approved ticket brief is byte-identical/,
    );
  });

  test('refuses an approval bound to a different base commit', () => {
    assert.throws(
      () => checkIntake({ approvedText: `<!-- approved-by: A B 2026-08-11 base: aaaaaaaaaaaa -->${BODY}` }),
      /different base commit/,
    );
  });

  test('refuses a header with no content under it', () => {
    assert.throws(() => checkIntake({ approvedText: `${HEADER}\n\n   \n` }), /approved ticket brief has an approval header but no content/);
  });
});
