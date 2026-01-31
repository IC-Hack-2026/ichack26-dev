# Predictive News Platform - Architecture Plan

## Project Vision

A news website that looks and feels like a traditional news site, but displays articles about **future events** written in present tense. Polymarket event titles are transformed into full news articles using OpenAI, with our calculated probability displayed alongside each article.

**Key Distinction**: The frontend is purely a news reading experience. All prediction logic, backtesting, and probability calculations happen invisibly on the backend.

---

## User Experience

```
┌─────────────────────────────────────────────────────────────────────┐
│  FUTURO NEWS                                    [Politics] [Sports] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  BREAKING: Trump Announces 2028 Presidential Run            │   │
│  │                                                              │   │
│  │  87% likely                                     Jan 31, 2026 │   │
│  │                                                              │   │
│  │  Former President Donald Trump confirmed his intention to    │   │
│  │  seek a third term in office during a rally in Florida...   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌────────────────────────┐  ┌────────────────────────┐            │
│  │ Fed Raises Rates 0.25% │  │ SpaceX Mars Launch     │            │
│  │ 73% likely             │  │ 62% likely             │            │
│  └────────────────────────┘  └────────────────────────┘            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 14)                             │
│                                                                      │
│   Pure news reading experience - no prediction UI, no backtests     │
│   ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐   │
│   │  Homepage  │  │  Article   │  │  Category  │  │   Search   │   │
│   │   Feed     │  │   Page     │  │   Pages    │  │   Results  │   │
│   └────────────┘  └────────────┘  └────────────┘  └────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Backend (Express.js)                           │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Public API Layer                          │    │
│  │   GET /api/articles - Returns generated news articles       │    │
│  │   GET /api/articles/:id - Single article with full content  │    │
│  │   GET /api/categories - List categories                     │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                │                                     │
│  ┌─────────────────────────────┴───────────────────────────────┐    │
│  │                    Internal Services                         │    │
│  │                                                              │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │    │
│  │  │  Polymarket  │  │   Signal     │  │   OpenAI     │       │    │
│  │  │  Ingestion   │  │  Processing  │  │  Generation  │       │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘       │    │
│  │                                                              │    │
│  │  ┌──────────────┐  ┌──────────────┐                         │    │
│  │  │  Prediction  │  │  Backtest    │  (internal only)        │    │
│  │  │   Engine     │  │  Service     │                         │    │
│  │  └──────────────┘  └──────────────┘                         │    │
│  └──────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
        ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
        │  PostgreSQL  │ │    Redis     │ │   OpenAI     │
        │  (Articles,  │ │   (Cache)    │ │     API      │
        │  Predictions)│ │              │ │              │
        └──────────────┘ └──────────────┘ └──────────────┘
```

---

## Technology Choices with Reasoning

### Frontend: Next.js 14

**Why Next.js:**
- **SEO Critical**: News sites need server-side rendering for search engine indexing
- **App Router**: Clean URL structure (`/article/trump-announces-2028-run`)
- **Built-in Image Optimization**: News sites are image-heavy
- **Incremental Static Regeneration**: Cache articles, regenerate on updates
- **Already in codebase**: No learning curve, existing patterns

**Why NOT a SPA:**
- News sites must be crawlable by search engines
- Social media previews require server-rendered meta tags
- First contentful paint matters for news consumption

### Backend: Express.js

**Why Express:**
- **Already in codebase**: Consistent stack
- **Simple and flexible**: Easy to add routes and middleware
- **Large ecosystem**: Libraries for all integrations needed
- **Good enough for hackathon**: Not overengineered

**Why NOT Nest.js/Fastify:**
- Overkill for this scope
- Learning curve at hackathon
- Express is battle-tested and sufficient

### Database: PostgreSQL

**Why PostgreSQL:**
- **JSONB support**: Store raw Polymarket data, OpenAI responses
- **Full-text search**: Search articles by content
- **Reliable**: ACID compliance for predictions/backtests
- **Free tier available**: Supabase, Neon, Railway

