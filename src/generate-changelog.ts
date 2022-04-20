import * as core from '@actions/core'
import {graphql} from '@octokit/graphql'
import shell from 'shelljs'

// Regexes to find the changelog contents within a PR.
const FIXES_REGEX = /^CHANGELOG-FIXES:(.*)/gm
const NEW_REGEX = /^CHANGELOG-NEW:(.*)/gm

export interface Changelog {
  added: string[] | undefined
  fixed: string[] | undefined
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
  // const graphqlWithAuth = graphql.defaults({
  //   headers: {
  //     authorization: `token ${githubAuthToken}`
  //   }
  // })

  console.log(`${currentVersion}, ${channel}`)

  return {added: undefined, fixed: undefined}
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

  for (const prDescription of prDescriptions) {
    const fixMatches = prDescription.matchAll(FIXES_REGEX)
    if (fixMatches) {
      const fixMatchesArray = [...fixMatches]
      for (const fixMatch of fixMatchesArray) {
        const fixMatchString = fixMatch[1].trim()
        if (fixMatchString) {
          changelog_fixed.push(fixMatchString)
        }
      }
    }

    const addMatches = prDescription.matchAll(NEW_REGEX)
    if (addMatches) {
      const addMatchesArray = [...addMatches]
      for (const addMatch of addMatchesArray) {
        const addMatchString = addMatch[1].trim()
        if (addMatchString) {
          changelog_new.push(addMatchString)
        }
      }
    }
  }

  return {
    added: changelog_new.length > 0 ? changelog_new : undefined,
    fixed: changelog_fixed.length > 0 ? changelog_fixed : undefined
  }
}
