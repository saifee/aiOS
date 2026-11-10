# Running aiOS and the AI Employees for free

1. AI: add several free keys in Settings > AI Keys. aiOS tries them in order and falls over when one is rate-limited.
   Groq, Google Gemini (AI Studio), OpenRouter (:free models), Cerebras, Mistral, NVIDIA NIM, SambaNova, GitHub Models.
2. Cost control: Max runs/day on the AI Employees page (default 12). Site health and Fleet check use no AI. Switch on only the roles you need.
3. Scheduler: the app ticks itself every minute when running. If your host sleeps, call POST /v1/cron/tick every 5 minutes with header x-cron-key: CRON_SECRET from cron-job.org or a GitHub Actions schedule.
4. Email: Brevo (about 300/day), Resend (100/day), Gmail or Outlook with an app password, Maileroo. Set up in Settings > Email.
5. Bot protection: Cloudflare Turnstile (free) via the CAPTCHA_* settings.
6. Local models: Ollama or LM Studio behind a public tunnel (Cloudflare Tunnel) using the Custom provider.
7. Never change ENCRYPTION_KEY (saved AI keys become unreadable), and keep secrets out of the repo.