**Why NOT MongoDB:**
- Relational queries needed (articles → predictions → signals)
- PostgreSQL JSONB gives document flexibility without losing joins

**Why NOT SQLite:**
- Concurrent writes from ingestion + API serving
- Production deployment needs proper database

### Cache: Redis

**Why Redis:**
- **Article caching**: Don't regenerate articles on every request
- **Rate limiting**: Protect OpenAI API costs
- **Session-less**: No user data to store anyway

**Why NOT in-memory only:**
- Articles are expensive to generate (OpenAI costs)
- Polymarket data should be cached to avoid rate limits

### AI: OpenAI API

**Why OpenAI:**
- **GPT-4 quality**: Generates coherent news articles
- **Structured output**: Can request JSON with headline, body, summary
- **Fast**: Sub-second generation for most articles
- **Reliable API**: Good uptime, easy integration

**Why NOT local LLM:**
- Hackathon time constraint
- GPU requirements
- Quality difference significant for news writing

**Why NOT Claude API:**
- OpenAI has more news-style training data
- Either would work; OpenAI slightly better for this use case

---

## Backend Structure

```
backend/
├── server.js                     # Express app entry
├── config/
│   └── index.js                  # Environment config
├── services/
│   ├── polymarket/
│   │   ├── gamma-client.js       # Fetch events/markets
│   │   ├── clob-client.js        # Fetch prices
│   │   └── websocket.js          # Real-time prices
│   ├── signals/
│   │   ├── registry.js           # Processor management
│   │   ├── base-processor.js     # Base class
│   │   └── processors/
│   │       ├── fresh-wallet.js
│   │       ├── liquidity-impact.js
│   │       ├── position-sizing.js
│   │       ├── wallet-accuracy.js
│   │       ├── timing-pattern.js
│   │       └── ... (9 total)
│   ├── prediction/
│   │   ├── engine.js             # Combine signals → probability
│   │   └── aggregator.js         # Weight and merge signals
│   ├── article/
│   │   ├── generator.js          # OpenAI article generation
│   │   └── cache.js              # Redis caching layer
│   └── backtest/
│       ├── runner.js             # Execute backtests
│       └── metrics.js            # Calculate accuracy
├── api/
│   └── routes/
│       ├── articles.js           # Public article endpoints
│       └── internal.js           # Backtest triggers (optional)
├── jobs/
│   ├── sync-events.js            # Cron: fetch new events
│   ├── update-prices.js          # Cron: refresh probabilities
│   └── generate-articles.js      # Cron: create new articles
└── db/
    ├── index.js                  # Connection pool
    └── migrations/
```

---

## Frontend Structure

```
frontend/
├── app/
│   ├── layout.js                 # Site layout with nav
│   ├── page.js                   # Homepage - article feed
│   ├── article/
│   │   └── [slug]/
│   │       └── page.js           # Full article page
│   ├── category/
│   │   └── [name]/
│   │       └── page.js           # Category listing
│   └── globals.css               # News site styling
├── components/
│   ├── layout/
│   │   ├── Header.js             # Site header + nav
│   │   ├── Footer.js             # Site footer
│   │   └── Sidebar.js            # Trending/categories
│   ├── article/
│   │   ├── ArticleCard.js        # Card in feed
│   │   ├── ArticleFull.js        # Full article view
│   │   ├── ArticleHero.js        # Featured article
│   │   └── ProbabilityBadge.js   # "73% likely" badge
│   └── common/
│       ├── CategoryPill.js       # Category label
│       └── TimeAgo.js            # "2 hours ago"
└── lib/
    └── api.js                    # Fetch from backend
```

---

## Database Schema

