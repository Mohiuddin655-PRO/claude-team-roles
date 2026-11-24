import type { EngineInterface, Register } from 'claude-code'
import { CONFIG, accessOf, mayChange, resolve, rulesOf, type Access, type Config, type Note } from './access.ts'
import { promptFor } from './prompt.ts'
import { GENERAL } from './rules.ts'

type Device = { root: string; email: string; config: Config | null; access: Access | null }

const section = (name: string, text: string) => ({ id: `team-roles:${name}`, text, scope: 'session' as const })

// A shell command that may change files.
const WRITES =
  /sed\s+-i|perl\s+-[a-z]*i|>>?|\btee\b|\bmv\b|\bcp\b|\brm\b|\bln\b|\btouch\b|\bmkdir\b|\btruncate\b|\bgit\s+(checkout|restore|apply|reset|stash|rm|mv|clean)/

async function git($: EngineInterface, ...args: string[]): Promise<string> {
  try {
    const run = await $.process.run(['git', ...args], { timeoutMs: 5000 })
    return run.exitCode === 0 ? run.stdout : ''
  } catch {
    return ''
  }
}

async function notesIn($: EngineInterface, root: string, folder: string): Promise<Note[]> {
  const listed = await git($, '-C', root, 'ls-tree', '-r', '--name-only', 'HEAD', '--', folder)
  const notes: Note[] = []
  for (const path of listed.split('\n').filter(Boolean)) {
    // Read as committed: an edit not yet committed gives nothing.
    const authors = (await git($, '-C', root, 'log', '--format=%ae', 'HEAD', '--', path)).split('\n').filter(Boolean)
    notes.push({ path, authors, text: await git($, '-C', root, 'show', `HEAD:${path}`) })
  }
  return notes
}

async function device($: EngineInterface): Promise<Device> {
  const cwd = await $.session.cwd()
  const root = (await git($, '-C', cwd, 'rev-parse', '--show-toplevel')).trim() || cwd
  const email = (await git($, '-C', root, 'config', 'user.email')).trim().toLowerCase()
  let config: Config | null = null
  try {
    config = JSON.parse(await $.fs.read(`${root}/${CONFIG}`)) as Config
  } catch {
    return { root, email, config: null, access: null }
  }
  const first = rulesOf(config)[0]
  const text = first ? await $.fs.read(`${root}/${first}`).catch(() => '') : ''
  config = resolve(config, typeof text === 'string' ? text : '')
  const notes = config.notes ? await notesIn($, root, config.notes) : []
  return { root, email, config, access: accessOf(config, email, notes) }
}

const ABSOLUTE = /^([A-Za-z]:)?\//

/** `path` from the repository's root, or null when it lies outside it; Windows paths included. */
function relative(root: string, cwd: string, path: string): string | null {
  const slashed = (p: string) => p.replace(/\\/g, '/')
  const full = ABSOLUTE.test(slashed(path)) ? slashed(path) : `${slashed(cwd)}/${slashed(path)}`
  const drive = /^[A-Za-z]:/.exec(full)?.[0] ?? ''
  const parts: string[] = []
  for (const part of full.slice(drive.length).split('/')) {
    if (part === '..') parts.pop()
    else if (part && part !== '.') parts.push(part)
  }
  const clean = `${drive}/${parts.join('/')}`
  const top = slashed(root).replace(/\/$/, '')
  return clean.startsWith(`${top}/`) ? clean.slice(top.length + 1) : null
}

/** The words of a shell command that name a file: one that is there, or a new one in a folder that is. */
async function pathsIn($: EngineInterface, cwd: string, command: string): Promise<string[]> {
  const paths: string[] = []
  const exists = (p: string) => $.fs.exists(ABSOLUTE.test(p.replace(/\\/g, '/')) ? p : `${cwd}/${p}`).catch(() => false)
  for (const word of command.match(/[\w./\\~@+:-]+/g) ?? []) {
    if (await exists(word)) paths.push(word)
    else if (/[./\\]/.test(word) && (await exists(word.replace(/[\\/][^\\/]*$/, '') || '.'))) paths.push(word)
  }
  return paths
}

const refusal = (rel: string) =>
  `${rel} can't be changed from this device. Say only that, and nothing more about why.`

export const register: Register = on => {
  on('tool.call', async ($, e, next) => {
    const cwd = await $.session.cwd()
    let edits: { path: string; text?: string }[] = []
    if (e.tool === 'Write') edits = [{ path: e.file_path, text: e.content }]
    else if (e.tool === 'Edit') edits = [{ path: e.file_path, text: `${e.old_string} ${e.new_string}` }]
    else if (e.tool === 'NotebookEdit') edits = [{ path: e.notebook_path, text: e.new_source }]
    else if (e.tool === 'Bash') {
      // Output thrown away or joined isn't a write.
      const command = e.command.replace(/\d?>>?\s*\/dev\/null|\d>&\d/g, ' ')
      if (WRITES.test(command)) edits = (await pathsIn($, cwd, command)).map(path => ({ path }))
    }
    if (!edits.length) return next(e)

    const { root, config, access } = await device($)
    if (!config || !access) return next(e)
    for (const edit of edits) {
      const rel = relative(root, cwd, edit.path)
      if (rel && !mayChange(config, access, rel, edit.text)) return { deny: refusal(rel) }
    }
    return next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: "This change can't be made from this device right now." }))

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const { root, email, config, access } = await device($)
    const own = []
    for (const file of config ? rulesOf(config) : []) {
      const text = await $.fs.read(`${root}/${file}`).catch(() => '')
      if (typeof text === 'string' && text) own.push(section(`rules:${file}`, `The project's own rules (${file}); they win where they differ from the working rules above:\n${text}`))
    }
    return {
      sections: [
        ...composed.sections,
        section('role', promptFor(config, email, access)),
        section('rules', GENERAL),
        ...own,
      ],
    }
  })
}
