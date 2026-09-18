Database layer modules live in this folder.

- `connection.ts` owns the SQLite file path, connection bootstrap, and schema initialization.
- `schema.ts` exposes schema outline types and introspection.
- `rows.ts` contains row types and CRUD helpers for the SQLite-backed caches.
- `CacheDatabase.ts` is the compatibility barrel for existing imports.
