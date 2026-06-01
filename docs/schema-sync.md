# Schema Sync

`srs-vscode/schemas/2.0` is a mirror of canonical schema files from `../srs/docs/schema/2.0`.

Before commit, run:

```bash
scripts/check-schema-drift.sh
```

In sibling checkouts, canonical schema updates should be published from the `srs` repository via:

```bash
node scripts/publish-spec.mjs
```
