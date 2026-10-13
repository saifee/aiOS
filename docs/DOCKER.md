# Run Kingslee AIOS on Docker Desktop (Windows)

1. Start Docker Desktop (wait for "Engine running").
2. Unzip the project, open PowerShell in that folder.
3. `copy .env.docker .env` then open `.env` in Notepad:
   - JWT_SECRET  -> any long random text
   - ENCRYPTION_KEY -> 64 characters from 0-9 and a-f
   - ANTHROPIC_API_KEY -> your key
4. `docker compose up -d --build` (first build takes 5-10 min)
5. Open http://localhost:4000/setup and create the admin account.
6. Logs: `docker compose logs -f api`  Stop: `docker compose down`  (data is kept in the pgdata volume)
7. Phone-call bridge (optional): `docker compose --profile voice up -d --build`
