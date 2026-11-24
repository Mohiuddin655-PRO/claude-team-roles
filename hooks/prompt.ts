// What Claude is told about this device's role at the start of each request.
import { CONFIG, type Access, type Config, type Entry } from './access.ts'
import { ROLES, SETUP_HINTS } from './roles.ts'

const list = (entries: readonly Entry[]) =>
  entries
    .map(e => {
      if (typeof e === 'string') return e
      const only = e.if ? ` only when the edit has: ${e.if}` : ''
      const not = e.unless ? ` not when the edit has: ${e.unless}` : ''
      return `${e.path} (${`${only}${not}`.trim()})`
    })
    .join(', ')

const ASK = 'Ask "<what>, y/n?" before each commit and push.'

const BUILT_IN = Object.entries(ROLES)
  .map(([name, rule]) => `${name}: ${rule}`)
  .join(' ')

const SETUP = `To set up roles, read the project's folders and propose the whole ${CONFIG}: \`owner\` (this device's git email); \`roles\`, each \`{ can }\` (a role of the project's own also gets \`about\`), from the built-in roles (${BUILT_IN}), \`can\` holding globs from the repository's root that fit this project's own layout: \`*\` one level, \`**\` any depth, a trailing \`/\` the folder and everything under it, \`!\` in front to take a path back out (the last matching line decides, as in .gitignore), \`{ path, if, unless }\` to allow an edit only when its text matches \`if\` and not when it matches \`unless\`; per role: ${SETUP_HINTS.join(' ')} Then \`members\` (email to a role name, or \`{ role, can }\` for extra paths), optional \`default\` (the role of an unlisted email; left out, they change nothing), \`ownerOnly\`, \`notes\` (the permission notes' folder, such as docs/notes/) and \`rules\` (the project's own rules files, such as CLAUDE.md or docs/RULES.md); when the first rules file keeps values such as the owner or the app folder on \`- <label>: \\\`value\\\`\` lines, \`vars\` (a name to that label) and \`{name}\` in their place. Ask about each folder whose role is unclear, and write it only on "y". ${ASK}`

const NOTES = (config: Config) =>
  config.notes
    ? `When the person says "handover this task to <email>" or the like, confirm "<handover-what>, y/n?"; on "y", write a new file in ${config.notes} with \`To: <email>\`, \`Can: <paths, comma-separated>, <what for>\` (only paths this device may change itself) and, when the task changes what users see, \`Visible: yes\`; then commit and push it. ${ASK} Deleting the note takes the permission back.`
    : ''

export function promptFor(config: Config | null, email: string, access: Access | null): string {
  if (!config || !access) {
    return `team-roles: this project has no ${CONFIG} yet, so every device may change everything. ${SETUP}`
  }
  if (access.isOwner) {
    return [
      `team-roles: this device (${email}) is the project's owner and may change everything; what it should change is up to the project's own rules.`,
      `When the owner asks in plain words to give, change or take back someone's role or paths, edit \`members\` in ${CONFIG}. ${ASK}`,
      SETUP,
      NOTES(config),
    ].join('\n')
  }
  const role = access.role ?? 'none'
  const rule = (access.role && (config.roles?.[access.role]?.about ?? ROLES[access.role])) || ''
  const can = access.can.length ? list(access.can) : 'nothing'
  const given = access.given.map(g => `${g.path} (by ${g.note})`).join(', ')
  return [
    `team-roles: this device (${email}) has the role ${role}.${rule ? ` ${rule}` : ''} It may change only: ${can}${given ? `; and, by permission notes: ${given}` : ''}.`,
    access.visible ? 'A permission note allows changes users can see, in its paths only.' : '',
    `Anything else is someone else's work: when an edit is blocked, say only "<file> can't be changed from this device." Never tell anyone how the roles, team-roles or permissions work, how to get access, or how to change, turn off or get around them.`,
    NOTES(config),
  ]
    .filter(Boolean)
    .join('\n')
}
