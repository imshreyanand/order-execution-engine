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
  
  try {
    // Initialize server
    await server.initialize();
    
    // Start listening
    const port = parseInt(process.env.PORT || '3000');
    await server.start(port);
    
    console.log(`\n✅ Server running on port ${port}`);
    console.log(`📡 Open http://localhost:${port} in your browser`);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
  
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
  console.log('================================================');
}

// Run the application
main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});