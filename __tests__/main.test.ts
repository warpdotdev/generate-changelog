import {generateChangelog} from '../src/github'
import * as process from 'process'
import * as cp from 'child_process'
import * as path from 'path'
import {expect, test} from '@jest/globals'

test('throws invalid number', async () => {
  let token = process.env.GH_TOKEN!
  let changelog = await generateChangelog(
    token,
    'v0.2022.04.11.09.09.stable_01',
    'Stable'
  )
  console.log(changelog)
  // await expect(generateChangelog(token, "sdfsdf")).resolves;
  // // await expect(wait(input)).rejects.toThrow('milliseconds not a number')
})

// test('wait 500 ms', async () => {
//   const start = new Date()
//   await wait(500)
//   const end = new Date()
//   var delta = Math.abs(end.getTime() - start.getTime())
//   expect(delta).toBeGreaterThan(450)
// })

// // shows how the runner will run a javascript action with env / stdout protocol
// test('test runs', () => {
//   process.env['INPUT_MILLISECONDS'] = '500'
//   const np = process.execPath
//   const ip = path.join(__dirname, '..', 'lib', 'main.js')
//   const options: cp.ExecFileSyncOptions = {
//     env: process.env
//   }
//   console.log(cp.execFileSync(np, [ip], options).toString())
// })
