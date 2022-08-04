import * as core from '@actions/core'
import {generateChangelog} from './generate-changelog'

async function run(): Promise<void> {
  try {
    const github_auth_token: string = process.env.GH_TOKEN!
    const current_version = process.env.CURRENT_VERSION!
    const channel = 'stable'

    const changelog = await generateChangelog(
      github_auth_token,
      current_version,
      channel
    )

    core.setOutput('changelog', changelog)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
