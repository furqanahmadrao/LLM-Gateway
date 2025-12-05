import express, { Express } from 'express';
import dotenv from 'dotenv';
import routes from './api/routes.js';
import { loggingMiddleware, hostValidationMiddleware } from './middleware/index.js';
import { initializeBaseUrl, getBaseUrlConfig } from './services/baseUrl.js';

dotenv.config();

const app: Express = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Initialize base URL configuration
// Requirements: 8.1 - Parse and validate BASE_URL on startup
try {
  initializeBaseUrl(PORT);
} catch (error) {
  console.error('Failed to initialize BASE_URL:', error);
  process.exit(1);
}

// Middleware
app.use(express.json());
app.use(loggingMiddleware);

// Host header validation middleware
// Requirements: 8.2 - Validate Host header for incoming requests
app.use(hostValidationMiddleware);

// Get base path for routing
// Requirements: 8.3 - Mount routes under configured base path
const config = getBaseUrlConfig();
if (config.basePath) {
  app.use(config.basePath, routes);
} else {
  app.use(routes);
}

// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: {
      message: 'Internal server error',
      type: 'internal_error',
      code: 'internal_error',
    },
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`LLM Gateway running on port ${PORT}`);
  console.log(`Base URL: ${config.baseUrl}`);
});

export default app;
