# CLAUDE.md - Project Context for Claude Code

## Project Overview

**Futuro News** is a predictive news platform that transforms Polymarket prediction market data into AI-generated news articles. It displays future events as if they've already happened, with probability badges showing how likely each prediction is.

## Architecture

```
ichack26-dev/
├── backend/           # Express.js API server
├── frontend/          # Next.js 14 news website
└── docs/              # Architecture documentation
```

### Backend (Express.js)

- **Entry point**: `backend/server.js`
- **Config**: `backend/config/index.js` - environment variables
- **Database**: `backend/db/index.js` - in-memory store (PostgreSQL-ready)
- **Services**:
  - `services/polymarket/client.js` - Polymarket API integration
  - `services/article/generator.js` - OpenAI article generation
  - `services/rag/` - RAG news search for related articles
  - `services/signals/` - Signal detection processors
  - `services/prediction/engine.js` - Probability adjustment
  - `services/cache/index.js` - TTL-based caching
- **API Routes**:
  - `api/routes/articles.js` - Public article endpoints
  - `api/routes/internal.js` - Admin/debug endpoints

### Frontend (Next.js 14)

- **App Router**: `frontend/app/`
- **Components**: `frontend/components/` (layout, article, common)
- **Styling**: `frontend/app/globals.css` - dark theme with cyan/green accents
- **API client**: `frontend/lib/api.js`

## Commands

```bash
# Backend
cd backend && npm install
npm run dev              # Start with hot reload (port 3001)
npm start                # Production start

# Frontend
cd frontend && npm install
npm run dev              # Start dev server (port 3000)
npm run build            # Production build
```

## Environment Variables

Backend (`backend/.env`):
```
PORT=3001
OPENAI_API_KEY=sk-...    # Optional: enables AI article generation
DB_HOST=                 # Optional: PostgreSQL host (uses in-memory if not set)
REDIS_URL=               # Optional: Redis URL (uses in-memory cache if not set)

# RAG News Search (at least one required for related news feature)
BRAVE_SEARCH_API_KEY=    # Optional: Brave Search API key for related news
TAVILY_API_KEY=          # Optional: Tavily API key (alternative to Brave)
RAG_MAX_RESULTS=5        # Optional: max related articles to fetch (default: 5)
RAG_GENERATE_SUMMARIES=true  # Optional: generate AI summaries for related news
```

Frontend (`frontend/.env.local`):
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## API Endpoints

### Public (Frontend uses these)
- `GET /api/articles` - List articles (?category, ?limit, ?sort)
- `GET /api/articles/featured` - Top articles for hero section
- `GET /api/articles/:slug` - Single article
- `GET /api/articles/:slug/related` - RAG search for related real-world news
- `GET /api/categories` - Category list

### Internal (Admin)
- `POST /api/internal/sync` - Sync Polymarket data & generate articles
- `POST /api/internal/regenerate` - Regenerate articles
- `GET /api/internal/signals/:eventId` - View detected signals

### Legacy (Backward compatible)
- `GET /api/markets` - Raw Polymarket markets
- `GET /api/events` - Raw Polymarket events

## Key Conventions

1. **No emojis** in code or comments unless explicitly requested
2. **Dark theme** - UI uses CSS variables from globals.css (--bg-primary, --accent-cyan, etc.)
3. **Fonts**: Instrument Serif (display), Syne (sans), JetBrains Mono (mono)
4. **Components** use 'use client' directive for client-side interactivity
5. **API responses** follow format: `{ count: number, articles: [...] }` or `{ categories: [...] }`

## Signal Processors

Located in `backend/services/signals/processors/`:
- `volume-spike.js` - Detects unusual trading volume
- `probability-extreme.js` - Flags extreme probabilities (>90% or <10%)
- `high-liquidity.js` - Tracks high-liquidity markets (more reliable)

To add a new processor:
1. Create file in `processors/` extending `BaseProcessor`
2. Implement `process(event, market)` method
3. Register in `registry.js`

## Article Generation

Without OpenAI key: Uses `generateFallbackArticle()` for template-based articles
With OpenAI key: Uses GPT-4o-mini to generate news-style articles

Articles are generated on-demand when `/api/articles` is called and cached.

## RAG Related News

When a user views an article, the frontend fetches related real-world news via RAG search.

**How it works:**
1. User clicks on an article to view the full content
2. Frontend calls `GET /api/articles/:slug/related`
3. Backend extracts key terms from the article headline
4. Backend searches for related news using Brave Search or Tavily API
5. OpenAI generates contextual summaries explaining each related article's relevance
6. Frontend displays related articles as clickable cards with headlines and summaries

**Configuration:**
- Set `BRAVE_SEARCH_API_KEY` or `TAVILY_API_KEY` to enable RAG search
- Without API keys, the related articles section shows a configuration message
- With `OPENAI_API_KEY`, summaries explain how each related article connects to the prediction

**Files:**
- `backend/services/rag/newsSearch.js` - Search and summarization logic
- `frontend/components/article/RelatedArticles.js` - UI component

## Database Schema (In-Memory)

- `events` - Polymarket events/markets
- `predictions` - Calculated probability adjustments
- `articles` - Generated news articles
- `signals` - Detected trading signals

## Testing the App

1. Start backend: `cd backend && npm run dev`
2. Start frontend: `cd frontend && npm run dev`
3. Visit http://localhost:3000
4. Articles auto-generate from Polymarket data on first load
5. Or manually sync: `curl -X POST http://localhost:3001/api/internal/sync`
