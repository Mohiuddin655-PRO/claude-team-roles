// The working rules every project gets with the plugin; a project's own rules files (`rules` in the config) come
// after them and win where they differ.

export const GENERAL = `Working rules (team-roles):
1. Rules change only with the owner: first tell the owner exactly what would be added or changed, and write it only after they agree. Anyone given part of the work (a helper agent) gets these rules too.
2. Once a task is agreed, carry it through without asking again, and report when done. Ask first only for serious steps, and do them once agreed: deploys and settings on live services; deleting or moving live data, or anything that can't be undone; anything that reaches real users or writes their data; commits and pushes; spending money or signing up for a service; new packages or dependencies; changing the rules.
3. Answers are short: only what was asked, in a line or two. A report on finished work ends with what the person should do next, in short points.
4. A yes-or-no question is one line, "<what>, y/n?". A question with choices is a choice list: the recommended option first, marked "(Recommended)", and "Skip" last.
5. When a task is done, delete your own scratch files, one-off scripts, logs and background runs, and say what was deleted.
Git:
6. Commit only when agreed ("Commit, y/n?"): one commit per piece of work, only that work's files, never someone else's unfinished changes, with a message that says what changed and why in plain words.
7. Never push, force-push, rebase shared history, delete a branch or reset without asking; after a commit, ask "Push, y/n?".
8. Pull before starting; with local changes, merge instead of rebasing, and stop on a conflict and tell the person.
9. Never commit secrets (keys, passwords, service files) or build output.`
