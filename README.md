# CrawlIntel-ai

This project implements:

Apify -> scraped content -> database -> embeddings -> database-backed retrieval -> FastAPI backend -> React chat UI.

## Project layout

- `backend/` FastAPI + ingestion + indexing + retrieval + SQL database
- `frontend/` React (Vite) chat UI

## 1) Backend setup

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Fill `backend/.env` with:

- `DATABASE_URL` for SQLite locally or a managed Postgres instance in production
- `APIFY_API_TOKEN`
- `LLM_PROVIDER` (`openai` or `nvidia`)
- LLM API key for selected provider (`OPENAI_API_KEY` or `NVIDIA_API_KEY`)
- `LLM_CHAT_MODEL` and `LLM_EMBEDDING_MODEL`

For NVIDIA, keep `LLM_BASE_URL=https://integrate.api.nvidia.com/v1`.

Run API:

```powershell
uvicorn app.main:app --reload --port 8000
```

## 2) Frontend setup

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

The UI starts at `http://localhost:5173`.

## 2b) Production deployment

The backend now serves the built frontend when `frontend/dist` exists, so you can deploy it as a single container.

For production:

- set `DATABASE_URL` to a managed Postgres connection string such as Supabase
- set the LLM and Apify keys in the deployment environment
- build the frontend into `frontend/dist` before starting the API
- leave `VITE_API_BASE` empty for same-origin deployments, or set it to the backend URL if you split the frontend and backend

Supabase connection strings look like this:

```text
postgresql+psycopg://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require
```

Keep SQLite for local development and switch to Supabase only in deployed environments.

## 3) Trigger scraping and indexing

Example request:

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:8000/api/scrape" -ContentType "application/json" -Body (@{ urls = @("https://docs.apify.com/") } | ConvertTo-Json)
```

Check status:

```powershell
Invoke-RestMethod -Method Get -Uri "http://localhost:8000/api/scrape/status"
```

## 4) Ask a question

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:8000/api/chat" -ContentType "application/json" -Body (@{ query = "What is Apify used for?" } | ConvertTo-Json)
```

## API endpoints

- `GET /health`
- `POST /api/scrape`
- `GET /api/scrape/status`
- `POST /api/scrape/reindex`
- `POST /api/chat`

## 5) Docker

Build and run the full app with one image:

```powershell
docker build -t apify-qa-bot .
docker run -p 8000:8000 --env-file backend/.env apify-qa-bot
```

## 6) Render deployment

This repository includes a Render blueprint in `render.yaml` for one web service using the existing Dockerfile.

Steps:

1. Push this repository to GitHub.
2. In Render, choose New + Blueprint and select the repository.
3. Set required environment variables in Render:
	- `DATABASE_URL` (Supabase Postgres URL)
	- `APIFY_API_TOKEN`
	- `LLM_PROVIDER=nvidia`
	- `NVIDIA_API_KEY`
	- `LLM_BASE_URL=https://integrate.api.nvidia.com/v1`
	- `LLM_CHAT_MODEL=meta/llama-3.1-70b-instruct`
	- `LLM_EMBEDDING_MODEL=nvidia/nv-embed-v1`
4. Deploy.

Notes:

- The backend serves `frontend/dist`, so no separate frontend service is required.
- Render sets `PORT`; the container now binds to that port automatically.
- Keep `sslmode=require` in the Supabase connection string.
