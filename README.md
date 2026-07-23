# RPG GM Helper

RPG GM Helper is a local-first workspace for tabletop RPG Game Masters. It manages campaign records, entities, relationships, sessions, and source assets.

## Requirements

- Docker Engine, or Docker Desktop with WSL integration
- CPython 3.14 and [uv](https://docs.astral.sh/uv/) for local backend debugging and tests
- Node.js and npm for local frontend debugging and tests

## Run the application

Copy the local configuration templates once:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

Start the complete development stack from the repository root:

```bash
docker compose up --build
```

For subsequent runs, use:

```bash
docker compose up
```

Open the application at `http://localhost:5173`. The API health check is available at `http://localhost:8000/api/health`.

Press Ctrl+C to stop the foreground processes. To run in the background, use `docker compose up -d`; stop the stack with `docker compose down`.

## Debugging

### Backend

Start only PostgreSQL, then run the backend from VS Code or a local terminal:

```bash
docker compose up -d postgres
cd backend
uv sync --group dev
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

### Frontend

Start PostgreSQL and the API, then run Vite locally:

```bash
docker compose up -d postgres backend
cd frontend
cp .env.example .env
npm install
npm run dev
```

Use VS Code's browser debugger with the Vite URL printed in the terminal, normally `http://localhost:5173`.

## Common issues

### A required port is already in use

The stack uses ports 5173 and 8000, plus `POSTGRES_PORT` from `.env` (5432 by default). Stop the process using the conflicting port or choose another port and update the relevant local configuration.

### Database credentials or database name changed

Changes to `POSTGRES_DB`, `POSTGRES_USER`, or `POSTGRES_PASSWORD` apply only when PostgreSQL creates a new data volume. For a disposable development database, reset it with:

```bash
docker compose down --volumes
docker compose up --build
```

This permanently deletes local database records and uploaded assets.

### Docker is unavailable from WSL

Start Docker Desktop, enable WSL 2 integration for the distribution containing this project, then verify it from WSL:

```bash
docker version
docker run --rm hello-world
```

## Tests

Backend tests require Docker. They create and remove a disposable PostgreSQL container automatically.

```bash
cd backend
uv run pytest
```

```bash
cd frontend
npm test -- --run
```

## Code quality

```bash
cd backend
uv run ruff format --check
uv run ruff check
```

```bash
cd frontend
npm run lint
npm run format:check
npm run build
```

## Project layout

```text
backend/   FastAPI application, migrations, and tests
frontend/  React and TypeScript application
```
