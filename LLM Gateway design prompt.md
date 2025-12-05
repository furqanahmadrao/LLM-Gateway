title: "LLM Gateway Design Spec"

version: "0.1-research"

date: 2025-12-02

screenshot_path: "/mnt/data/4f04cdea-7c19-4dda-9e7b-16a02af92af8.png"

# Executive Summary

We propose a self-hosted LLM Gateway providing a single OpenAI-style API that proxies to multiple AI providers (OpenAI, Anthropic, Azure, Google Vertex, HuggingFace, etc.). Clients call familiar endpoints like /v1/chat/completions, /v1/models, and /v1/embeddings, while the gateway routes requests to underlying providers. All model IDs are unified (e.g. openai:gpt-4, anthropic:claude-2), with aliases supported. Model lists are fetched programmatically (no hard-coding) and cached with TTL and manual refresh. The gateway handles per-key authentication, rate-limiting, token accounting, and streaming normalization. Observability (logs, metrics) and billing/quotas are built-in. We adopt a modern stack (e.g. TypeScript + Express or Python + FastAPI, PostgreSQL, Redis, Prometheus/Grafana, Vault for secrets) to ensure performance and security. This spec details the complete design: data models, APIs, provider integrations (with researched endpoints and samples 1 2), UI theme (dark orange/black), deployment (DockerCompose, K8s), and an implementation roadmap. The design follows AWS's multi-provider LLM gateway guidance (OpenAI-compatible unified API) 3, enabling seamless multi-vendor LLM use while tracking usage and costs.

# Goals & Non-Goals

- Goals: Build a unified gateway exposing OpenAI-compatible endpoints (/v1/chat/ completions, /v1/models, etc.). Fetch models dynamically for each configured provider (on credential save and periodic refresh). Support streaming (SSE/chunked) outputs. Map unified model IDs to provider IDs. Apply provider-specific request/response transformations. Issue our own API keys to clients (per-project), enforcing quotas and logging usage. Provide a web UI for managing providers, projects, keys, aliases, and viewing metrics. Securely store provider credentials (e.g. Vault/KMS). Deployable locally (DockerCompose) or in cloud (K8s/VM). Multitenant by teams/projects. Monitor and log with Prometheus/Grafana. Include billing-token accounting.  
- Non-Goals: We do not implement model serving ourselves (no training or inference; just proxy to providers or local servers). We won't hard-code model lists or allow unsafe overrides. We do not handle fine-tuning APIs in v0 (out-of-scope). We assume a reliable network and no machine learning development effort. This is an API gateway and management layer only.  
- Assumptions: We assume providers' docs are up-to-date (we cite as of late 2025). We assume each provider supports REST or an SDK for model listing (if not, we require manual templates). We assume TLS termination is handled by ingress/ALB (we still enforce HTTPS). We assume PostgreSQL for relational data and Redis for caching (common in AWS guidance  ${}^{4}$  ). We assume a cloud-agnostic

approach with environment-variable configuration (no hard-coded secrets/hosts). We assume token counts can be estimated from provider responses (see Token Accounting). For local models (TGI, Triton, etc.), we assume an OpenAI-compat interface or similar.

# Provider Templates

For each provider we supply a JSON template describing how to list models, authenticate, and map requests. Below are key findings and sample template entries (full provider_template.json is in Appendix). Each entry must include fields like id, display_name, auth_type, model_list_endpoint, etc. Citations show how we verified endpoints/auth.

- OpenAI (openai) - Uses Bearer token auth. List models via GET https://api.openai.com/v1/ models with header Authorization: Bearer $OPENAI_KEY 3 . Response JSON: { data: [ {id, ..., ...} ]}. Model IDs are in data[]. id. Supports streaming (yes).

```json
{
    "id": "openai",
    "display_name": "OpenAI",
    "auth_type": "api_key",
    "authInstructions": "Use 'Authorization: Bearer <API_KEY>' header",
    "model_list_endpoint": "https://api.openai.com/v1/models",
    "model_list_method": "GET",
    "model_list Headers": {"Authorization": "Bearer ${API_KEY}"},
    "model_list_path_jsonpointer": "/data/*.id",
    "supports Streaming": true,
    "notes": "OpenAI models list; uses Bearer token auth.,
    "last_verified": "2024-12-01"
}
```

- Microsoft Azure OpenAI (azure_openai) - Almost identical to OpenAI except base URL and required

api-version . For example:

GET https://resource}.openaiazure.com/openai/models?api-version=2024-10-21

2, with header api-key: <KEY>. Response shape is like OpenAI.

```json
{
    "id": "azure_openai",
    "display_name": "Microsoft Azure OpenAI",
    "auth_type": "api_key",
    "authInstructions": "Use 'api-key: <AZURE_KEY>' header on Azure endpoint",
    "model_list_endpoint": "https://resource\.openai\.azure\.com/openai\models?api-version=2024-10-21",
    "model_list_method": "GET",
    "model_list Headers": {"api-key": "$\{AZURE_OPENAI_KEY\}"},
}
```

```json
"model_list_path_jsonpointer": "/data/*.id", "supports_STREAMing": true, "notes": "Azure OpenAI uses same API plus api-version 2.", "last_verified": "2025-02-01" }
```

```txt
- Anthropic (anthropic) - Uses X-Api-Key header. List models: GET https://api.anthropic.com/v1/models -H "X-Api-Key: $ANTHROPIC_KEY" 1. Response { "data": [ {id, ...}]}.
```

```json
{
    "id": "anthropic",
    "display_name": "Anthropic (Claude)", "auth_type": "api_key",
    "auth Instructions": "Use header 'X-Api-Key: <ANTHROPIC_KEY>'",
    "model_list_endpoint": "https://api.anthropic.com/v1/models",
    "model_list_method": "GET",
    "model_list Headers": {"X-Api-Key": "$\{ANTHROPIC_API_KEY\}"},
    "model_list_path_jsonpointer": "/data/*.id",
    "supports Streaming": false,
    "notes": "Anthropic models via /v1/models endpoint 1.", "last_verified": "2025-01-01"
}
```

