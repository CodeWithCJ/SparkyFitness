---
pageClass: env-generator-page
aside: false
---

# Interactive .env Generator

Use this interactive questionnaire to quickly generate a clean, secure `.env` file tailored for your deployment.

<EnvGenerator />

---

## What to do with the generated `.env` file?

1. Place the generated `.env` file in the same directory as your `docker-compose.yml`.
2. Run:
   ```bash
   docker compose pull && docker compose up -d
   ```
3. Open your browser to the URL you configured above (e.g. `http://localhost:3004`).
4. **Register your account**: The very first user to sign up will automatically be granted full **Administrator** privileges!
5. Configure any additional features (AI providers, Garmin, OpenFoodFacts, SMTP) in **Admin > System Settings** directly from the web interface.
