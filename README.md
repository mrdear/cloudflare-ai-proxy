# Cloudflare AI Proxy

A Cloudflare Worker that provides OpenAI and Claude compatible API endpoints, powered by Cloudflare AI Gateway.

## Features

- 🔄 **OpenAI API Compatibility**: `/chat/completions`, `/models`
- 🤖 **Claude API Compatibility**: `/v1/messages`
- 🔐 **Dual Authentication**: Bearer token and URL-based auth (JetBrains compatible)
- 📊 **Request Logging**: Built-in request/response logging

## Local Development

### Prerequisites

- Node.js
- pnpm (or npm)
- Cloudflare account

### Setup

1. **Clone the repository**
   ```bash
   git clone <your-repo>
   cd cloudflare-ai-proxy
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Create `.dev.vars` file**
   
   The configuration uses JSON environment variables:
   
   ```bash
   cat > .dev.vars << 'EOF'
   CF_GATEWAY_KEY=your-cloudflare-gateway-key
   PROXY_API_KEY=your-secret-token
   MODELS_CONFIG=[{"id":"google-ai-studio/gemini-flash-latest","name":"gemini-flash-latest","endpoint":"/v1/YOUR_ID/proxy/compat"}]
   EOF
   ```

   **Configuration Details:**
   
   - `MODELS_CONFIG`: JSON array of model configurations
     ```json
     [
       {
         "id": "google-ai-studio/gemini-flash-latest",
         "name": "gemini-flash-latest",
         "endpoint": "/v1/YOUR_ID/proxy/compat"
       }
     ]
     ```
   
   Replace `YOUR_ID` with your actual Cloudflare AI Gateway ID.

4. **Start development server**
   ```bash
   pnpm run dev
   ```

   The server will start at `http://localhost:8787`

## Deployment to Cloudflare

### Prerequisites

Before deploying, you need to configure model connections in Cloudflare AI Gateway:

1. **Go to Cloudflare Dashboard**
   - Navigate to `AI` → `AI Gateway`
   - Create a new Gateway or select an existing one
   - Note your Gateway ID (you'll need this for `MODELS_CONFIG`)

2. **Configure Model Providers**
   - Add your model providers (Google AI Studio, OpenRouter, etc.)
   - Set up API keys for each provider
   - Test the connections to ensure they work

### Configuration

All environment variables should be configured on **Cloudflare Dashboard** (recommended).

#### Cloudflare Dashboard
1. **Deploy project to worker**
   - [![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mrdear/cloudflare-ai-proxy)

2. **Go to Worker Settings**
   - Navigate to `Workers & Pages` → Select your Worker → `Settings` → `Variables`
   - Select the "Production" environment

3. **Configure Secrets (Encrypted)**
   
   Add the following as **Encrypted** variables:
   
   - **`PROXY_API_KEY`**: Your custom authentication token for API access
   - **`CF_GATEWAY_KEY`**: Your Cloudflare AI Gateway API key

4. **Configure Model Mapping (Plaintext)**
   
   Add the following as **Plaintext** variable:
   
   - **`MODELS_CONFIG`**: JSON array mapping your models to AI Gateway endpoints
   
   **Format:**
   ```json
   [
    {
      "id": "google-ai-studio/gemini-2.5-flash",
      "name": "gemini-2.5-flash",
      "endpoint": "/v1/YOUR_GATEWAY_ID/proxy/compat"
    },
    {
      "id": "x-ai/grok-beta",
      "name": "grok-beta",
      "endpoint": "/v1/YOUR_GATEWAY_ID/proxy/openrouter"
    }
   ]
   ```
   
   **Important:**
   - Replace `YOUR_GATEWAY_ID` with your actual Cloudflare AI Gateway ID
   - The `id` should match the provider/model identifier you configured in AI Gateway
   - The `name` is what users will use in API requests
   - The `endpoint` path should match your AI Gateway Universal Endpoint configuration

## Usage

### Standard Authentication (Bearer Token)

Use with any OpenAI-compatible client:

```bash
curl -H "Authorization: Bearer <PROXY_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-flash",
    "messages": [{"role": "user", "content": "Hello!"}]
  }' \
  https://your-worker.workers.dev/chat/completions
```

### List Available Models

```bash
curl -H "Authorization: Bearer <PROXY_API_KEY>" \
  https://your-worker.workers.dev/models
```

### Claude API Style

```bash
curl -H "Authorization: Bearer <PROXY_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-flash",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 1024
  }' \
  https://your-worker.workers.dev/v1/messages
```

## JetBrains IDE Configuration

JetBrains IDEs (IntelliJ IDEA, PyCharm, WebStorm, etc.) support Local AI integration. Since JetBrains doesn't support custom headers, use the URL-based authentication endpoint.

### Setup Steps

1. **Open Settings**
   - Go to `Settings` → `Tools` → `AI Assistant`

2. **Add Custom Model Provider**
   - Click `+` to add a new provider
   - Select "OpenAI Compatible"

3. **Configure Base URL**
   ```
   https://your-worker.workers.dev/jb/<PROXY_API_KEY>
   ```
   
   Replace:
   - `your-worker.workers.dev` with your actual Worker URL
   - `<PROXY_API_KEY>` with your PROXY_API_KEY value

4. **Model Selection**
   - The models from your `MODELS_CONFIG` will be available
   - Select the model you want to use (e.g., `gemini-2.5-flash`)

5. **Test Connection**
   - Use the "Test Connection" button to verify
   - You should see a success message

### Example Configuration

**Base URL:** `https://my-ai-proxy.workers.dev/jb/my-secret-token`

### Notes

- No API key field needed (authentication is in the URL)
- All standard JetBrains AI features work (code completion, chat, etc.)
- Supports streaming responses

## Project Structure

```
src/
├── index.ts              # Main entry point with auth and logging
├── constant.ts           # Shared constants and model definitions
├── utils.ts              # Utility functions
└── router/
    ├── OpenAIRouter.ts   # OpenAI-compatible endpoints
    └── ClaudeRouter.ts   # Claude-compatible endpoints
```

## Environment Variables

| Variable | Description | Required | Storage Type |
|----------|-------------|----------|--------------|
| `CF_GATEWAY_KEY` | Cloudflare AI Gateway API key | Yes | **Secret** (via `wrangler secret` or dashboard) |
| `PROXY_API_KEY` | Custom token for API authentication | Yes | **Secret** (via `wrangler secret` or dashboard) |
| `MODELS_CONFIG` | Supported models configuration | Yes | **Plaintext** (in `wrangler.jsonc` or `.dev.vars`) |

## License

MIT
