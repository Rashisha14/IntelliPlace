# Judge0 API Setup

## Environment Variables

Add the following to your `.env` file in `intelliplace-backend/`:

```env
# Judge0 API Configuration
JUDGE0_API_URL=http://localhost:2358
# JUDGE0_API_KEY=your-api-key-here  # Optional, only if using RapidAPI
```

## Default Configuration

- **Default URL**: `http://localhost:2358` (for self-hosted Judge0)
- **API Key**: Optional (only needed for RapidAPI Judge0 service)

## Supported Languages

The system supports the following programming languages:
- **C** (Language ID: 50)
- **C++** (Language ID: 54)
- **Python** (Language ID: 92)
- **Java** (Language ID: 91)

## Setup Instructions

1. **Self-Hosted Judge0** (Recommended for development):
   - Install Judge0 using Docker: `docker run -p 2358:2358 judge0/judge0:latest`
   - Set `JUDGE0_API_URL=http://localhost:2358` in `.env`

2. **RapidAPI Judge0** (For production):
   - Sign up at RapidAPI and subscribe to Judge0 API
   - Get your API key
   - Set `JUDGE0_API_URL=https://judge0.p.rapidapi.com`
   - Set `JUDGE0_API_KEY=your-api-key` in `.env`

## Testing

Once configured, you can test the integration by:
1. Creating a coding test in the company dashboard
2. Starting the test
3. Students can then take the test and submit code