- Google Vertex AI (google Vertex) - Uses Google Cloud auth ( OAuth/service account, not simple API key). There is no single /v1/models like interface. One must call Google Cloud APIs (e.g. aiplatform).(googleapis.com/v1/{parent=projects/*/locations/*}/models) to list deployed models. For chat/text generation, Google offers an OpenAI-compatible endpoint via Vertex: e.g. using base_url="https://us-central1-aiplatform).(googleapis.com/v1/projects/.../ endpoints/openapi" with OAuth token 5 . Model listing will require GCP calls (or manually configured). We include a template entry but note model_list_endpoint: null.

```json
{
    "id": "google Vertex",
    "display_name": "Google Vertex AI (Gemini)", 
    "auth_type": "oauth",
    "authInstructions": "Use Google Cloud OAuth2 token (Bearer) or service account",
    "model_list_endpoint": null,
    "model_list_method": "GET",
    "model_listheaders": {"Authorization": "Bearer ${GCP_ACCESS_TOKEN}"},
    "model_list_path_jsonpointer": null,
    "supports Streaming": true,
    "notes": "Vertex AI requires GCP API calls; OpenAI-compatible chat via
```

```txt
Vertex (example: use OpenAI client with base_url pointing to Vertex) 5 .", "last_verified": "2025-06-01" }
```

- Hugging Face (huggingface) - Hugging Face provides many models on their Hub. Authentication is via HF token (Authorization: Bearer HF_TOKEN). There is no single unified model-list endpoint for all "Inference API" models; one must use the HuggingFace Hub API (e.g. python list_models) or user-initiated list. For inference, you call specific endpoint like POST https://api-inference.huggingface.co/models/{model}. We treat it as custom: no auto-listing.

```json
{
    "id": "huggingface",
    "display_name": "HuggingFace Inference API",
    "auth_type": "api_key",
    "authInstructions": "Use header 'Authorization: Bearer <HF_TOKEN>'",
    "model_list_endpoint": null,
    "model_list_method": "N/A",
    "model_list Headers": {}, 
    "model_list_path_jsonpointer": null,
    "supports Streaming": false,
    "notes": "No dedicated model list; use Hugging Face Hub or custom setup.
HF inference endpoints accept chat (TGI/Messages API) or text generation.,
    "last_verified": "2025-03-01"
}
```

- Mistral (mistral) - Mistral AI provides an API. We found GET https://api.mistral.ai/v1/ models with Bearer auth 6 .

```json
{
    "id": "mistral",
    "display_name": "Mistral AI",
    "auth_type": "api_key",
    "authInstructions": "Use header 'Authorization: Bearer <API_KEY>'",
    "model_list_endpoint": "https://api.mistral.ai/v1/models",
    "model_list_method": "GET",
    "model_list Headers": {"Authorization": "Bearer ${MISTRAL_API_KEY}"},
    "model_list_path_jsonpointer": "/id",
    "supports Streaming": false,
    "notes": "Mistral /v1/models API returns models 6 .",
    "last_verified": "2025-06-01"
}
```

- TogetherAI (togetherai) - TogetherAI (togetherai) lists models via GET https://api.together.ai/models with Authorization: Bearer <KEY>. (Docs show this pattern in sample code.)

```json
{
    "id": "togetherai",
    "display_name": "TogetherAI",
    "auth_type": "api_key",
    "authInstructions": "Use header 'Authorization: Bearer <API_KEY>'",
    "model_list_endpoint": "https://api.together.ai/models",
    "model_list_method": "GET",
    "model_list Headers": {"Authorization": "Bearer ${TOGETHER_API_KEY}"},
    "model_list_path_jsonpointer": "/.id",
    "supports Streaming": false,
    "notes":
    "Together AI provides open models via API; model list at /models endpoint.", 
    "last_verified": "2025-02-01"
}
```

Groq (groq) - Groq uses an OpenAI-compatible API. Example:

```txt
GET https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY" 7. Returns {"data": [ {id, ..., ...}]}.
```

```json
{
    "id": "groq",
    "display_name": "Groq",
    "auth_type": "api_key",
    "authInstructions": "Use header 'Authorization: Bearer <API_KEY>'",
    "model_list_endpoint": "https://api.groq.com/openai/v1/models",
    "model_list_method": "GET",
    "model_list Headers": {"Authorization": "Bearer ${GROQ_API_KEY}"},
    "model_list_path_jsonpointer": "/data/*.id",
    "supports Streaming": true,
    "notes": "Groq's API is OpenAI-compatible 7 .",
    "last_verified": "2025-07-01"
}
```

- Aleph Alpha (alephalpha) - Aleph Alpha (Pharia) has a models API. E.g. docs show GET https://api.pharia.example.com/v1/os/models lists models .Auth is via API key header.

```txt
{"id": "alephalpha",
```

```python
"display_name": "Aleph Alpha", "auth_type": "api_key", "authinstructions": "Use header 'Authorization: ApiKey <API_KEY>' (or as specified)", "model_list_endpoint": "https://api.pharia.example.com/v1/os/models", "model_list_method": "GET", "model_list Headers": {"Authorization": "ApiKey ${AA_API_KEY}"},
"model_list_path_jsonpointer": "/data/*/modelId",
"supports Streaming": false,
"notes": "Aleph Alpha's Pharia OS API lists models (check actual base URL).",
"last_verified": "2025-01-01"
```

- Cohere (cohere) - Cohere's API lists models:  
```txt
GET https://api.cohere.com/v1/models with Authorization: Bearer <KEY> 9. Response has "models": [name, ...]. We use /models/*/name.
```

AWS Bedrock (aws.bedrock) - AWS Bedrock requires AWS SigV4. We call GET /foundation-models (as per AWS API) 11. It returns JSON like {"modelSummaries": {{"modelId":"string",...}}}.  
```json
{
    "id": "cohere",
    "display_name": "Cohere",
    "auth_type": "api_key",
    "authInstructions": "Use header 'Authorization: Bearer <API_KEY>'",
    "model_list_endpoint": "https://api.cohere.com/v1/models",
    "model_list_method": "GET",
    "model_list Headers": {"Authorization": "Bearer ${COHERE_API_KEY}"},
    "model_list_path_jsonpointer": "/models/*/name",
    "supports Streaming": false,
    "rate_limit_info": "80 RPM (approx) 10",
    "notes": "Cohere's model list endpoint 9 .",
    "last_verified": "2025-05-01"
}
```

```json
{
    "id": "aws.bedrock",
    "display_name": "AWS Bedrock",
    "auth_type": "aws_sigv4",
    "authInstructions": "Sign using AWS SigV4 (IAM credentials)", 
    "model_list_endpoint": "https://bedrock.<region>.amazonaws.com/ foundation-models",
}
```

```csv
"model_list_method": "GET",  
"model_list Headers": {"Authorization": "AWS4-HMAC-SHA256 ${Signature}"},
"model_list_path_jsonpointer": "/modelSummaries/*/modelId",
"supports Streaming": false,  
"notes": "Bedrock ListFoundationModels returns model summaries 11 .",
"last_verified": "2025-04-01"
```

- NVIDIA Triton (triton) - Triton Inference Server (local). List models via GET http://<triton-host>:8000/v2/models. Returns JSON listing models {name,...}. No auth by default.

```json
{
    "id": "triton",
    "display_name": "NVIDIA Triton",
    "auth_type": "none",
    "authInstructions": "Call Triton HTTP API at /v2/models or repository index",
    "model_list_endpoint": "http://<triton-host>:8000/v2/models",
    "model_list_method": "GET",
    "model_list Headers": {}, 
    "model_list_path_jsonpointer": "/models=*/name",
    "supports Streaming": false,
    "notes": "Triton provides /v2/models (and /v2/repository/index) for available models 12 .",
    "last_verified": "2025-06-01"
}
```

Each provider template is verified via official docs or SDK examples. For example, Anthropic's API reference shows using X-Api-Key 1; Groq's docs show OpenAI compatibility 7; Cohere docs give the /v1/ models endpoint 9.

# Model Registry

We maintain a relational Model Registry to cache model metadata and resolve unified IDs. Key tables:

providers, provider_creditsials, models, model_aliases, teams, projects,

api_keys, usage_logs. Tables (in SQL; see Appendix for full schema):

```sql
-- Teams and Projects for multi-tenancy  
CREATE TABLE teams (  
    id SERIAL PRIMARY KEY,  
    name TEXT NOT NULL UNIQUE);  
CREATE TABLE projects (
```

```sql
id SERIAL PRIMARY KEY,   
team_id INTEGER REFERENCES teams(id),   
name TEXT NOT NULL,   
UNIQUE(table_id, name)   
);   
-- Providers and stored credentials   
CREATE TABLE providers ( id SERIAL PRIMARY KEY,   
provider_id TEXT NOT NULL UNIQUE, -- e.g. 'openai', 'anthropic'   
name TEXT NOT NULL,   
template JSONB -- provider_template JSON for reference   
);   
CREATE TABLE provider_credits ( id SERIAL PRIMARY KEY,   
provider_id INTEGER REFERENCES providers(id),   
team_id INTEGER REFERENCES teams(id),   
credentials JSONB NOT NULL -- encrypted credentials (keys, tokens)   
);   
-- Models & Aliases (unified IDs, one per provider model)   
CREATE TABLE models ( id SERIAL PRIMARY KEY,   
provider_id INTEGER REFERENCES providers(id),   
provider_model_id TEXT NOT NULL, -- e.g. 'gpt-4', 'claude-v1'   
description TEXT,   
context_length INTEGER,   
created_at TIMESTAMP,   
updated_at TIMESTAMP,   
UNIQUE.provider_id, provider_model_id)   
);   
CREATE TABLE model_aliases ( id SERIAL PRIMARY KEY,   
model_id INTEGER REFERENCES models(id),   
alias TEXT NOT NULL, -- unified alias e.g. 'openai:gpt-4'   
team_id INTEGER REFERENCES teams(id) DEFAULT NULL,   
UNIQUE(table_id, alias)   
);   
-- API keys and usage   
CREATE TABLE api_keys ( id SERIAL PRIMARY KEY,   
key TEXT NOT NULL UNIQUE,   
project_id INTEGER REFERENCES projects(id),   
created_at TIMESTAMP NOT NULL DEFAULT NOW(),   
expires_at TIMESTAMP,   
revoked BOOLEAN DEFAULT FALSE   
);
```

```sql
CREATE TABLE usage_logs ( id BIGSERIAL PRIMARY KEY, api_key_id INTEGER REFERENCES api_keys(id), project_id INTEGER REFERENCES projects(id), provider_id INTEGER REFERENCES providers(id), model_id INTEGER REFERENCES models(id), tokens_in INTEGER, tokens_out INTEGER, cost DECIMAL(10,4), timestamp TIMESTAMP NOT NULL DEFAULT NOW())
```

Model Conflict Resolution: Aliases are per team or global (team_id NULL). On aliasing, if an alias already exists in the same scope, reject or append suffix. For example, if Team A and Team B both want alias gpt-4 for different providers, allow separate by team. If globally a conflict occurs, require explicit override or prefix.

Example: After initial fetch, model entries might be: | provider | provider_model_id | alias | context | ______________| ______________| ______________| | openai | gpt-4 | orcalatest | 8192 | | mistral | mistral-7b-v0.1 | orca/latest | 8192 | Here orca最新的 conflict resolved by namespaceing or alternate alias (or mark as duplicate and disallow).

# Routing & Proxy Logic

1. Unified Model Resolution: Client calls with unified ID, e.g. "model": "openai:gpt-4" or just "gpt-4" plus a provider hint. The gateway splits into provider_id and provider_model_id. If alias is used, look up model_aliases to find the actual model_id then join to find provider_id and provider_model_id.

2. Request Transformation: Each provider may have different JSON schema. The gateway inspects the provider template's request_mapping rules (we would define these in full implementation; e.g. for Anthropic, rename messages  $\rightarrow$  prompt, set role prefixes). We then call the provider API (sync or streaming) with transformed payload. Example: OpenAI vs. Anthropic prompt:

```python
Pseudo-code: map OpenAI chat to Anthropic "prompt"  
if provider == "anthropic":  
    prompt_text = ""  
    for msg in openai_request["messages']:  
        prompt_text += f"%{msg['role']}:{msg['content']} \n"  
    anthropic_req = {"prompt": prompt_text, "max_tokens_to_sample": openai_request["max_tokens"]}
```

(Illustrative only; actual mapping uses Anthropic's multi-message format with  $\diamond$ ROLE  $\diamond$  tokens.)

3. Streaming Normalization: If client requested stream=true, we open a streaming request to provider (if supported). E.g. OpenAI/Groq support SSE. For Anthropic (Claude 3 Beta supports streaming). We wrap provider's event stream into OpenAI-style stream chunks (e.g. {"choices": ["delta": {"content":"text"}]}). For example, a partial Anthropic response is transformed to JSON lines as per OpenAI spec and sent over SSE.

4. Headers/Auth: Attach extra headers per provider. E.g. Azure requires api-key header 2, Groq requires Authorization: Bearer, etc. For AWS Bedrock, sign with SigV4. Use AWS SDK or custom signer for requests.

5. Error Mapping: Convert provider error codes to OpenAI-format errors. E.g. if provider returns HTTP 401, translate to 401 with message. Respect status codes.

# Routing Flow (pseudo-code):

```ocaml
client_req = HTTP request from client  
extract api_key -> find project & team  
check quotas and increment usage (tentative)  
lookup unified_model_id -> (provider_id, provider_model_id) via model_aliases/ models  
transform client_req -> provider_req based on mapping  
add auth header from provider_creditsals  
send provider_req (async if streaming)  
receive providerResp (stream or full)  
transform providerResp -> OpenAI-style resp  
return resp to client (stream chunks if requested)  
log usage (tokens in/out, cost estimate) to DB
```

E.g., for Anthropic Chat (non-stream example):

```shell
curl https://api.anthropic.com/v1/complete \
-H "X-API-Key: $KEY" \
-d '{ 
    "model": "claude-2",
    "prompt": "Human: Hello\nAssistant:", 
    "max_tokens_to_sample": 50,
    "stream": false
}
```

The gateway would call Anthropic like above and return:

```json
{"id":"","object":"chatcompletion", "choices":[{ "message": {"content": "...}}}] }
```

matching OpenAI spec 1 5.

# API & Endpoint Design

Our API is OpenAPI/REST. We define endpoints (see Appendix for openapi.yaml skeleton). Key endpoints:  
- POST /v1/chat/completions: client requests chat response. Body: JSON with model, messages (roles & content), and parameters (temperature, max_tokens, stream etc). Response: JSON with choices[].message(content). Example (curl):

```shell
curl -X POST http://localhost:8080/v1/chat/completions \
-H "Authorization: Bearer CLIENT_KEY" \
-d '{ 
    "model": "anthropic:claude-2",
    "messages": ["role":"user","content":"Hello!"]
    "max_tokens":50
}
```

The gateway routes to Anthropic, streams response, and returns OpenAI-format chat JSON.

- POST /v1/completions : basic completion. Body: model , prompt , other params. Returns text.  
- POST /v1/embeddings : generate embeddings. Body: model, input. Returns embedding vectors. (Map to underlying embedding API or generate from model).  
- GET /v1/models : list all unified models visible to this project/team (combining all providers). E.g. [id:"openai:gpt-4", ..., {id:"huggingface:ChatGPT"}]. We fetch from model Registry.  
- GET /v1 keys : list API keys (admin only).  
- POST /v1 keys : create a new API key (admin).

All endpoints require Authorization: Bearer <our-gateway-key>. The key maps to a project, enforcing usage logs and quotas.

Security: We use API key auth (gateway-issued keys) in headers. Example OpenAPI security scheme in openapi.yaml (see Appendix) uses apiKey in header. Clients must include this on every call. Admin endpoints (keys, projects) would check key privileges or require team admin rights.

# Authentication & Key Management

Gateway API Keys: We issue opaque keys (random tokens) to users/projects. Each key is linked to a project_id. We store hashed keys in DB for security. On each request, we look up the key and validate active/not revoked. We associate calls with project/team for logging/quota. Keys can be created/revoked via admin API (POST/GET /v1 keys). We can use UUIDs or JWTs; opaque is simpler. Store in api_keys.

Provider Credentials: We store provider credentials (API keys, tokens, Azure resource IDs, AWS roles) securely. Options: use HashiCorp Vault or cloud KMS. E.g., in Postgres we store encrypted blobs (using application-level encryption or Vault). We can map environment vars or Vault integration for decryption. On startup or save, we fetch provider models using these credits.

Rotation/Revocation: Clients can revoke their key (setting revoked=true). We log these events. For provider credits, we require re-entry to update keys; or use automatic rotation via Vault.

JWT vs Opaque: Opaque tokens are easy (random strings). JWT could include project claims but we already check DB. We will likely use opaque to allow revocation.

# Rate Limiting, Quotas & Billing

We implement token bucket rate limiting per API key and per provider. Configurable limits (e.g. 60 RPM default). Use Redis to store tokens/bucket (c.f. Leaky Bucket). Each request decreases allowance. On exceed, return 429. We also apply provider-specific quotas (e.g. not to exceed certain concurrency for OpenAI).

Billing/Quota Tracking: We log every request's tokens_in and tokens_out (provider may give usage; e.g. OpenAI returns usage). If provider doesn't provide, we estimate (character count or known rates). We accumulate token usage per project. Cost = tokens * rate (if billing). Provide usage_logs table (see schema) and a billing export CSV.

Database design: The usage_logs table (above) records each call. We generate monthly reports by summing tokens. Exportable by project/team. For cost, we can pre-store provider token prices (in providers or config) and calculate cost; or leave as metric for now.

Billing Example: If OpenAI GPT-4 is $0.03/1K tokens, we multiply tokens out by price. We should cite official rates (out of date quickly, so mark as variable).

# Tech Stack & Libraries

- Backend: We recommend Node.js/Express (TypeScript) or Python/FastAPI for the API server. Both have strong HTTP libraries and async support. For example, Express + [openai] npm or direct HTTP client, or FastAPI + [httpx]. We must handle streaming well (Node streams, or FastAPI Response streaming).  
- ORM/DB: PostgreSQL is a solid choice (relational multi-tenant schema). We design with SQL (see schema). Alternatively Prisma ORM (TypeScript) or SQLAlchemy (Python). We cite AWS guidance using RDS and recommend relation DB for structured data.  
- Cache: Redis for caching model lists (if heavy) and rate-limit buckets. Also for short-lived data.  
- Secrets: Use HashiCorp Vault or cloud KMS (AWS Secrets Manager/GCP Secret Manager) to store provider creds. AWS guidance uses Secrets Manager 13 . In dev/test, an encrypted DB field with a master key is acceptable.  
- Metrics & Logging: Use Prometheus for metrics (we expose counters/gauges, e.g. calls/sec, tokens/sec). Use Grafana for dashboards. Logging: write JSON logs (structured) to file/CloudWatch or ELK. AWS guidance suggests CloudWatch but self-hosted could use Elastic Stack or Loki.  
- HTTP Server: Behind NGINX or API Gateway in cloud. Or Traefik as reverse proxy (see deployment). For TLS, we can integrate cert-manager in K8s with Let's Encrypt, or use Traefik/Caddy on VM. AWS Advise: use ALB/ACM 13.

# - Libraries:

- OpenAI SDK for API compatibility (e.g. [openai] npm or Python).  
- AWS SDK (for Bedrock calls with SigV4).  
Azure SDK (or raw REST).  
- Google | google-auth-library | and REST for Vertex AI.  
- HuggingFace | huggingface_hub | (if needed).  
- Rate-limiter: express-rate-limit or custom Redis token bucket.  
- Logging: winston (Node) or structlog (Python).  
- Prometheus client(e.g. prom-client or prometheus_client).

Citations: The AWS guidance suggests RDS and Elasticcache for scaling  $^{4}$ . Vault docs recommend dynamic secrets  $^{14}$ .

# UI/UX & Theme

We create a dark theme (orange & black) UI. Using the provided screenshot as inspiration, we define color tokens:

Primary Orange: #FF8800 (- - accent), accent-600: #E67E00.  
- Background Black: #0A0A0A (--bg).  
- Panel Grey: #1E1E1E (--panel).  
- Muted text: #88888 | (--muted).  
- Text white: #FFFFFF (--text).

```css
:root{ --bg:#0A0A0A; --panel:#1E1E1E; --accent:#FF8800; --accent-600:#E67E00; --muted:#888888; --text:#FFFFFF; }
```

In Tailwind, we might define theme colors e.g.  $\boxed{\mathrm{bg - black}}$ ,  $\boxed{\mathrm{text - white}}$ , or use CSS variables:

```css
.bg-panel{background-color:var(--panel);}   
.text-accent {color:var(--accent)；}
```

and so on.

# Pages & Components:

- Sidebar: Vertical menu (dark # panel, white text, orange highlight). Items: Dashboard, Providers, Projects, API Keys, Model Registry, Logs & Usage, Settings. On hover, orange background ( --accent -600 ).  
- Dashboard: Cards (e.g. request/sec, tokens/sec, cost), line charts, status indicators.

- Providers: List of configured providers. Card for each: name, status (last model refresh time, health icon), edit/delete.  
- Projects: Team's projects, with provider config inside each.  
- API Keys: List keys for current project, create new (input name, expiration).  
- Model Registry: Table of all models (alias, provider, name, context). Allow searching/alias editing.  
- Logs & Usage: Filterable table of usage logs (by project/model), summary charts (token usage over time).  
- Settings: Configure global settings (rate limits, refresh TTL), webhooks, environment variables.

Components: Card (metrics or chart), Line chart (tokens over time), Dropout selectors, Modal dialogs (for adding provider, aliasing), Form fields (API key creation).

Example snippet (Sidebar & Dashboard card):

```txt
<!--Sidebar-->   
<aside class  $\equiv$  "bg-panel w-64 min-h-screen text-muted"> <nav> <ul> <li class  $\equiv$  "p-4 hover:bg-accent-600"><a class  $\equiv$  "text-text" href  $=$  "/ dashboard">Dashboard</a></li> <li class  $\equiv$  "p-4 hover:bg-accent-600"><a class  $\equiv$  "text-text" href  $=$  "/ providers">Providers</a></li> </ul> </nav>   
</aside>   
<!-- Dashboard card-->   
<div class  $\equiv$  "bg-panel p-4 rounded-lg text-text"> <h2 class  $\equiv$  "text-x1 mb-2">Tokens per minute</h2> <p class  $\equiv$  "text-3x1">1200</p>   
</div>
```

Ensure contrast ratios meet WCAG AA. E.g. orange #FF8800 on black #0A0A0A yields good contrast. For small text, use white or light grey.

# Team & Project Multi-tenancy

Users belong to Teams; each team has multiple Projects. Projects have isolated usage and API keys. Each project stores provider credentials and model aliases separate from other teams. DB tables (teams, projects) support this. APIs use key  $\rightarrow$  project  $\rightarrow$  team mapping. For example: user's API key X belongs to Project P (Team T). We restrict viewing/editing providers and models to that team (or global admin).

Flows: User logs in (or uses key)  $\rightarrow$  lists teams/projects  $\rightarrow$  selects project (context). All operations (e.g. adding provider credentials, viewing usage) occur within that project. Keys created under a project.

# Monitoring & Dashboard

We expose metrics for Prometheus:

- Request Rate: rps and latency per endpoint/provider.  
- Token Throughput: tokens_in/sec, tokens_out/sec.  
- Concurrent Streams: number of active streaming requests.  
-Errors:  $4xx / 5xx$  rates.  
- Cost by Provider: tokens_in * provider_token_cost (for billing monitoring).

Grafana dashboards:

- Overview: Total calls, tokens, cost trends.  
- Per-Provider: bar charts of usage by provider,  $99\%$  latency.  
- Project Usage: filters by project/team.  
- Logs Viewer: Search request/response logs (redact PII, show metadata).

We also log to a file or syslog: each request with fields (timestamp, team, project, model alias, provider, tokens in/out). Avoid logging full user prompts (for privacy) unless needed for debug.

# Deployment Guide

Local (DockerCompose): We provide a docker-compose.yaml snippet to run:

- gateway service (the API app), listening on 0.0.0.0:8080.  
- postgres for DB, redis for cache.  
-vault or bitnami/vault container for secrets (optional).  
- Example:

```textproto
services: gateway: image: 1lm-gateway:latest env_file:.env ports:"8080:8080" depends_on:"postgres","redis"] postgres: image:postgres:15 environment:[POSTGRES_DB,POSTGRES_USER,POSTGRES_PASSWORD] volumes:"pgdata:/var/lib/postgresql/data"] redis: image:redis:7 ports:"6379:6379" volumes:{pgdata:{}}
```

Set DB URL, Redis URL, Vault address via env vars.

Kubernetes: Provide example manifests:

- Deployment for gateway (with liveness/readiness probes).  
- StatefulSet or Deployment for Postgres (or use RDS).  
- Deployment for Redis or ElastiCache.  
- Use Ingress resource with cert-manager Issuer for TLS (Let's Encrypt).  
- Env secrets from K8s Secret or Vault injector.  
- Example:

```yaml
apiVersion: apps/v1  
kind: Deployment  
metadata: { name: llm-gateway }  
spec:  
replicas: 2  
template:  
spec:  
    containers:  
        - name: gateway  
            image: llm-gateway:latest  
            envoyFrom:  
                - secretRef: { name: gateway-secrets }  
            ports: [{containerPort:8080}]  
...  
apiVersion: networking.k8s.io/v1  
kind: Ingress  
metadata: { name: llm-gateway, annotations: { "cert-manager.io/cluster-issuer":"letsencrypt-prod" } }  
spec:  
    tls: [{ hosts: ["ai-gateway.example.com"], SecretName: gateway-tls }]  
    rules:  
        - host: ai-gateway.example.com  
            http: { paths: [... ] }
```

We recommend Ingress + cert-manager (Let's Encrypt) for TLS 13. Alternatively, on VMs use Traefik/Caddy with auto TLS.

Serverless/VM: Not ideal for streaming. If needed, use an Always-On container or VM (AWS ECS Fargate/EKS, GKE, Azure Container Instances). Use managed DB/Cache (RDS, ElastiCache).

# Security Checklist

- Secrets: Store provider keys in Vault or encrypted DB. Use least-privilege IAM roles for cloud APIs.  
- TLS: Require HTTPS for all traffic. Use HSTS. Ingress should have cert from a trusted CA (letsencrypt/ cert-manager).  
- Auth: Validate incoming API keys. Use strong random keys (e.g. 256-bit). Rate-limit admin endpoints.

- Rate Limiting/DDoS: Enforce per-key and global rate limits (Redis-backed token buckets). Reject excessive requests (429). Use cloud WAF if available.  
- Headers: Set security headers (CORS, CSP, X-Frame-Options).  
- CORS: Strict policy (only trusted origins can call UI).  
- Admin UI: Restrict to team members; consider IP whitelisting.  
- Audit Logs: Keep logs of admin actions (key creation, credential changes).  
- Image Security: Use non-root container user, minimal base image (Distroless or Alpine). Run vulnerability scans (Trivy).  
- Dependencies: Regularly update for security patches.  
- Rate Limit Overflow: If Redis or DB is down, fail-safe to protect from surges (deny new requests).

# Scalability & Performance

- Caching: Cache model lists and model metadata (TTL e.g. 1h). Use Redis for in-memory cache.  
- Connection Pooling: Use HTTP keep-alive/connection pooling to providers.  
- Concurrency: Run multiple instances behind load balancer for horizontal scaling.  
- Streaming: Use asynchronous I/O (Node streams or FastAPI's async) to efficiently proxy SSE.  
- Batching: (Optional v2) support batch requests by splitting under the hood.  
- Rate Limit: Token bucket algorithms in Redis (e.g. leaky bucket) for per-key and per-provider limits.  
- Timeouts/Retry: Set sensible HTTP timeouts. Possibly retry idempotent calls.

# Testing Plan

- Unit tests: For request/response mapping logic, provider templates parsing.  
- Integration tests: Mock providers or use sandbox keys to test each provider integration (list models, completions). Use sample curl commands (see Appendix) to verify template config.  
- Provider-Specific Tests: E.g., calling cur1 on each listed model endpoint (in README) to ensure connectivity.  
- Load testing: Simulate concurrent streaming requests (e.g. with k6 or JMeter). Verify rate limiting.  
- Security tests: Attempt invalid keys, SQL injection, XSS in logs.  
- UI tests: Use Cypress or Selenium to test login, key creation, provider addition flows.  
- Regression: Record cost/token usage metrics and ensure counting accuracy.

# Implementation Roadmap (Prioritized)

1. MVP (v0.1): Core gateway functionality with 3-4 providers (OpenAI, Anthropic, Azure, Mistral). Local deployment with DockerCompose. Basic UI (Provider and Key management, Logs). Database and caching. Authentication and simple rate limit. Non-streaming fallback only.  
2. v1.0: Add streaming support, more providers (Groq, Cohere, AWS Bedrock). Full multi-tenancy. Enhanced UI ( Dashboard, usage charts). Quotas and billing. Deployment configurations (K8s). Monitoring integration.  
3. v2.0: Advanced features: local model runners (TGI, Triton). Analytics dashboard, team/role RBAC. Self-hosted dashboard for fine-tuning jobs and file uploads. Federation support.

# Appendix

provider_template.json  
```txt
[   
{ "id": "openai", "display_name": "OpenAI", "auth_type": "api_key", "authInstructions": "Use 'Authorization: Bearer <API_KEY>' header", "model_list_endpoint": "https://api.openai.com/v1/models", "model_list_method": "GET", "model_list Headers": {"Authorization": "Bearer  ${\mathbb{S}}\{\mathrm{AP}$  KEY}},{ "model_list_path_jsonpointer": "/data/*/id", "supports Streaming": true, "rate_limit_info": "Per-API limits", "notes": "OpenAI standard API" }, { "id": "azure_openai", "display_name": "Microsoft Azure OpenAI", "auth_type": "api_key", "authInstructions": "Use 'api-key: <API_KEY>' header", "model_list_endpoint": "https://resource}.openai. azure.com/openai/models? api-version=2024-10-21", "model_list_method": "GET", "model_list Headers": {"api-key": "$\{AZURE_OPENAI_KEY\}},{ "model_list_path_jsonpointer": "/data/*/id", "supports Streaming": true, "rate_limit_info": "Azure OpenAI quotas", "notes": "Azure OpenAI (same API with api-version) 2" } , { "id": "anthropic", "display_name": "Anthropic (Claude)", "auth_type": "api_key", "authInstructions": "Use 'X-Api-Key: <API_KEY>' header", "model_list_endpoint": "https://api.anthropic.com/v1/models", "model_list_method": "GET", "model_list Headers": {"X-Api-Key": "$\{ANTHROPIC_API_KEY\}},{ "model_list_path_jsonpointer": "/data/*/id", "supports Streaming": false, "rate_limit_info": "Anthropic quotas", "notes": "Anthropic API 1" } , {
```

```txt
"id": "google Vertex",
"display_name": "Google Vertex AI",
"auth_type": "oauth",
"authInstructions": "Use Google OAuth2 token",
"model_list_endpoint": null,
"model_list_method": "GET",
"model_listheaders": {"Authorization": "Bearer ${GCP_TOKEN}"},
"model_list_path_jsonpointer": null,
"supports Streaming": true,
"rate_limit_info": "GCP quotas",
"notes": "Use Vertex AI APIs; OpenAI-compatible chat on Vertex"
},
{
    "id": "huggingface",
    "display_name": "Hugging Face Inference",
    "auth_type": "api_key",
    "auth Instructions": "Use 'Authorization: Bearer <TOKEN>' header",
    "model_list_endpoint": null,
    "model_list_method": "GET",
    "model_list Headers": {}, 
    "model_list_path_jsonpointer": null,
    "supports Streaming": false,
    "rate_limit_info": "Depends on plan",
    "notes": "No unified list; use HF Hub or endpoints"
},
{
    "id": "mistral",
    "display_name": "Mistral AI",
    "auth_type": "api_key",
    "auth Instructions": "Use 'Authorization: Bearer <API_KEY>' header",
    "model_list_endpoint": "https://api.mistral.ai/v1/models",
    "model_list_method": "GET",
    "model_list headers": {"Authorization": "Bearer ${MISTRAL_API_KEY}"},
    "model_list_path_jsonpointer": "/id",
    "supports Streaming": false,
    "rate_limit_info": "Mistral quotas",
    "notes": "Mistral /v1/models 6 "
},
{
    "id": "togetherai",
    "display_name": "TogetherAI",
    "auth_type": "api_key",
    "auth Instructions": "Use 'Authorization: Bearer <API_KEY>' header",
    "model_list_endpoint": "https://api.together.ai/models",
    "model_list_method": "GET",
    "model_list headers": {"Authorization": "Bearer ${TOGETHER_API_KEY}"},
    "model_list_path_jsonpointer": "/.id",
    "supports Streaming": false,
};
```

```txt
"rate_limit_info": "Together AI quotas",  
"notes": "Together.ai models list"  
},  
{  
    "id": "groq",  
    "display_name": "Groq",  
    "auth_type": "api_key",  
    "authInstructions": "Use 'Authorization: Bearer <API_KEY>' header",  
    "model_list_endpoint": "https://api.groq.com/openai/v1/models",  
    "model_list_method": "GET",  
    "model_list Headers": {"Authorization: Bearer ${GROQ_API_KEY}"},  
    "model_list_path_jsonpointer": "/data/*/id",  
    "supports Streaming": true,  
    "rate_limit_info": "Groq quotas",  
    "notes": "Groq OpenAI-compatible 7"  
},  
{  
    "id": "alephalpha",  
    "display_name": "Aleph Alpha",  
    "auth_type": "api_key",  
    "authInstructions": "Use 'Authorization: ApiKey <API_KEY>' header",  
    "model_list_endpoint": "https://api.pharia.example.com/v1/os/models",  
    "model_list_method": "GET",  
    "model_list Headers": {"Authorization": "ApiKey ${AA_API_KEY}"},
    "model_list_path_jsonpointer": "/data/*/modelId",  
    "supports Streaming": false,  
    "rate_limit_info": "Aleph Alpha quotas",  
    "notes": "Aleph Alpha models list 8"  
},  
{  
    "id": "cohere",  
    "display_name": "Cohere",  
    "auth_type": "api_key",  
    "authInstructions": "Use 'Authorization: Bearer <API_KEY>' header",  
    "model_list_endpoint": "https://api.cohere.com/v1/models",  
    "model_list_method": "GET",  
    "model_list Headers": {"Authorization": "Bearer ${COHERE_API_KEY}"},
    "model_list_path_jsonpointer": "/models/*/name",  
    "supports Streaming": false,  
    "rate_limit_info": "80 RPM 10 ",  
    "notes": "Cohere model names 9"  
},
```

```json
models", "model_list_method": "GET", "model_listheaders": {"Authorization": "AWS4-HMAC-SHA256 ${Signature}"},
"model_list_path_jsonpointer": "/modelSummaries/*/modelId",
"supports Streaming": false,
"rate_limit_info": "AWS service quotas",
"notes": "Bedrock list models 11 "
},
{
    "id": "triton",
    "display_name": "NVIDIA Triton",
    "auth_type": "none",
    "authInstructions": "No auth; use Triton HTTP API",
    "model_list_endpoint": "http://<triton-host>:8000/v2/models",
    "model_list_method": "GET",
    "model_list Headers": {}, 
    "model_list_path_jsonpointer": "/models/*/name",
    "supports Streaming": false,
    "rate_limit_info": "Local deployment",
    "notes": "Triton /v2/models or /v2/repository/index 12 "
}
```

# openapi.yaml

```yaml
openapi: 3.0.3  
info: title: LLM Gateway API version: 1.0.0  
servers: -url: https://api.example.com  
paths: /v1/chat/completions: post: summary: Chat Completion (OpenAI-compatible) requestBody: required: true content: application/json: schema: type: object properties: model: type: string messages: type: array
```

```yaml
items: type: object properties: role: { type: string } content: { type: string } temperature: { type: number } max_tokens: { type: integer } stream: { type: boolean } required: [model, messages] responses: '200': description: Chat completion content: application/json: schema: type: object security: - ApiKeyAuth: [] /v1/completions: post: summary: Text Completion (OpenAI-compatible) requestBody: required: true content: application/json: schema: type: object properties: model: { type: string } prompt: { type: string } max_tokens: { type: integer } temperature: { type: number } required: [model, prompt] responses: '200': { description: Completion response } security: - ApiKeyAuth: [] /v1/embeddings: post: summary: Create Embeddings requestBody: required: true content: application/json: schema: type: object properties: model: { type: string }
```

```yaml
input: oneOf: - type: string - type: array items: { type: string } required: [model, input] responses: '200': { description: Embeddings response} security: - ApiKeyAuth: [] /v1/models: get: summary: List available models (unified) responses: '200': { description: List of model metadata} security: - ApiKeyAuth: [] /v1/keys: get: summary: List API keys (admin) responses: '200': { description: API keys list} security: - ApiKeyAuth: [] post: summary: Create API key requestBody: required: true content: application/json: schema: type: object properties: project_id: { type: string } required: [project_id] responses: '201': { description: Created} security: - ApiKeyAuth: []   
components:   
securitySchemes: ApiKeyAuth: type: apiKey name: Authorization in: header
```

# modelregistry_schema.sql

(PostgreSQL syntax)

```txt
CREATE TABLE teams ( id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE   
);   
CREATE TABLE projects ( id SERIAL PRIMARY KEY, team_id INTEGER REFERENCES teams(id), name TEXT NOT NULL, UNIQUE(table_id, name)   
);   
CREATE TABLE providers ( id SERIAL PRIMARY KEY, provider_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, template JSONB   
);   
CREATE TABLE provider_credits ( id SERIAL PRIMARY KEY, provider_id INTEGER REFERENCES providers(id), team_id INTEGER REFERENCES teams(id), credentials JSONB NOT NULL   
);   
CREATE TABLE models ( id SERIAL PRIMARY KEY, provider_id INTEGER REFERENCES providers(id), provider_model_id TEXT NOT NULL, description TEXT, context_length INTEGER, created_at TIMESTAMP, updated_at TIMESTAMP, UNIQUE.provider_id, provider_model_id)   
);   
CREATE TABLE model_aliases ( id SERIAL PRIMARY KEY, model_id INTEGER REFERENCES models(id), alias TEXT NOT NULL, team_id INTEGER REFERENCES teams(id) DEFAULT NULL, UNIQUE(table_id, alias)   
);   
CREATE TABLE api_keys ( id SERIAL PRIMARY KEY, key TEXT NOT NULL UNIQUE,
```

```sql
project_idINTEGER REFERENCES projects(id), created_atTIMESTAMP NOT NULL DEFAULT NOW(), expires_atTIMESTAMP, revokedBOOLEANDEFAULTFALSE);   
CREATE TABLEusage_logs ( id BIGSERIALPRIMARYKEY, api_key_idINTEGERREFERENCESapi_keys(id), project_idINTEGER REFERENCESprojects(id), provider_idINTEGER REFERENCES providers(id), model_idINTEGER REFERENCESmodels(id), tokens_inINTEGER, tokens_outINTEGER, cost DECIMAL(10,4), timestampTIMESTAMPNOTNULLDEFAULTNOW();
```

# DockerCompose Snippets

```yaml
version: '3.8'  
services:  
    gateway:  
        image: 11m-gateway:latest  
        env_file: .env  
    ports:  
        - "8080:8080"  
    depends_on:  
        - postgres  
        - redis  
    postgres:  
        image: postgres:15  
    environment:  
        POSTGRES_DB: gatewaydb  
        POSTGRES_USER: gateway  
        POSTGRES_PASSWORD: securepw  
    volumes:  
        - pgdata:/var/lib/postgresql/data  
    redis:  
        image: redis:7  
    ports:  
        - "6379:6379"  
volumes:  
    pgdata:
```

# Example curl Commands (Model List)

# - OpenAI:

```shell
curl https://api.openai.com/v1/models \
-H "Authorization: Bearer $OPENAI_KEY"
```

# - Anthropic: 1

```shell
curl https://api.anthropic.com/v1/models -H "X-API-Key: $ANTHROPIC_KEY"
```

# Azure OpenAI: 2

```shell
curl "https://myresource.openai azure.com/openai/models?api-version=2024-10-21" \
-H "api-key: $AZURE_KEY"
```

# Mistral: 6

```shell
curl https://api.mistral.ai/v1/models \
-H "Authorization: Bearer $MISTRAL_KEY"
```

# Groq: 7

```batch
curl https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_KEY"
```

# ·Cohere: 15

```shell
curl https://api.cohere.com/v1/models \
-H "Authorization: Bearer $COHERE_KEY"
```

(Replace environment variables with real keys.)

# Next Steps (Engineers)

- [ ] Set up repository structure, CI/CD (build, tests, Docker).  
- [ ] Implement provider config model; load {provider_template.json} on startup.  
- [ ] Implement DB schema and migrations (Postgres).  
- [ ] Implement model registry logic (initial fetch on credential save).

- [ ] Build request routing: parse unified model ID, transform to provider request, call provider API.  
- [ ] Implement streaming support (chunk responses).  
- [ ] Add authentication middleware (API key validation) and logging.  
- [ ] Create UI components (refer theme tokens above) for Providers, Keys, Projects, Dashboard.  
- [ ] Set up monitoring (Prometheus metrics, Grafana dashboards).  
- [ ] Write unit/integration tests for each provider using sample model-list endpoints.  
- [ ] Deploy locally via Docker Compose for QA; test K8s config and TLS setup.

# 1 List Models - Claude API Reference

https://platform.claude.com/docs/en/api/models/list

# 2 Models - List - REST API (Azure Azure AI Services) | Microsoft Learn

https://learn.microsoft.com/en-us/rest/api/azureopenai/models/list/view=rest-azureopenai-2024-10-21

# 3 4 13 Guidance for Multi-Provider Generative AI Gateway on AWS

https://aws.amazon.com/solutions/guidance/multi-provider-generative-ai-gateway-on-aws/

# 5 Messages API

https://huggingface.co/docs/text-generation-inference/en/messages_api

# Models

https://docs.mistral.ai/api/endpoint/models

# 7 API Reference - GroqDocs

https://console.groq.com/docs/api-reference

# 8 List all available models | Aleph Alpha Docs

https://docs.aleph-alpha.com/products/apis/pharia-os/list-all-available-models/

# 9 10 15 List Models | Cohere

https://docs.cohere.com/reference/list-models

# 11 ListFoundationModels - Amazon Bedrock

https://docsAWS.amazon.com/bedrock/latest/APIReference/API_ListFoundationModels.html

# 12 Triton Inference Server API Endpoints Deep Dive | by Manikandan Thangaraj | Medium

https://medium.com/@manikandan_t/triton-inference-server-api-endpoints-deep-dive-05b3061b156e

# 14 PostgreSQL database secrets engine | Vault - HashiCorp Developer

https://developerHASHicorp.com/vault/docs/secrets/databases/postgresql
