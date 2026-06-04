---
description: Prepare and create a pull request
---

1. Ask for the PR title and description.

2. Check for uncommitted changes.
   Run `git status`

3. Stage all changes.
// turbo
   Run `git add -A`

4. Create a commit with the changes.
   Run `git commit -m "[commit message]"`

5. Push to the remote branch.
// turbo
   Run `git push -u origin HEAD`

6. Create the pull request.
   Run `gh pr create --title "[title]" --body "[description]"`
