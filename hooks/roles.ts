// The built-in roles: what each does, the same in every project. Which paths each may change is the project's own
// (`roles.<name>.can` in .claude/team-roles.json); a project may add roles of its own with an `about` line.

export const ROLES: Record<string, string> = {
  designer:
    'Builds every visible part (screens, styles, text, translations, assets) with demo data and demo services only; never connects real services, data or the backend.',
  coder:
    "Does any code work that changes nothing a user sees. Changes what users see only where a permission note says `Visible: yes`, and only in that note's paths.",
  tester:
    'Tests everything and reports what is broken; changes no file but the test reports, except what a permission note gives.',
  backend:
    'Does backend work only: servers, functions, database rules and indexes, storage, and the APIs the apps call.',
  analytics:
    'Adds or changes analytics code (events, screens, properties, user properties) anywhere, and nothing else in those files.',
  publisher:
    'Does publishing work only: store listings, screenshots, versions, signing, release builds and their pipelines.',
  lawyer:
    'Writes and updates legal text only: terms, privacy policy, payment terms, government data rules and licences.',
}

/** How the setup fills each built-in role's `can` for a project's own layout. */
export const SETUP_HINTS = [
  'designer: the UI folders, styles, translations, assets, demo data and demo services; a model only `unless` it saves or loads.',
  'coder: the code folders, with every folder above for designer taken back out (`!`) unless it also holds logic.',
  'tester: the folder its reports go in (such as docs/issues/), nothing else.',
  'backend: the server, functions and database rules folders.',
  'analytics: `{ "path": "**", "if": "<the analytics calls this project uses>" }`.',
  'publisher: store listings, screenshots, release config, signing config (never the keys themselves) and CI.',
  'lawyer: the legal pages and texts (terms, privacy, licences) wherever they are.',
]
