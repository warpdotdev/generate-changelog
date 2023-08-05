import * as core from '@actions/core'
import { graphql } from '@octokit/graphql'
import shell from 'shelljs'

// Regexes to find the changelog contents within a PR.
const NEW_FEATURE_REGEX = /^CHANGELOG-NEW-FEATURE:(.*)/gm
const IMPROVEMENT_REGEX = /^CHANGELOG-IMPROVEMENT:(.*)/gm
const BUG_FIX_REGEX = /^CHANGELOG-BUG-FIX:(.*)/gm
const IMAGE_REGEX = /^CHANGELOG-IMAGE:(.*)/gm

// These regexes are no longer in the template, but existing PRs might
// still use them. Can clean up after some time (2 weeks or so).
const OLD_NEW_REGEX = /^CHANGELOG-NEW:(.*)/gm
const OLD_FIX_REGEX = /^CHANGELOG-FIXES:(.*)/gm

// Template text for the changelog that should be ignored.
const CHANGELOG_TEMPLATE_TEXT = /{{.*}}/

export interface Changelog {
  newFeatures: string[] | undefined
  improvements: string[] | undefined
  bugFixes: string[] | undefined
  images: string[] | undefined
}

interface ReleaseInfo {
  name: string
  version: string
}

interface GraphQLRelease {
  name: string
  tag: {
    name: string
  }
}

// Generates a changelog by parsing PRs that were newly merged into the currentVersion.
export async function generateChangelog(
  githubAuthToken: string,
  currentVersion: string,
  channel: string
): Promise<Changelog> {
  const graphqlWithAuth = graphql.defaults({
    headers: {
      authorization: `token ${githubAuthToken}`
    }
  })

  const releases = await getReleases(graphqlWithAuth)

  // Find the most recent release prior to this one, ignoring any releases that were from the same version from a
  // prior cherrypick (e.g. v0.2022.01.01.stable_00 is still part of the same release as v0.2022.01.01.stable_01).
  let lastReleaseVersion
  for (const release of releases) {
    // Only consider releases of the same type as the current channel.
    if (
      release.name.toLowerCase().startsWith(channel) &&
      !release.version.startsWith(
        currentVersion.substring(0, currentVersion.length - 1 - 2)
      )
    ) {
      if (isVersionGreater(currentVersion, release.version)) {
        core.info(`Previous release is ${release.version}`)
        lastReleaseVersion = release.version
        break
      }
    }
  }

  if (!lastReleaseVersion) {
    throw new Error('Unable to find last release prior to the given release')
  }

  // Find all the commits in the branch for the current release that aren't in the branch for the last release.
  const currentBranch = branchFromVersion(currentVersion, channel)
  const previousBranch = branchFromVersion(lastReleaseVersion, channel)

  core.info(`Comparing ${currentBranch} with ${previousBranch}`)

  // Find all the commits that are in `currentBranch` but not `previousBranch`.
  const command = shell.exec(
    `git --no-pager log  ^${previousBranch} ${currentBranch} --pretty=format:%H`,
    { silent: true }
  )

  const commits = command.stdout
    .trim()
    .split('\n')
    .filter(s => s)
  core.info(`Found commits ${commits}`)

  // There were no differences in commits between the current version and the previous version.
  if (commits.length === 0) {
    return { newFeatures: undefined, improvements: undefined, bugFixes: undefined, images: undefined }
  }

  const pullRequestMetadata = await fetchPullRequestBodyFromCommits(
    commits,
    graphqlWithAuth
  )
  return parseChangelogFromPrDescriptions(pullRequestMetadata)
}

// Check for a release where `currentVersion` is greater than `release.version`, which means `localCompare` would return `1`.
// This is by no means a perfect check, but should suffice because each version is of the exact same format and length.
function isVersionGreater(
  currentVersion: string,
  releaseVersion: string
): boolean {
  return (
    currentVersion.localeCompare(releaseVersion, undefined /* locales */, {
      numeric: true,
      sensitivity: 'base'
    }) === 1
  )
}

// Returns the release branch from a version tag. A version like `v0.2022.04.11.09.09.stable_01` would
// be converted to `stable_release/v0.2022.04.11.09.09.stable`.
function branchFromVersion(version: string, channel: string): string {
  return `origin/${channel}_release/${version.substring(
    0,
    version.indexOf('_')
  )}`
}

