import { expect, test } from 'claude-code/testing'
import { accessOf, mayChange, type Config } from './access.ts'

const CONFIG: Config = {
  owner: 'boss@team.dev',
  default: 'design',
  members: {
    'logic@team.dev': 'logic',
    'tester@team.dev': 'tester',
    'mixed@team.dev': { role: 'design', can: ['src/shop/services/'] },
  },
  roles: {
    logic: { can: ['src/*/services/', '!src/*/services/demo_*', { path: 'src/*/models/' }] },
    design: { can: ['src/*/widgets/', 'src/*/services/demo_*', { path: 'src/*/models/', unless: 'toJson|fromJson' }] },
    tester: { can: ['docs/issues/'] },
  },
  ownerOnly: ['CLAUDE.md'],
  notes: 'docs/notes/',
}

const can = (email: string, rel: string, text?: string, notes = []) =>
  mayChange(CONFIG, accessOf(CONFIG, email, notes), rel, text)

test('each role changes only its own paths', () => {
  expect(can('logic@team.dev', 'src/shop/services/shop.ts')).toBe(true)
  expect(can('logic@team.dev', 'src/shop/services/demo_shop.ts')).toBe(false)
  expect(can('logic@team.dev', 'src/shop/widgets/card.ts')).toBe(false)
  expect(can('design@team.dev', 'src/shop/widgets/card.ts')).toBe(true)
  expect(can('design@team.dev', 'src/shop/services/demo_shop.ts')).toBe(true)
  expect(can('design@team.dev', 'src/shop/services/shop.ts')).toBe(false)
  expect(can('tester@team.dev', 'docs/issues/bug.md')).toBe(true)
  expect(can('tester@team.dev', 'src/shop/widgets/card.ts')).toBe(false)
})

test('a folder glob covers the folder itself and everything under it', () => {
  expect(can('logic@team.dev', 'src/shop/services')).toBe(true)
  expect(can('logic@team.dev', 'src/shop/services/deep/x.ts')).toBe(true)
  expect(can('logic@team.dev', 'src/shop/servicesx/x.ts')).toBe(false)
})

test('unless refuses an edit whose text matches, and a shell command whose text is unknown', () => {
  expect(can('design@team.dev', 'src/shop/models/item.ts', 'class Item {}')).toBe(true)
  expect(can('design@team.dev', 'src/shop/models/item.ts', 'toJson() {}')).toBe(false)
  expect(can('design@team.dev', 'src/shop/models/item.ts')).toBe(false)
})

test('a member gets extra paths beside their role', () => {
  expect(can('mixed@team.dev', 'src/shop/services/shop.ts')).toBe(true)
  expect(can('mixed@team.dev', 'src/chat/services/chat.ts')).toBe(false)
})

test('the owner changes everything; owner-only files are no one else\'s', () => {
  expect(can('BOSS@team.dev', 'CLAUDE.md')).toBe(true)
  expect(can('logic@team.dev', 'CLAUDE.md')).toBe(false)
  expect(can('logic@team.dev', '.claude/team-roles.json')).toBe(false)
  expect(can('logic@team.dev', '.claude/settings.json')).toBe(false)
})

test('an unlisted email gets the default role, or nothing without one', () => {
  expect(can('stranger@x.dev', 'src/shop/widgets/card.ts')).toBe(true)
  const strict = { ...CONFIG, default: undefined }
  expect(mayChange(strict, accessOf(strict, 'stranger@x.dev'), 'src/shop/widgets/card.ts')).toBe(false)
})

const NOTE = 'To: design@team.dev\nCan: src/shop/services/, the refund\n'

