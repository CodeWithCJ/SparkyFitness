const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { load } = require('js-yaml');

const workflow = load(
  readFileSync(resolve(__dirname, '../workflows/pr-validation.yml'), 'utf8'),
);
const script = workflow.jobs.validate.steps.find(
  (step) => step.uses === 'actions/github-script@v7',
).with.script;
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const validate = new AsyncFunction(
  'github',
  'context',
  'core',
  'require',
  'process',
  script,
);
const body = [
  '## Description',
  'Fix a backend import that creates duplicate entries.',
  '- [x] Issue (bug fix)',
  '- [x] **[MANDATORY - ALL] Integrity & License**',
  '- [x] **No AI**: I wrote this change without AI tools.',
].join('\n');
const migration = (name, patch = '') => ({
  filename: `SparkyFitnessServer/db/migrations/${name}.sql`,
  status: 'added',
  patch,
});

/** Run the actual workflow script with fork-style read-only API permissions on review events. */
async function run(eventName, options = {}) {
  const writes = [];
  const errors = [];
  const failures = [];
  let summary = '';
  let pages = 0;
  /** Reject API mutations that would fail with a fork review token. */
  const write = (name) => async (params) => {
    assert.equal(
      eventName,
      'pull_request_target',
      `read-only event attempted ${name}`,
    );
    writes.push({ name, params });
    return {};
  };
  const github = {
    rest: {
      pulls: { listFiles: 'listFiles', update: write('updatePR') },
      issues: {
        addLabels: write('addLabels'),
        removeLabel: write('removeLabel'),
        createLabel: write('createLabel'),
        updateLabel: write('updateLabel'),
        createComment: write('createComment'),
        updateComment: write('updateComment'),
        listComments: async () => ({ data: options.comments || [] }),
      },
    },
    paginate: async () =>
      options.files || [{ filename: 'SparkyFitnessServer/models/exercise.ts' }],
    graphql: async (query, { cursor }) => {
      assert.equal(cursor, pages === 0 ? null : 'next');
      const nodes = pages++ === 0 ? [] : options.threads || [];
      return {
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes,
              pageInfo: { hasNextPage: pages === 1, endCursor: 'next' },
            },
          },
        },
      };
    },
  };
  const context = {
    eventName,
    repo: { owner: 'owner', repo: 'repo' },
    payload: {
      pull_request: {
        number: 12,
        title: options.title ?? 'fix: duplicate import',
        body: options.body ?? body,
        draft: false,
        user: { type: 'User' },
        author_association: 'CONTRIBUTOR',
        head: { repo: { full_name: 'contributor/repo' }, ref: 'fix/import' },
        base: { repo: { full_name: 'owner/repo' } },
      },
    },
  };
  const core = {
    error: (message) => errors.push(message),
    setFailed: (message) => failures.push(message),
    warning() {},
    notice() {},
    info() {},
    summary: {
      addRaw(message) {
        summary = message;
        return this;
      },
      async write() {},
    },
  };
  await validate(github, context, core, require, {
    env: { GITHUB_WORKSPACE: resolve(__dirname, '../..') },
  });
  return { writes, errors, failures, summary, pages };
}

for (const event of ['pull_request_review', 'pull_request_review_comment']) {
  test(`${event} passes a complete PR without writing`, async () => {
    const result = await run(event);
    assert.deepEqual(result.writes, []);
    assert.deepEqual(result.failures, []);
    assert.match(result.summary, /All required checks passed/);
    assert.equal(result.pages, 2);
  });

  test(`${event} still rejects missing checklist items and unresolved threads`, async () => {
    const result = await run(event, {
      body: '## Description\nFix the backend import.',
      threads: [{ id: 'thread-1', isResolved: false }],
    });
    assert.deepEqual(result.writes, []);
    assert.equal(result.failures.length, 1);
    assert.match(result.summary, /Integrity & License/);
    assert.match(result.summary, /AI assistance/);
    assert.match(result.summary, /1 unresolved review conversation/);
    assert.equal(result.errors.length, 3);
    assert.doesNotMatch(result.summary, /automatically added back/);
  });

  test(`${event} passes once the review thread is resolved`, async () => {
    const result = await run(event, {
      threads: [{ id: 'thread-1', isResolved: true }],
    });
    assert.deepEqual(result.failures, []);
    assert.match(result.summary, /All required checks passed/);
  });
}

test('target events still label and comment on complete PRs', async () => {
  const result = await run('pull_request_target');
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.writes.find((w) => w.name === 'addLabels').params, {
    owner: 'owner',
    repo: 'repo',
    issue_number: 12,
    labels: ['bug', 'backend'],
  });
  assert.equal(
    result.writes.find((w) => w.name === 'removeLabel').params.name,
    'integrity-license-pending',
  );
  const comment = result.writes.find((w) => w.name === 'createComment').params;
  assert.equal(comment.issue_number, 12);
  assert.equal(comment.body, `<!-- pr-validation-bot -->\n${result.summary}`);
});

