# Development guidelines

## Team workflow

1. Start from an updated `main`: `git switch main` then `git pull origin main`.
2. Create your ownership branch: `git switch -c feat/varchas`, `git switch -c feat/uditi`, or `git switch -c feat/vrinda`.
3. Work mainly in your assigned `frontend/src/features/<owner>/` directory. Keep supporting styles and any later feature-local presentation data beside the feature. Avoid editing shared app wiring, shared components, tokens, or another member's folders without coordinating with the integration owner.
4. Before committing, update from `main` and resolve conflicts in your branch: `git fetch origin` then `git merge origin/main`. Discuss conflicts in integration-owned files with the integration owner; do not discard another person's work.
5. Commit a focused change and push your feature branch. Open a pull request against `main`, describe the routes/files changed, and request review from the team.
6. Integrate new routes by coordinating with the integration owner, who updates `frontend/src/app/router.jsx`. Keep page implementation in the owning feature folder and export its page from that folder's `index.jsx`.

## Code conventions

- Use semantic React components and accessible labels, headings, landmarks, and focus states.
- Keep feature styles in CSS Modules. Global tokens and base styles live in `frontend/src/styles/` and are integration-owned.
- Keep feature-specific demonstration data local; do not introduce a shared mutable mock-data module.
- Avoid new dependencies unless the existing stack cannot meet the need.
- Never place credentials in source control. Use `.env.example` for variable names and placeholders only.
- This scaffold's homepage may use static demonstration copy. Feature routes must not imply that unimplemented behavior is available.
