import * as core from '@actions/core'
import {generateChangelog} from './github'

async function run(): Promise<void> {
  try {
    const github_auth_token: string = core.getInput('github_auth_token', {
      required: true
    })
    const current_version: string = core.getInput('version', {required: true})
    const channel: string = core.getInput('channel', {required: true})

    const changelog = await generateChangelog(
      github_auth_token,
      current_version,
      channel
    )

    core.setOutput('changelog', JSON.stringify(changelog))
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
