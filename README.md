# DHL Management System - Production Shell

This is the production project folder for the CRM migration.

The current implementation is intentionally a UI/application shell only:

- Static HTML, CSS, and browser JavaScript, matching the `ui-demo` technology stack.
- No demo datasets, local API shims, local service shims, or copied old CRUD logic.
- Supabase client configuration is prepared but no business logic is implemented yet.
- All future production code should stay inside this folder.

## Local Setup

1. Copy `config.example.js` to `config.local.js`.
2. Fill in the Supabase project URL and anon key.
3. Serve this folder with any static server.

Example:

```sh
python3 -m http.server 5501
```

Then open:

```text
http://127.0.0.1:5501
```

## Structure

```text
kiosk-crm-v1/
  index.html
  config.example.js
  src/
    app.js
    components/
    constants/
    layouts/
    pages/
    router/
    styles/
    supabase/
    utils/
```

## Migration Notes

- UI source of truth: `../ui-demo`
- Logic reference: `../website`
- Database source of truth: `../database/schema.sql`

Do not add Supabase table access directly inside UI components. When business logic is implemented, add real service modules that call Supabase and keep page components focused on rendering state.