test('target events still restore the checklist and start the license countdown', async () => {
  const result = await run('pull_request_target', {
    body: '## Description\nFix the backend import.',
  });
  assert.equal(result.failures.length, 1);
  const restored = result.writes.find((w) => w.name === 'updatePR').params;
  assert.equal(restored.pull_number, 12);
  assert.match(restored.body, /Fix the backend import\./);
  assert.match(
    restored.body,
    /- \[ \] \*\*\[MANDATORY - ALL\] Integrity & License/,
  );
  assert.ok(result.writes.some((w) => w.name === 'createLabel'));
  assert.deepEqual(
    result.writes.filter((w) => w.name === 'addLabels')[1].params.labels,
    ['integrity-license-pending'],
  );
  assert.match(
    result.writes.find((w) => w.name === 'createComment').params.body,
    /Required Actions/,
  );
});

test('target events update the existing validation comment when reviews fail', async () => {
  const result = await run('pull_request_target', {
    threads: [{ id: 'thread-1', isResolved: false }],
    comments: [
      {
        id: 99,
        user: { type: 'Bot' },
        body: '<!-- pr-validation-bot --> old result',
      },
    ],
  });
  assert.equal(result.failures.length, 1);
  const comment = result.writes.find((w) => w.name === 'updateComment').params;
  assert.equal(comment.comment_id, 99);
  assert.match(comment.body, /1 unresolved review conversation/);
  assert.ok(!result.writes.some((w) => w.name === 'createComment'));
});

test('a PR touching two SQL migrations fails with a clear message', async () => {
  const result = await run('pull_request_target', {
    files: [migration('20261101000000_a'), migration('20261101000100_b')],
  });
  assert.equal(result.failures.length, 1);
  assert.match(result.summary, /Only one SQL migration per PR is allowed/);
  assert.match(result.summary, /20261101000000_a\.sql/);
  assert.match(result.summary, /20261101000100_b\.sql/);
});

test('one migration passes, and a deleted migration does not count', async () => {
  const removed = { ...migration('20261101000100_b'), status: 'removed' };
  const result = await run('pull_request_target', {
    files: [migration('20261101000000_a'), removed],
  });
  assert.deepEqual(result.failures, []);
  assert.doesNotMatch(result.summary, /Only one SQL migration/);
});

test('a new table without rls_policies.sql warns but does not fail', async () => {
  const result = await run('pull_request_target', {
    files: [migration('20261101000000_a', '+CREATE TABLE IF NOT EXISTS foo (id int);')],
  });
  assert.deepEqual(result.failures, []);
  assert.match(result.summary, /rls_policies\.sql/);
});

test('AI assistance needs exactly one option', async () => {
  const none = body.replace('- [x] **No AI**', '- [ ] **No AI**');
  const missing = await run('pull_request_target', { body: none });
  assert.match(missing.summary, /Pick one "AI assistance" option/);

  const two = await run('pull_request_target', {
    body: `${body}\n- [x] **AI, tested and partly understood**: x`,
  });
  assert.match(two.summary, /Pick only one "AI assistance" option/);
});

test('AI options that need extra review add a neutral label; others do not', async () => {
  const flagged = await run('pull_request_target', {
    body: body.replace(
      '- [x] **No AI**: I wrote this change without AI tools.',
      '- [x] **AI, tested and partly understood**: x',
    ),
  });
  assert.deepEqual(flagged.failures, []);
  assert.ok(
    flagged.writes
      .find((w) => w.name === 'addLabels')
      .params.labels.includes('needs-extra-review'),
  );

  const reviewed = await run('pull_request_target', {
    body: body.replace('- [x] **No AI**', '- [x] **AI, reviewed line by line**'),
  });
  assert.ok(
    !reviewed.writes
      .find((w) => w.name === 'addLabels')
      .params.labels.includes('needs-extra-review'),
  );
});

test('a deleted AI picker is restored as a block', async () => {
  const result = await run('pull_request_target', {
    body: body.replace('- [x] **No AI**: I wrote this change without AI tools.', ''),
  });
  const restored = result.writes.find((w) => w.name === 'updatePR').params;
  assert.match(restored.body, /- \[ \] \*\*No AI\*\*/);
  assert.match(restored.body, /- \[ \] \*\*AI, tested and partly understood\*\*/);
  assert.match(restored.body, /- \[ \] \*\*AI, tested only\*\*/);
});

test('deleting some AI options restores only the missing ones', async () => {
  const result = await run('pull_request_target', {
    body: [
      '## Description',
      'Fix a backend import that creates duplicate entries.',
      '- [x] Issue (bug fix)',
      '- [x] **[MANDATORY - ALL] Integrity & License**',
      '- [x] **No AI**: I wrote this change without AI tools.',
    ].join('\n'),
  });
  const restored = result.writes.find((w) => w.name === 'updatePR').params;
  assert.doesNotMatch(restored.body, /- \[ \] \*\*No AI\*\*/);
  assert.match(restored.body, /- \[ \] \*\*AI, reviewed line by line\*\*/);
  assert.match(restored.body, /- \[ \] \*\*AI, tested only\*\*/);
  assert.match(restored.body, /_Added back: PR Type, AI assistance\._/);
});