// Fetches PR body text from a series of commits.
async function fetchPullRequestBodyFromCommits(
  commits: string[],
  graphqlWithAuth: Function
): Promise<string[]> {
  let commitsSubQuery = ''
  for (const oid of commits) {
    commitsSubQuery += `
      commit_${oid}: object(oid: "${oid}") {
        ... on Commit {
          oid
          author {
            name
          }
          associatedPullRequests(first: 1) {
            nodes {
                body
            }
          }
        }
      }
  `
  }

  const response = await graphqlWithAuth(`
  {
    repository(owner: "warpdotdev", name: "warp-internal") {
      ${commitsSubQuery}
    }
  }
`)

  const commitsInfo: string[] = []
  for (const oid of commits) {
    const commitResponse = response.repository[`commit_${oid}`]
    if (commitResponse.associatedPullRequests.nodes.length > 0) {
      commitsInfo.push(commitResponse.associatedPullRequests.nodes[0].body)
    }
  }
  return commitsInfo
}

// Returns the most recent 100 releases, sorted by creation.
async function getReleases(graphqlWithAuth: Function): Promise<ReleaseInfo[]> {
  const releaseQuery = `releases(first: 100, orderBy: {field: CREATED_AT, direction: DESC}) {
      nodes {
        name
        tag {
          name
        }
      }
    }`

  const response = await graphqlWithAuth(`
  {
    repository(owner: "warpdotdev", name: "warp-internal") {
      ${releaseQuery}
    }
  }
`)

  const releaseInfo: ReleaseInfo[] = []
  const releases = response.repository.releases.nodes as GraphQLRelease[]

  for (const release of releases) {
    releaseInfo.push({ name: release.name, version: release.tag.name })
  }

  return releaseInfo
}

// Given a description and a regex, parses the description, looking for all lines that match
// the regex. Any non-default matches will be returned in the result.
function parseMatchesFromDescription(prDescription: string, regex: RegExp): string[] {
  const changelogItems: string[] = [];
  const matches = prDescription.matchAll(regex)
  if (matches) {
    const matchesArray = [...matches]
    for (const match of matchesArray) {
      const matchString = match[1].trim()
      if (
        matchString &&
        !CHANGELOG_TEMPLATE_TEXT.test(matchString)
      ) {
        changelogItems.push(matchString)
      }
    }
  }
  return changelogItems
}

// Produces the changelog from an array of PR descriptions. At a high level, we
// traverse each PR description searching for different changelog prefix strings
// to determine what the changelog contents should be.
function parseChangelogFromPrDescriptions(prDescriptions: string[]): Changelog {
  const changelogNewFeatures: string[] = []
  const changelogImprovements: string[] = []
  const changelogBugFixes: string[] = [];
  const changelogImages: string[] = [];

  for (const prDescription of prDescriptions) {
    changelogNewFeatures.push(...parseMatchesFromDescription(prDescription, NEW_FEATURE_REGEX))
    changelogImprovements.push(...parseMatchesFromDescription(prDescription, IMPROVEMENT_REGEX))
    changelogBugFixes.push(...parseMatchesFromDescription(prDescription, BUG_FIX_REGEX))
    changelogImages.push(...parseMatchesFromDescription(prDescription, IMAGE_REGEX))

    // temporary: anything with the old CHANGELOG-NEW will go in the "New Features" bucket
    changelogNewFeatures.push(...parseMatchesFromDescription(prDescription, OLD_NEW_REGEX))
    // temporary: anything with the old CHANGELOG-FIXES will go in the "Bug Fixes" bucket
    changelogBugFixes.push(...parseMatchesFromDescription(prDescription, OLD_FIX_REGEX))
  }

  return {
    newFeatures: changelogNewFeatures.length > 0 ? changelogNewFeatures : undefined,
    improvements: changelogImprovements.length > 0 ? changelogImprovements : undefined,
    bugFixes: changelogBugFixes.length > 0 ? changelogBugFixes : undefined,
    // If there are multiple images, only use the last one since the client can only display one image
    images: changelogImages.length > 0 ? [changelogImages[changelogImages.length - 1]] : undefined,
  }
}
