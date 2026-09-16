# Election Day Hub

A local, dependency-free rebuild of the Election Day Hub prototype. It mirrors the published product's poll-watch, team, campaign-settings, and export workflows while storing demo data in `data/state.json`.

## Run

```powershell
node server.mjs
```

If npm is installed, `npm start` runs the same command.

Open `http://localhost:4173`.

## Included

- Campaign switching and role preview
- Town-scoped, split-prefix voter search (`Wi Au`, `Will A`)
- Vote check-in with an audit trail
- Campaign-controlled household and voter text scheduling
- Durable local message queue with simulated delivery
- One-use quicklinks with configurable expiration
- CSV voter import with preview and duplicate handling
- Admin CSV export
- Team, Campaigns, and Exports screens
- Responsive desktop/mobile layout

## Production boundary

This is a functional local reconstruction, not a production election system. Authentication is a role preview, secrets are not configured, and queued texts are simulated. Before real voter data or messaging is used, add managed authentication, encrypted production storage, audit/retention policies, deployment monitoring, legal review, and a verified RumbleUp server integration.
