import * as util from 'util'
import { Octokit } from '@octokit/core';
import { graphql } from '@octokit/graphql';

const GH_GRAPHQL_URL = 'https://api.github.com';
const GH_API_URL = 'https://api.github.com';

export interface Changelog {
  added: string[];
  fixed: string[]
}

export async function generateChangelog(githubAuthToken: string, current_version: string): Promise<Changelog | null> {
  const octokit = new Octokit({
    baseUrl: GH_API_URL,
    auth: githubAuthToken,
  });

  const graphqlWithAuth = graphql.defaults({
    headers: {
      authorization: `token ${githubAuthToken}`,
    },
  });


  return fetchPullRequestMetadataFromCommits([
    "b8e834998860d062943d27ec0134e406016771d0",
    "239753dbce79925f83e8b378dd41c6b899f159d8",
    "9297e57f422596ffed102d6ec291d186d78fdb90"
  ], graphqlWithAuth).then((pullRequestMetadata) => {
    console.log(pullRequestMetadata);
    return {
      added: ["sdfsdf"],
      fixed: ["sdfsdf"]
    }
  })
}

async function fetchPullRequestMetadataFromCommits(commits: string[], graphql: Function): Promise<string[]> {
  let commitsSubQuery = '';
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
    `;
  }

  const response = await graphql(`
  {
    repository(owner: "warpdotdev", name: "warp-internal") {
      ${commitsSubQuery}
    }
  }
`);

  const commitsInfo: string[] = [];
  
  for (const oid of commits) {
    let commitResponse = response.repository['commit_' + oid];
    console.log(commitResponse);
    if (commitResponse.associatedPullRequests.nodes.length > 0) {
      commitsInfo.push(commitResponse.associatedPullRequests.nodes[0].body);
    }
  }
  return commitsInfo;
}



// export async function wait(milliseconds: number): Promise<string> {
//   return new Promise(resolve => {
//     if (isNaN(milliseconds)) {
//       throw new Error('milliseconds not a number')
//     }

//     setTimeout(() => resolve('done!'), milliseconds)
//   })
// }

// export async function fetchPullRequestFromCommit(commits: string[]): Promise<string[]> {
//   let commitsSubQuery = '';
//   for (const oid of commits) {
//     commitsSubQuery += `
//         commit_${oid}: object(oid: "${oid}") {
//           ... on Commit {
//             oid
//             associatedPullRequests(first: 1) {
//               nodes {
//                   body
//               }
//             }
//           }
//         }
//     `;
//   }

//   const response = await graphqlRequest(`
//   {
//     repository(owner: "warpdotdev", name: "warp-internal") {
//       ${commitsSubQuery}
//     }
//   }
// `);

//   const commitsInfo: string[] = [];
//   for (const oid of commits) {
//     commitsInfo.push(response.repository['commit_' + oid].associatedPullRequests.nodes[0].body);
//   }
//   return commitsInfo;
// }



