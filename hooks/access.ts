// What a device may change, worked out from the project's .claude/team-roles.json alone, so the same plugin fits any
// language, framework or folder layout.

export const CONFIG = '.claude/team-roles.json'

// Always the owner's alone: the roles themselves, and the settings that switch this plugin on or off.
const OWNER_ONLY = [CONFIG, '.claude/settings.json', '.claude/settings.local.json']

/** A path a role may change: a glob (`*` one folder level, `**` any depth, a trailing `/` everything under it),
 * `!` in front to take it back out, or `{ path, if, unless }`: an edit is allowed only when its text matches `if`,
 * and not when it matches `unless`. The last entry that matches a path decides. */
export type Entry = string | { path: string; if?: string; unless?: string }

export type Config = {
  owner: string
  /** The role of a device whose email isn't in `members`; left out, such a device changes nothing. */
  default?: string
  members?: Record<string, string | { role?: string; can?: Entry[] }>
  roles?: Record<string, { about?: string; can: Entry[] }>
  /** More files only the owner changes. */
  ownerOnly?: string[]
  /** Where permission notes live. */
  notes?: string
  /** The project's own rules files, read to Claude on every request; only the owner changes them. */
  rules?: string | string[]
  /** Values taken from the first rules file: a name to the label of its `- <label>: \`value\`` line. `{name}`
   * anywhere else in the config becomes that value; one not found becomes a character no email or path has. */
  vars?: Record<string, string>
}

export const rulesOf = (config: Config) => [config.rules ?? []].flat()

const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** `config` with its `vars` filled in from `rules`, the first rules file's text; `rules` itself is kept as written. */
export function resolve(config: Config, rules: string): Config {
  const values: Record<string, string> = {}
  for (const [name, label] of Object.entries(config.vars ?? {})) {
    const found = new RegExp(`^- ${escaped(label)}:\\s*\`([^\`]+)\``, 'm').exec(rules)
    if (found) values[name] = found[1].trim().replace(/\/+$/, '')
  }
  const fill = (v: unknown): unknown => {
    if (typeof v === 'string') return v.replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? '\u0000')
    if (Array.isArray(v)) return v.map(fill)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [fill(k), fill(x)]))
    return v
  }
  const { rules: files, vars, ...rest } = config
  return { ...(fill(rest) as Config), rules: files, vars }
}

export type Note = { path: string; authors: string[]; text: string }

export type Access = {
  isOwner: boolean
  role?: string
  can: Entry[]
  /** Paths permission notes give this device, with the note each comes from. */
  given: { path: string; note: string }[]
  /** Whether a permission note lets this device change what users see (`Visible: yes`). */
  visible: boolean
}

const lower = (s: string) => s.trim().toLowerCase()

function glob(pattern: string): RegExp {
  const folder = pattern.endsWith('/')
  const body = pattern
    .replace(/\/+$/, '')
    .replace(/[.+^${}()|[\]\\?]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
  return new RegExp(`^${body}${folder ? '(/.*)?' : ''}$`)
}

const pathOf = (e: Entry) => (typeof e === 'string' ? e : e.path)

/** Whether `entries` let `rel` be changed; `text` is the edit's text, unknown (undefined) for a shell command.
 * As in .gitignore, the last entry that matches decides, so a later line can open what an earlier `!` closed. */
export function allows(entries: readonly Entry[], rel: string, text?: string): boolean {
  let allowed = false
  for (const e of entries) {
    const path = pathOf(e)
    const out = path.startsWith('!')
    if (!glob(out ? path.slice(1) : path).test(rel)) continue
    if (out) allowed = false
    else if (typeof e === 'string' || (!e.if && !e.unless)) allowed = true
    else allowed = text !== undefined && (!e.if || new RegExp(e.if).test(text)) && (!e.unless || !new RegExp(e.unless).test(text))
  }
  return allowed
}

function entriesOf(config: Config, email: string): { role?: string; can: Entry[] } {
  const found = Object.entries(config.members ?? {}).find(([who]) => lower(who) === email)
  const member = found?.[1] ?? (config.default ? { role: config.default } : {})
  const role = typeof member === 'string' ? member : member.role
  const own = typeof member === 'string' ? [] : (member.can ?? [])
  return { role, can: [...(role ? (config.roles?.[role]?.can ?? []) : []), ...own] }
}

// A file inside a granted folder or glob, to ask whether the note's writer may change it.
const sample = (path: string) => path.replace(/\*+/g, '_').replace(/\/$/, '/_')

export function accessOf(config: Config, email: string, notes: readonly Note[] = []): Access {
  email = lower(email)
  const isOwner = !!email && lower(config.owner) === email
  const { role, can } = entriesOf(config, email)
  const given: Access['given'] = []
  let visible = false
  for (const note of notes) {
    const to = /^To:(.*)$/m.exec(note.text)
    const granted = /^Can:(.*)$/m.exec(note.text)
    if (!to || !granted || !to[1].split(/[\s,]+/).map(lower).includes(email)) continue
    const writers = note.authors.map(lower)
    if (!writers.length) continue
    for (const path of granted[1].split(',').map(p => p.trim().replace(/^`|`$/g, ''))) {
      if (!path || /\s/.test(path)) continue
      const byWriters = writers.every(w => w === lower(config.owner) || allows(entriesOf(config, w).can, sample(path)))
      if (byWriters) given.push({ path, note: note.path })
    }
    if (/^Visible:\s*yes\b/im.test(note.text) && given.some(g => g.note === note.path)) visible = true
  }
  return { isOwner, role, can, given, visible }
}

/** Whether this device may change `rel` (a path from the repository's root). */
export function mayChange(config: Config, access: Access, rel: string, text?: string): boolean {
  if (access.isOwner) return true
  if ([...OWNER_ONLY, ...(config.ownerOnly ?? []), ...rulesOf(config)].some(p => glob(p).test(rel))) return false
  return allows(access.can, rel, text) || allows(access.given.map(g => g.path), rel)
}
