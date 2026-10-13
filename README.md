# Aaliyah’s Petal

A mobile-first calorie and macro tracker with a calorie-locked, draggable macro planner with gram-based food portions, USDA FoodData Central search, manual foods, daily goals, date navigation, local-first storage, and optional passwordless account sync.

## Run

Serve this directory from a local static server:

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8080`. No build step is required.

## Food database

Search uses the public USDA FoodData Central API. `config.js` defaults to USDA’s rate-limited `DEMO_KEY`, which is fine for development. For regular use, request a free API key from FoodData Central and replace `usdaApiKey`.

Nutrition returned by the database is stored as values per 100 grams. Petal scales all calories and macros to the weight entered by the user.

## Optional passwordless authentication

The tracker works immediately in private, device-only mode. To enable email magic-link authentication and lightweight cross-device sync:

1. Create a Supabase project.
2. Add the app’s URL under **Authentication → URL Configuration → Redirect URLs**.
3. Put the project URL and public anon key in `config.js`.
4. Keep email OTP enabled in Supabase Authentication.

No service-role key or other secret belongs in this client-side app. The MVP stores the user’s tracker state in Supabase Auth user metadata, avoiding a database migration. A dedicated row-level-secured diary table is recommended if the app grows beyond personal use.

## Storage

Guest data is saved in browser `localStorage` under `petal-calorie-tracker-v2`. The previous MVP’s calorie entries are migrated automatically. Clearing site data removes guest data.

## Self-host

Upload `index.html`, `styles.css`, `app.js`, and `config.js` to any static host. Configure HTTPS for production so authentication redirects work reliably.

## Private Tailscale deployment

The included Compose service follows the TotalBudget pattern: it is read-only, capability-restricted, resource-limited, restarted automatically, and published only to `127.0.0.1:5011`.

On the Tailscale host, run:

```sh
./deploy-tailscale.sh
```

This builds the container, verifies `/health`, and publishes private HTTPS on port `8444`:

`https://openclaw-vm.taile1126e.ts.net:8444/`

If Supabase authentication is enabled, add that exact URL to the project’s allowed redirect URLs.
