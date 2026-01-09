import dotenv from 'dotenv';
import OrderExecutionServer from './server';

// Load environment variables
dotenv.config();

/**
 * Main application entry point
 */
async function main() {
  console.log('🚀 Starting Order Execution Engine...');
  console.log('================================================');
  
  const server = new OrderExecutionServer();
  
  // Initialize server
  await server.initialize();
  
  // Start listening
  const port = parseInt(process.env.PORT || '3000');
  await server.start(port);
  
  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down gracefully...`);
    await server.stop();
    process.exit(0);
  };
  
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  
  console.log('================================================');
  console.log('✅ Order Execution Engine is ready!');
  console.log(`📝 Submit orders: POST http://localhost:${port}/api/orders/execute`);
  console.log(`📊 View orders: GET http://localhost:${port}/api/orders`);
  console.log('================================================');
}

// Run the application
main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});