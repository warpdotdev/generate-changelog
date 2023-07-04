import * as core from '@actions/core'
import {graphql} from '@octokit/graphql'
import shell from 'shelljs'

// Regexes to find the changelog contents within a PR.
const FIXES_REGEX = /^CHANGELOG-FIXES:(.*)/gm
const NEW_REGEX = /^CHANGELOG-NEW:(.*)/gm
const TEAMS_SPECIFIC_REGEX = /^TEAMS-SPECIFIC-CHANGES:(.*)/gm
const IMAGE_REGEX = /^CHANGELOG-IMAGE:(.*)/gm

// Template text for the changelog that should be ignored.
const CHANGELOG_TEMPLATE_TEXT = /{{.*}}/

export interface Changelog {
  added: string[] | undefined
  fixed: string[] | undefined
  teams: string[] | undefined
  image: string[] | undefined
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
    {silent: true}
  )

  const commits = command.stdout
    .trim()
    .split('\n')
    .filter(s => s)
  core.info(`Found commits ${commits}`)

  // There were no differences in commits between the current version and the previous version.
  if (commits.length === 0) {
    return {added: undefined, fixed: undefined, teams: undefined, image: undefined}
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
    releaseInfo.push({name: release.name, version: release.tag.name})
  }

  return releaseInfo
}

// Produces the changelog from an array of PR descriptions. At a high level, we
// traverse each PR description searching for `CHANGELOG-FIXES:` or `CHANGELOG-ADDS:`
// to determine what the changelog conntents should be.
function parseChangelogFromPrDescriptions(prDescriptions: string[]): Changelog {
  const changelog_fixed: string[] = []
  const changelog_new: string[] = []
  const teams_specific_changes: string[] = [];
  const changelog_image: string[] = [];

  for (const prDescription of prDescriptions) {
    const fixMatches = prDescription.matchAll(FIXES_REGEX)
    if (fixMatches) {
      const fixMatchesArray = [...fixMatches]
      for (const fixMatch of fixMatchesArray) {
        const fixMatchString = fixMatch[1].trim()
        if (
          fixMatchString &&
          !CHANGELOG_TEMPLATE_TEXT.test(fixMatchString)
        ) {
          changelog_fixed.push(fixMatchString)
        }
      }
    }

    const addMatches = prDescription.matchAll(NEW_REGEX)
    if (addMatches) {
      const addMatchesArray = [...addMatches]
      for (const addMatch of addMatchesArray) {
        const addMatchString = addMatch[1].trim()
        if (
          addMatchString &&
          !CHANGELOG_TEMPLATE_TEXT.test(addMatchString)
        ) {
          changelog_new.push(addMatchString)
        }
      }
    }
    
    const teamsMatches = prDescription.matchAll(TEAMS_SPECIFIC_REGEX);
        if (teamsMatches) {
            const teamsMatchesArray = [...teamsMatches];
            for (const teamsMatch of teamsMatchesArray) {
                const teamsMatchString = teamsMatch[1].trim();
                if (teamsMatchString &&
                    !CHANGELOG_TEMPLATE_TEXT.test(teamsMatchString)) {
                      teams_specific_changes.push(teamsMatchString);
                }
            }
        }
    
    const imageMatches = prDescription.matchAll(IMAGE_REGEX);
        if (imageMatches) {
          const imageMatchesArray = [...imageMatches];
          for (const imageMatch of imageMatchesArray) {
            const imageMatchString = imageMatch[1].trim();
            if (imageMatchString &&
              !CHANGELOG_TEMPLATE_TEXT.test(imageMatchString)) {
                changelog_image.push(imageMatchString);
            }
          }
      }
}

  return {
    added: changelog_new.length > 0 ? changelog_new : undefined,
    fixed: changelog_fixed.length > 0 ? changelog_fixed : undefined,
    teams: teams_specific_changes.length > 0 ? teams_specific_changes : undefined,
    // If there are multiple images, only use the last one since the client can only display one image
    image: changelog_image.length > 0 ? [changelog_image[changelog_image.length - 1]] : undefined,
  }
}
