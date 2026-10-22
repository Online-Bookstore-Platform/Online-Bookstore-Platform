# Team ownership

The team owns feature implementation by member; shared application wiring belongs to the integration owner.

| Member | Stories | Feature directories | Branch |
|---|---|---|---|
| Varchas | #1 authentication and role access; #5 book details; #8 payment; #11 administrator catalogue | `frontend/src/features/varchas/` | `feat/varchas` |
| Uditi | #3 browse/search/filter/sort; #7 checkout/delivery; #10 inventory; #13 schema/data integrity | `frontend/src/features/uditi/`; future database work in `backend/database/`, separate from UI | `feat/uditi` |
| Vrinda | #4 registration/profile; #6 cart; #9 order creation/history; #12 status/tracking | `frontend/src/features/vrinda/` | `feat/vrinda` |

Each listed feature has a route placeholder in its owner's feature directory. The placeholders do not implement the story. In particular, authentication/authorization is separate from registration/profile, catalogue browsing is separate from book details and admin catalogue management, and Uditi's future database work should not be mixed into frontend components.

## Integration-owned files

Coordinate changes to `frontend/src/app/`, `frontend/src/main.jsx`, `frontend/src/components/shared/`, `frontend/src/styles/`, and root/build configuration. The integration owner maintains `router.jsx` and connects feature routes. Do not create a second navbar, footer, or global stylesheet. If a feature needs a new shared component or token, propose it for integration instead of editing shared files independently.

Feature JSX, CSS Modules, and local mock/presentation data stay with the owning feature. Do not edit another member's feature folder without coordination. Keep pull requests focused and commits small; do not commit secrets.