```sql
-- Events from Polymarket (source data)
CREATE TABLE events (
    id VARCHAR(64) PRIMARY KEY,
    slug VARCHAR(255) UNIQUE,
    title TEXT NOT NULL,              -- Original Polymarket title
    description TEXT,
    category VARCHAR(100),
    end_date TIMESTAMP,
    resolved BOOLEAN DEFAULT FALSE,
    resolution_outcome VARCHAR(50),
    raw_data JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Our calculated predictions
CREATE TABLE predictions (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(64) REFERENCES events(id),
    base_probability DECIMAL(5,4),    -- From Polymarket price
    adjusted_probability DECIMAL(5,4), -- Our calculated value
    confidence DECIMAL(5,4),
    signals_summary JSONB,            -- Which signals fired
    calculated_at TIMESTAMP DEFAULT NOW()
);

-- Generated articles (the product)
CREATE TABLE articles (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(64) REFERENCES events(id),
    slug VARCHAR(255) UNIQUE NOT NULL,
    headline TEXT NOT NULL,           -- AI-generated headline
    summary TEXT,                     -- 1-2 sentence summary
    body TEXT NOT NULL,               -- Full article content
    category VARCHAR(100),
    probability DECIMAL(5,4),         -- Snapshot at generation
    image_url TEXT,                   -- Optional hero image
    published_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,             -- When event resolves
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_articles_category ON articles(category);
CREATE INDEX idx_articles_published ON articles(published_at DESC);
CREATE INDEX idx_articles_probability ON articles(probability DESC);

-- Backtest data (internal only)
CREATE TABLE backtest_runs (
    id SERIAL PRIMARY KEY,
    parameters JSONB,
    accuracy DECIMAL(5,4),
    brier_score DECIMAL(10,6),
    roi DECIMAL(10,4),
    results JSONB,
    run_at TIMESTAMP DEFAULT NOW()
);

-- Signal detection log (for debugging/backtest)
CREATE TABLE signals (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(64) REFERENCES events(id),
    signal_type VARCHAR(50),
    severity VARCHAR(20),
    confidence DECIMAL(5,4),
    metadata JSONB,
    detected_at TIMESTAMP DEFAULT NOW()
);
```

---

## API Endpoints

### Public (Frontend consumes these)

```
GET /api/articles
    Query: ?category=politics&limit=20&offset=0&sort=probability
    Returns: Array of article cards with headline, summary, probability, slug

GET /api/articles/:slug
    Returns: Full article with body, probability, category, event details

GET /api/articles/featured
    Returns: Top 5 highest-probability articles for hero section

GET /api/categories
    Returns: List of categories with article counts
```

### Internal (Not exposed to users)

```
POST /api/internal/sync          # Trigger Polymarket sync
POST /api/internal/backtest      # Run backtest with params
GET  /api/internal/backtest/:id  # Get backtest results
```

---

## Article Generation Flow

```
1. Polymarket Event
   └─→ "Will Trump announce 2028 presidential run before Feb 1?"

2. Prediction Engine
   └─→ Base probability: 82%
   └─→ Signals detected: [fresh-wallet: HIGH, position-sizing: MEDIUM]
   └─→ Adjusted probability: 87%

3. OpenAI Generation
   └─→ Prompt: "Write a news article as if this event has happened.
               Event: Trump announces 2028 presidential run
               Write in present tense, professional news style,
               2-3 paragraphs. Include relevant context."

4. Generated Article
   └─→ Headline: "Trump Announces 2028 Presidential Run"
   └─→ Body: "Former President Donald Trump confirmed his
             intention to seek a third term in office during
             a rally in Florida on Thursday evening..."

5. Display
   └─→ Card shows: headline + "87% likely" + summary
   └─→ Full page shows: complete article + probability badge
```

---

## Signal Processing

