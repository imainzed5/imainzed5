// Pulls everything the Press Room scene needs from the GitHub GraphQL API
// and writes it to data.json. Token: GITHUB_TOKEN, else the local `gh` login.
// In Actions that is the PRESS_ROOM_TOKEN secret when set, which can read the
// private feature repos; without it those desks simply stay unlit.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const login = process.env.GITHUB_USERNAME || 'imainzed5';
const token = process.env.GITHUB_TOKEN || execSync('gh auth token').toString().trim();

// Desk order follows the portfolio's selected features. Repo names differ from slugs.
const DESKS = [
  { slug: 'moneda', title: 'Moneda', repo: 'imainzed5/MONEDA' },
  { slug: 'aqualogic', title: 'AquaLogic', repo: 'azure-cj/AquaLogic' },
  { slug: 'whisk', title: 'Whisk', repo: 'imainzed5/pomowhisk' },
  { slug: 'memorylane', title: 'MemoryLane', repo: 'imainzed5/memorylane' },
  { slug: 'realm-breaker', title: 'Realm Breaker', repo: 'imainzed5/realm-breaker' },
];

// `partial` keeps whatever resolved when some fields are NOT_FOUND, which is
// how GitHub answers for a private repo the token cannot see.
async function gql(query, variables, { partial = false } = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  const fatal = (body.errors || []).filter((e) => !(partial && e.type === 'NOT_FOUND'));
  if (!res.ok || fatal.length || !body.data) throw new Error(`GitHub API ${res.status}: ${JSON.stringify(fatal.length ? fatal : body)}`);
  return body.data;
}

const now = new Date();
const daysAgo = (n) => new Date(now.getTime() - n * 864e5).toISOString();

const data = await gql(`query($login: String!) {
  user(login: $login) {
    followers { totalCount }
    repositories(ownerAffiliations: OWNER, first: 1) { totalCount }
    publicRepos: repositories(ownerAffiliations: OWNER, privacy: PUBLIC, first: 1) { totalCount }
    latest: repositories(ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false, first: 5, orderBy: { field: PUSHED_AT, direction: DESC }) {
      nodes { name defaultBranchRef { target { ... on Commit { history(first: 1) { nodes { messageHeadline committedDate } } } } } }
    }
    pullRequests(states: MERGED, last: 12, orderBy: { field: CREATED_AT, direction: ASC }) {
      totalCount nodes { title mergedAt repository { nameWithOwner isPrivate } }
    }
    contributionsCollection {
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount contributionLevel } } }
    }
  }
}`, { login });

const u = data.user;

// Desk activity: commits on each repo's default branch, by anyone. The
// contribution breakdown above misses merges and commits under other emails.
const deskData = await gql(`query($week: GitTimestamp!, $month: GitTimestamp!) {
  ${DESKS.map((d, i) => {
    const [owner, name] = d.repo.split('/');
    return `d${i}: repository(owner: "${owner}", name: "${name}") { defaultBranchRef { target { ... on Commit {
      week: history(since: $week) { totalCount } month: history(since: $month) { totalCount } } } } }`;
  }).join('\n')}
}`, { week: daysAgo(7), month: daysAgo(30) }, { partial: true });
// null: the token cannot read this repo, so the desk has no figures to show.
const deskCount = (i, k) => (deskData[`d${i}`] ? deskData[`d${i}`].defaultBranchRef?.target?.[k]?.totalCount || 0 : null);

const LEVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
const days = u.contributionsCollection.contributionCalendar.weeks
  .flatMap((w) => w.contributionDays)
  .map((d) => ({ date: d.date, count: d.contributionCount, level: LEVEL[d.contributionLevel] }));

// Streaks, counted the way the portfolio ledger counts them.
let longest = 0, run = 0;
for (const d of days) { run = d.count ? run + 1 : 0; longest = Math.max(longest, run); }
let current = 0;
for (let i = days.length - 1; i >= 0; i--) {
  if (days[i].count) current++;
  else if (i === days.length - 1) continue; // today can still be blank
  else break;
}

// The profile repo itself is pushed by the bot on every redraw, so skip it.
const head = u.latest.nodes.find((r) => r.name.toLowerCase() !== login.toLowerCase());
const lastCommit = head?.defaultBranchRef?.target?.history?.nodes?.[0];

const out = {
  login,
  fetchedAt: now.toISOString(),
  followers: u.followers.totalCount,
  repos: u.repositories.totalCount,
  publicRepos: u.publicRepos.totalCount,
  mergedPRs: u.pullRequests.totalCount,
  recentPRs: u.pullRequests.nodes.reverse().map((p) => ({
    title: p.repository.isPrivate ? null : p.title,
    repo: p.repository.isPrivate ? null : p.repository.nameWithOwner,
    mergedAt: p.mergedAt,
  })),
  latest: lastCommit && { repo: head.name, message: lastCommit.messageHeadline, at: lastCommit.committedDate },
  total: u.contributionsCollection.contributionCalendar.totalContributions,
  activeDays: days.filter((d) => d.count).length,
  longestStreak: longest,
  currentStreak: current,
  today: days.at(-1)?.count || 0,
  days,
  desks: DESKS.map((d, i) => ({ ...d, week: deskCount(i, 'week'), month: deskCount(i, 'month') })),
};

await fs.writeFile(path.join(here, 'data.json'), JSON.stringify(out, null, 2));
console.log(`data.json: ${out.total} contributions, ${out.mergedPRs} merged PRs, desks`,
  out.desks.map((d) => `${d.slug}=${d.week}/${d.month}`).join(' '));