test('a deleted PR Type group is restored, keeping a ticked option as is', async () => {
  const result = await run('pull_request_target', {
    body: body.replace('- [x] Issue (bug fix)\n', ''),
  });
  const restored = result.writes.find((w) => w.name === 'updatePR').params;
  for (const type of ['Issue (bug fix)', 'New Feature', 'Refactor', 'Documentation']) {
    assert.ok(restored.body.includes(`- [ ] ${type}`), type);
  }
  assert.match(restored.body, /PR Type/);

  const complete = await run('pull_request_target', {
    body: `${body}\n- [ ] New Feature\n- [ ] Refactor\n- [ ] Documentation`,
  });
  assert.ok(
    !complete.writes.some(
      (w) => w.name === 'updatePR' && /PR Type \(pick/.test(w.params.body),
    ),
  );
});

test('a feat: title requires Alignment even if the PR Type section is deleted', async () => {
  const result = await run('pull_request_target', { title: 'feat: new thing' });
  assert.equal(result.failures.length, 1);
  assert.match(result.summary, /Alignment/);
  const restored = result.writes.find((w) => w.name === 'updatePR').params;
  assert.match(restored.body, /- \[ \] \*\*\[MANDATORY for new feature\] Alignment/);
  assert.match(restored.body, /_Added back: Alignment, PR Type, AI assistance\._/);

  const ticked = await run('pull_request_target', {
    title: 'feat: new thing',
    body: `${body}\n- [x] **[MANDATORY for new feature] Alignment**: ok`,
  });
  assert.deepEqual(ticked.failures, []);
});

test('a partial issue link is accepted as a linked issue', async () => {
  const linked = (line) => run('pull_request_target', { body: `${body}\n${line}` });
  for (const line of ['Linked Issue: Part of #12', 'Linked Issue: Closes #12']) {
    assert.doesNotMatch((await linked(line)).summary, /link a related GitHub issue/);
  }
  assert.match((await linked('Linked Issue: Closes #')).summary, /link a related GitHub issue/);
});

test('breaking-change titles get their label and bare video URLs count as proof', async () => {
  const feat = await run('pull_request_target', { title: 'feat!: drop old api' });
  assert.ok(
    feat.writes.find((w) => w.name === 'addLabels').params.labels.includes('enhancement'),
  );
  const proof = `${body}\n- [x] **[MANDATORY for UI changes] Validation proof**: x`;
  const video = await run('pull_request_target', {
    files: [{ filename: 'SparkyFitnessFrontend/src/a.tsx' }],
    body: `${proof}\nhttps://github.com/user-attachments/assets/0a1b2c3d-1111-2222-3333-444455556666`,
  });
  assert.doesNotMatch(video.summary, /no images or videos/);
});

test('PR titles need a type prefix', async () => {
  const result = await run('pull_request_target', { title: 'Update stuff' });
  assert.equal(result.failures.length, 1);
  assert.match(result.summary, /type prefix/);
  const scoped = await run('pull_request_target', { title: 'fix(mobile): crash' });
  assert.deepEqual(scoped.failures, []);
});

test('validation proof must be backed by media when ticked', async () => {
  const withFrontend = { files: [{ filename: 'SparkyFitnessFrontend/src/a.tsx' }] };
  const proof = `${body}\n- [x] **[MANDATORY for UI changes] Validation proof**: x`;
  const bare = await run('pull_request_target', { ...withFrontend, body: proof });
  assert.match(bare.summary, /no images or videos/);
  const ok = await run('pull_request_target', {
    ...withFrontend,
    body: `${proof}\n![after](https://example.com/a.png)`,
  });
  assert.deepEqual(ok.failures, []);
});

test('policy checkout uses the PR base, never the review merge ref', () => {
  const checkout = workflow.jobs.validate.steps.find(
    (step) => step.uses === 'actions/checkout@v4',
  );
  assert.equal(
    checkout.with.ref,
    '${{ github.event.pull_request.base.sha || github.sha }}',
  );
  assert.equal(checkout.with['persist-credentials'], false);
});

test('different PR events cannot cancel each other', () => {
  const group = (eventName) =>
    workflow.concurrency.group.replace(/\$\{\{(.*?)\}\}/g, (_, expression) =>
      new Function('github', `return ${expression}`)({
        event_name: eventName,
        event: { pull_request: { number: 12 } },
      }),
    );
  assert.notEqual(group('pull_request_target'), group('pull_request_review'));
  assert.notEqual(
    group('pull_request_target'),
    group('pull_request_review_comment'),
  );
  assert.notEqual(
    group('pull_request_review'),
    group('pull_request_review_comment'),
  );
  assert.equal(workflow.concurrency['cancel-in-progress'], true);
});
