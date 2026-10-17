import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log('====================================================');
  console.log(`🚀 HireMatch Express API running on port ${env.PORT}`);
  console.log(`🌐 Environment: ${env.NODE_ENV}`);
  console.log(`🛡️  CORS Origin: ${env.CORS_ORIGIN}`);
  console.log(`🔗 Health Check: http://localhost:${env.PORT}/api/health`);
  console.log('====================================================');
});

// Graceful shutdown handling
const shutdown = () => {
  console.log('\n🛑 Received termination signal, closing HTTP server...');
  server.close(() => {
    console.log('⚡ HTTP server closed gracefully.');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default server;
