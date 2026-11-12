import { expect, test } from 'claude-code/testing'

const ROOT = '/work/app'
const CONFIG = JSON.stringify({
  owner: 'boss@team.dev',
  members: { 'design@team.dev': 'design' },
  roles: { design: { can: ['src/*/widgets/'] } },
})

// The engine beneath the plugin: a repository at ROOT whose device has `email`.
function engine(on: Parameters<Parameters<typeof test>[1]>[1], email: string, files: string[] = []) {
  on('session.cwd', () => ({ value: ROOT }))
  on('process.run', (_, e) => {
    const args = e.argv.join(' ')
    if (args.includes('rev-parse')) return { value: { exitCode: 0, stdout: `${ROOT}\n`, stderr: '' } }
    if (args.includes('user.email')) return { value: { exitCode: 0, stdout: `${email}\n`, stderr: '' } }
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('fs.read', () => ({ value: CONFIG }))
  on('fs.exists', (_, e) => ({ value: [...files, 'src', 'src/shop'].some(f => e.path === `${ROOT}/${f}`) }))
  on('tool.call', () => ({ result: {} }))
}

test('a design device writes its widgets but not a service', async ($, on) => {
  engine(on, 'design@team.dev')
  const ok = await $.tool.call({ tool: 'Write', file_path: `${ROOT}/src/shop/widgets/card.ts`, content: 'x' })
  expect('deny' in ok && ok.deny).toBeFalsy()
  const no = await $.tool.call({ tool: 'Write', file_path: `${ROOT}/src/shop/services/shop.ts`, content: 'x' })
  expect('deny' in no ? no.deny : (no as { text?: string }).text).toMatch(/src\/shop\/services\/shop\.ts can't be changed/)
})

test('the owner writes anything, and files outside the repository are left alone', async ($, on) => {
  engine(on, 'boss@team.dev')
  const own = await $.tool.call({ tool: 'Write', file_path: `${ROOT}/.claude/team-roles.json`, content: '{}' })
  expect('deny' in own && own.deny).toBeFalsy()
})

test('outside the repository nothing is refused', async ($, on) => {
  engine(on, 'design@team.dev')
  const tmp = await $.tool.call({ tool: 'Write', file_path: '/tmp/scratch.txt', content: 'x' })
  expect('deny' in tmp && tmp.deny).toBeFalsy()
})

test('a shell write is judged by the files it names, not by its other words', async ($, on) => {
  engine(on, 'design@team.dev', ['src/shop/services/shop.ts'])
  const no = await $.tool.call({ tool: 'Bash', command: "sed -i 's/a/b/' src/shop/services/shop.ts" })
  expect(JSON.stringify(no)).toMatch(/can't be changed/)
  const ok = await $.tool.call({ tool: 'Bash', command: 'ls src > /dev/null' })
  expect(JSON.stringify(ok)).not.toMatch(/can't be changed/)
})
