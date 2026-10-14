# Issue tracker: GitHub

Issues and specs live in `tomstiani/pi-mattpocock-compat`.
Use the `gh` CLI for all GitHub operations.

## Operations

- Create: `gh issue create --title "..." --body-file <file>`
- Read: `gh issue view <number> --json number,title,body,labels,comments`
- List: `gh issue list --state open --json number,title,labels`
- Comment: `gh issue comment <number> --body-file <file>`
- Label: `gh issue edit <number> --add-label "..."`
- Close: `gh issue close <number>`

When a skill says “publish to the issue tracker,” create a GitHub issue.
When it says “fetch the relevant ticket,” read the referenced issue.

Draft public content and obtain user approval before publishing.

## Pull requests as a triage surface

PRs as a request surface: no.

## Wayfinding

- Map: one issue labelled `wayfinder:map`.
- Children: sub-issues labelled `wayfinder:<type>`.
  If sub-issues are unavailable, use a task list and `Part of #<map>`.
- Blocking: native GitHub issue dependencies.
  If unavailable, use `Blocked by: #<number>` in the child body.
- Frontier: open, unassigned children with no open blockers, in map order.
- Claim: assign the ticket to the driving developer.
- Resolve: comment with the answer, close the ticket, and append
  a summary and link to the map’s Decisions-so-far.
