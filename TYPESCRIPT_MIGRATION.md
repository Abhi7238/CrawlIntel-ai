# TypeScript Backend Conversion Guide

This project has been converted from Python (FastAPI) to TypeScript (Express.js).

## Setup Instructions

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

1. **Install dependencies:**
   ```bash
   cd backend
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` with your configuration:
   - Set `DATABASE_URL` (SQLite for local development or PostgreSQL for production)
   - Configure `LLM_PROVIDER` and related API keys (OpenAI, NVIDIA, or Gemini)
   - Set `APIFY_API_TOKEN` for web scraping

3. **Build TypeScript:**
   ```bash
   npm run build
   ```

### Running the Application

**Development mode** (with hot reload):
```bash
npm run dev
```

**Production mode:**
```bash
npm run build
npm start
```

The backend will start on `http://localhost:8000` (default port).

## API Endpoints

### Chat
- **POST** `/api/chat` - Submit a question to the RAG system
  ```json
  {
    "query": "Your question here"
  }
  ```

### Scraping
- **POST** `/api/scrape` - Start a web scrape job
  ```json
  {
    "urls": ["https://example.com", "https://example.com/page"]
  }
  ```

- **POST** `/api/scrape/manual` - Manually ingest documents
  ```json
  {
    "documents": [
      {
        "source_url": "https://example.com",
        "title": "Example Page",
        "text": "Page content here..."
      }
    ],
    "reindex": true
  }
  ```

- **GET** `/api/scrape/status` - Check the status of the latest scrape job

## Key Changes from Python to TypeScript

### Database
- **Python:** SQLAlchemy ORM with Pydantic models
- **TypeScript:** TypeORM with TypeScript entities

### Web Framework
- **Python:** FastAPI with async functions
- **TypeScript:** Express.js with async middleware

### Configuration
- **Python:** pydantic-settings from `.env`
- **TypeScript:** dotenv with typed Config class

### Web Scraping
- **Python:** Apify client with BeautifulSoup
- **TypeScript:** Apify client with jsdom

### LLM Integration
- **Python:** OpenAI SDK
- **TypeScript:** OpenAI SDK (compatible)

### Embedding & Retrieval
- **Python:** NumPy for vector operations
- **TypeScript:** Float32Array for vector operations

## Database Setup

### SQLite (Local Development)
No setup needed. Database file created automatically at `data/app.db`.

### PostgreSQL (Production)
Set DATABASE_URL to your PostgreSQL connection string:
```
DATABASE_URL=postgresql://user:password@host:5432/crawlintel
```

Tables are automatically created on startup via TypeORM synchronize.

## Dependency Migration

### Major Dependencies
- `express` - Web framework
- `typeorm` - Database ORM
- `openai` - LLM API client
- `apify-client` - Web scraping
- `jsdom` - HTML parsing
- `cors` - CORS middleware
- `dotenv` - Environment configuration

### DevDependencies
- `typescript` - TypeScript compiler
- `ts-node` - Run TypeScript directly
- `@types/*` - TypeScript type definitions

## Troubleshooting

### Database Errors
- Ensure `DATABASE_URL` is correctly configured
- For PostgreSQL, verify connection credentials and network access
- Clear `data/` directory to reset SQLite

### LLM API Errors
- Verify API keys are set correctly in `.env`
- Check LLM provider is spelled correctly
- Ensure you have sufficient credits/quota with your provider

### Scraping Errors
- Verify `APIFY_API_TOKEN` is set
- Check that URLs are valid and accessible
- Monitor Apify credits

## Performance Notes

- Vector embeddings are cached for 45 seconds
- Embedding batch size is 64 for optimal performance
- Database queries use indexes for fast retrieval

## Next Steps

1. Configure your LLM provider and API keys
2. Set up your Apify actor for web scraping
3. Run the application: `npm run dev`
4. Test the chat API with initial scraped content
5. Deploy to your hosting platform (Render, Railway, Vercel, etc.)
