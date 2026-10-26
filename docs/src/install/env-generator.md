---
pageClass: env-generator-page
aside: false
---

# Interactive .env Generator

Use this interactive questionnaire to quickly generate a clean, secure `.env` file tailored for your deployment.

For a [sub-path deployment](/administration/reverse-proxy#deploying-at-a-sub-path), enable **Nginx, Ports & Reverse Proxy Headers** and **Server Runtime**. Set the frontend base path (e.g. `/sparky/`), include that path in **Access URL**, add the URL's origin to **Extra Trusted Origins**, and set **Better Auth URL** to the origin followed by `/api/auth`. The generator checks these settings before allowing export. Your reverse proxy must strip the frontend path before forwarding requests.

<EnvGenerator />

---

## What to do with the generated `.env` file?

1. Place the generated `.env` file in the same directory as your `docker-compose.yml`.
2. Run:
   ```bash
   docker compose pull && docker compose up -d
   ```
3. Open your browser to the URL you configured above (e.g. `http://localhost:3004`).
4. **Register your account**. Unless you set `SPARKY_FITNESS_DISABLE_SIGNUP=true`, the very first user to sign up is granted full **Administrator** privileges. If you set `SPARKY_FITNESS_ADMIN_EMAIL`, register with that address — the server promotes the matching account on every startup.
5. Configure the rest from the right place for each feature:
   - **AI providers** and **OpenFoodFacts** — **Admin > System Settings** in the web interface.
   - **Garmin** — each user connects their own account under their integration settings.
   - **SMTP** — environment variables only; use the SMTP module in the generator above.
