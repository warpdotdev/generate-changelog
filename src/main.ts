import * as core from '@actions/core'
import {generateChangelog} from './github'

async function run(): Promise<void> {
  try {
    const github_auth_token: string = core.getInput('github_auth_token')

    await generateChangelog(github_auth_token, "sdf")

    core.setOutput('time', new Date().toTimeString())
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