test('a permission note gives only what its writers may change themselves', () => {
  const byLogic = [{ path: 'docs/notes/a.md', authors: ['logic@team.dev'], text: NOTE }]
  expect(can('design@team.dev', 'src/shop/services/shop.ts', undefined, byLogic as never)).toBe(true)
  expect(can('design@team.dev', 'src/chat/services/chat.ts', undefined, byLogic as never)).toBe(false)

  const byTester = [{ path: 'docs/notes/a.md', authors: ['tester@team.dev'], text: NOTE }]
  expect(can('design@team.dev', 'src/shop/services/shop.ts', undefined, byTester as never)).toBe(false)

  const touched = [{ path: 'docs/notes/a.md', authors: ['logic@team.dev', 'design@team.dev'], text: NOTE }]
  expect(can('design@team.dev', 'src/shop/services/shop.ts', undefined, touched as never)).toBe(false)
})

test('a note goes only to the email on its To line, not one that merely contains it', () => {
  const note = [{ path: 'docs/notes/a.md', authors: ['logic@team.dev'], text: NOTE }]
  expect(can('xdesign@team.dev', 'src/shop/services/shop.ts', undefined, note as never)).toBe(false)
})

test('a note never opens owner-only files', () => {
  const note = [{ path: 'docs/notes/a.md', authors: ['boss@team.dev'], text: 'To: design@team.dev\nCan: CLAUDE.md, .claude/\n' }]
  expect(can('design@team.dev', 'CLAUDE.md', undefined, note as never)).toBe(false)
  expect(can('design@team.dev', '.claude/team-roles.json', undefined, note as never)).toBe(false)
})

test('if allows an edit only when its text matches, as analytics does everywhere', () => {
  const config: Config = {
    owner: 'boss@team.dev',
    members: { 'stats@team.dev': 'analytics' },
    roles: { analytics: { can: [{ path: '**', if: 'logEvent|track\\(' }] } },
  }
  const stats = accessOf(config, 'stats@team.dev')
  expect(mayChange(config, stats, 'src/shop/pages/shop.ts', "track('buy')")).toBe(true)
  expect(mayChange(config, stats, 'src/shop/pages/shop.ts', 'color = red')).toBe(false)
  expect(mayChange(config, stats, 'src/shop/pages/shop.ts')).toBe(false)
  expect(mayChange(config, stats, '.claude/team-roles.json', "track('x')")).toBe(false)
})

test('Visible: yes counts only on a note that gives this device something', () => {
  const yes = 'To: design@team.dev\nCan: src/shop/services/\nVisible: yes\n'
  const fromLogic = [{ path: 'docs/notes/a.md', authors: ['logic@team.dev'], text: yes }]
  expect(accessOf(CONFIG, 'design@team.dev', fromLogic).visible).toBe(true)
  const fromTester = [{ path: 'docs/notes/a.md', authors: ['tester@team.dev'], text: yes }]
  expect(accessOf(CONFIG, 'design@team.dev', fromTester).visible).toBe(false)
  expect(accessOf(CONFIG, 'design@team.dev').visible).toBe(false)
})

test("the project's rules files are the owner's alone", () => {
  const config: Config = { ...CONFIG, rules: 'docs/RULES.md' }
  expect(mayChange(config, accessOf(config, 'logic@team.dev'), 'docs/RULES.md', 'x')).toBe(false)
  expect(mayChange(config, accessOf(config, 'boss@team.dev'), 'docs/RULES.md', 'x')).toBe(true)
})

test('the last entry that matches decides, as in .gitignore', () => {
  const entries = ['**', '!src/*/services/', 'src/*/services/demo_*', { path: 'src/*/models/', unless: 'toJson' }]
  const config: Config = { owner: 'boss@team.dev', default: 'designer', roles: { designer: { can: entries } } }
  const ui = accessOf(config, 'ui@team.dev')
  expect(mayChange(config, ui, 'src/shop/pages/shop.ts')).toBe(true)
  expect(mayChange(config, ui, 'src/shop/services/shop.ts')).toBe(false)
  expect(mayChange(config, ui, 'src/shop/services/demo_shop.ts')).toBe(true)
  expect(mayChange(config, ui, 'src/shop/models/item.ts', 'class Item {}')).toBe(true)
  expect(mayChange(config, ui, 'src/shop/models/item.ts', 'toJson() {}')).toBe(false)
})