### Detection Strategies
1. **Fresh Wallet** - New wallets making large trades
2. **Liquidity Impact** - Trades >2% of order book
3. **Sniper Clusters** - Coordinated wallet behavior
4. **Event Correlation** - Pre-announcement trading
5. **Funding Chains** - Connected wallet detection
6. **Position Sizing** - Unusual trade sizes
7. **Niche Markets** - Large trades in low-volume events
8. **Timing Patterns** - Pre-resolution concentration
9. **Wallet Accuracy** - High win-rate traders

### Aggregation
```javascript
adjustedProbability = baseProbability + weightedSignalAdjustment

// Example: Fresh wallet bets YES heavily
// baseProbability: 0.65
// freshWalletSignal: confidence 0.8, direction YES, weight 0.1
// adjustment: 0.8 * 0.1 = +0.08
// adjustedProbability: 0.65 + 0.08 = 0.73
```

---

## Backtesting (Internal Only)

### Purpose
- Validate that our signal processing improves predictions
- Compare adjusted vs base probability accuracy
- Tune signal weights

### Metrics
- **Accuracy**: % of correct predictions
- **Brier Score**: Probability calibration
- **ROI**: Hypothetical betting returns
- **Signal Lift**: Improvement from each signal type

### Execution
```javascript
// Run nightly or on-demand via internal API
const results = await backtester.run({
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    signalTypes: ['fresh-wallet', 'position-sizing']
});

// Results stored in backtest_runs table
// Used to tune signal weights
```

---

## Implementation Priority (Hackathon)

### Phase 1: Data Pipeline (2h)
- [ ] PostgreSQL setup with events, articles tables
- [ ] Polymarket Gamma API client
- [ ] Sync job to fetch events

### Phase 2: Article Generation (2h)
- [ ] OpenAI integration
- [ ] Article generator service
- [ ] Articles API endpoint

### Phase 3: News Frontend (3h)
- [ ] Homepage with article feed
- [ ] Article page with full content
- [ ] News site styling (professional look)
- [ ] Probability badges

### Phase 4: Signal Processing (3h)
- [ ] Base processor framework
- [ ] 2-3 signal processors (fresh-wallet, position-sizing)
- [ ] Probability adjustment engine

### Phase 5: Real-Time (2h)
- [ ] Price update job
- [ ] Article probability refresh
- [ ] Optional: WebSocket for live updates

### Phase 6: Polish (2h)
- [ ] Category pages
- [ ] Search
- [ ] Mobile responsive
- [ ] Demo prep

---

## MVP Scope (Minimum Demo)

**Must Have:**
- Fetch events from Polymarket
- Generate articles with OpenAI
- Display as news feed with probabilities
- 1 working signal processor

**Should Have:**
- Category filtering
- Real-time probability updates
- 3+ signal processors

**Nice to Have:**
- Search
- Backtest dashboard (internal)
- Full 9 signal processors

---

## Dependencies

**Backend** (`backend/package.json`):
```json
{
  "pg": "^8.11.0",
  "redis": "^4.6.0",
  "openai": "^4.20.0",
  "node-fetch": "^3.3.0",
  "node-cron": "^3.0.0",
  "slugify": "^1.6.0"
}
```

**Frontend** (`frontend/package.json`):
```json
{
  // Existing Next.js deps sufficient
  // Optional: date-fns for "2 hours ago"
}
```

---

## Key Files to Modify

| File | Purpose |
|------|---------|
| `backend/server.js` | Add routes and service initialization |
| `frontend/app/page.js` | Transform to news homepage |
| `frontend/app/globals.css` | News site styling |
| `frontend/app/article/[slug]/page.js` | New: article detail page |

---

## Verification Plan

1. **Polymarket Integration**: Fetch 10 events, verify data structure
2. **Article Generation**: Generate article for 1 event, check quality
3. **Frontend Display**: Render article feed, verify styling
4. **Signal Detection**: Create test scenario, verify signal fires
5. **Probability Adjustment**: Compare base vs adjusted values
6. **End-to-End**: New event appears as article within 5 minutes
