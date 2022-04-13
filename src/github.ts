import {graphql} from '@octokit/graphql'
import shell from 'shelljs'

// Regexes to find the changelog contents within a PR.
const FIXES_REGEX = /^CHANGELOG-FIXES:(.*)/gm
const ADDS_REGEX = /^CHANGELOG-ADDS:(.*)/gm

export interface Changelog {
  added: string[]
  fixed: string[]
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

  // Find the most recent release prior to this one, ignoring any releases that were the same version from a
  //  prior cherrypick (e.g. v0.2022.01.01.stable_00 is still part of the same release as v0.2022.01.01.stable_01).
  let lastReleaseVersion
  for (const release of releases) {
    // Only consider releases of the same type as the current channel.
    if (release.name.startsWith(channel)) {
      if (
        !release.version.startsWith(
          currentVersion.substring(0, currentVersion.length - 1 - 2)
        )
      ) {
        // Check for a release where `release.version` is less then `currentVersion`, which means `localCompare` would return `1`.
        if (
          currentVersion.localeCompare(release.version, undefined, {
            numeric: true,
            sensitivity: 'base'
          }) === 1
        ) {
          lastReleaseVersion = release.version
          break
        }
      }
    }
  }

  if (lastReleaseVersion) {
    // Find all the commits between the current release and the last release.
    const commits = shell
      .exec(
        `git --no-pager log ${lastReleaseVersion}..${currentVersion} --pretty=format:""%H""`,
        {silent: true}
      )
      .stdout.trim()
      .split('\n')
    const pullRequestMetadata = await fetchPullRequestBodyFromCommits(
      commits,
      graphqlWithAuth
    )
    return parseChangelogFromPrDescriptions(pullRequestMetadata)
  } else {
    return Promise.reject(
      Error('Unable to find last release prior to the given release')
    )
  }
}

// Fetches PR body text from a series of commits.
async function fetchPullRequestBodyFromCommits(
  commits: string[],
  graphqlWithAuth: Function
): Promise<string[]> {
  console.log(`generated commits ${commits}`)

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
  for (const oid of commits) {)
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

  for (const prDescription of prDescriptions) {
    const fixMatches = prDescription.matchAll(FIXES_REGEX)
    if (fixMatches) {
      const fixMatchesArray = [...fixMatches]
      for (const fixMatch of fixMatchesArray) {
        changelog_fixed.push(fixMatch[1].trim())
      }
    }

    const addMatches = prDescription.matchAll(ADDS_REGEX)
    if (addMatches) {
      const addMatchesArray = [...addMatches]
      for (const addMatch of addMatchesArray) {
        changelog_new.push(addMatch[1].trim())
      }
    }
  }

  return {
    added: changelog_new,
    fixed: changelog_fixed
  }
}
