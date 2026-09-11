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
  '- [x] **[MANDATORY for Backend changes] Code Quality**',
].join('\n');

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
    paginate: async () => [
      { filename: 'SparkyFitnessServer/models/exercise.ts' },
    ],
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
        title: 'fix: duplicate import',
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
    assert.match(result.summary, /Code Quality/);
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

test('reviews cannot cancel target-event writes', () => {
  const group = (eventName) =>
    workflow.concurrency.group.replace(/\$\{\{(.*?)\}\}/g, (_, expression) =>
      new Function('github', `return ${expression}`)({
        event_name: eventName,
        event: { pull_request: { number: 12 } },
      }),
    );
  assert.notEqual(group('pull_request_target'), group('pull_request_review'));
  assert.equal(
    group('pull_request_review'),
    group('pull_request_review_comment'),
  );
});
