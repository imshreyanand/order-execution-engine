import { Worker, Job } from 'bullmq';
import { OrderJob, StatusUpdate } from '../types';
import MockDexRouter from './mockDexRouter';
import DatabaseService from './database';
import Redis from 'ioredis';

/**
 * Queue Worker - Processes orders in background
 * Handles up to 10 concurrent orders with exponential backoff retry
 */
export class QueueWorker {
  private worker: Worker;
  private dexRouter: MockDexRouter;
  private db: DatabaseService;
  private redis: Redis;
  
  constructor(db: DatabaseService) {
    this.db = db;
    this.dexRouter = new MockDexRouter();
    
    // Redis connection for publishing status updates
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: null
    });
    
    // Create BullMQ worker
    this.worker = new Worker(
      'order-execution',
      async (job: Job<OrderJob>) => this.processOrder(job),
      {
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379')
        },
        concurrency: 10, // Process up to 10 orders simultaneously
        limiter: {
          max: 100, // Maximum 100 jobs
          duration: 60000 // Per minute (60 seconds)
        }
      }
    );
    
    // Event handlers
    this.worker.on('completed', (job) => {
      console.log(`✅ Order ${job.data.orderId} completed successfully`);
    });
    
    this.worker.on('failed', (job, err) => {
      console.error(`❌ Order ${job?.data.orderId} failed:`, err.message);
    });
  }
  
  /**
   * Process individual order
   * This is the main order execution flow
   */
  private async processOrder(job: Job<OrderJob>): Promise<void> {
    const { orderId, orderData } = job.data;
    const maxRetries = parseInt(process.env.MAX_RETRY_ATTEMPTS || '3');
    
    try {
      // Step 1: Routing - Compare DEX prices
      await this.publishStatus(orderId, 'routing');
      console.log(`🔄 [${orderId}] Routing: Comparing Raydium vs Meteora...`);
      
      const routingDecision = await this.dexRouter.getBestRoute(
        orderData.tokenIn,
        orderData.tokenOut,
        orderData.amountIn
      );
      
      // Log routing decision
      console.log(`📊 [${orderId}] Routing Decision: ${routingDecision.reason}`);
      console.log(`   Raydium: ${routingDecision.raydiumQuote.amountOut.toFixed(4)} tokens`);
      console.log(`   Meteora: ${routingDecision.meteoraQuote.amountOut.toFixed(4)} tokens`);
      console.log(`   Selected: ${routingDecision.selectedDex}`);
      
      // Update database with routing info
      await this.db.updateOrderStatus(orderId, 'routing', {
        selectedDex: routingDecision.selectedDex,
        raydiumPrice: routingDecision.raydiumQuote.price,
        meteoraPrice: routingDecision.meteoraQuote.price
      });
      
      await this.publishStatus(orderId, 'routing', {
        selectedDex: routingDecision.selectedDex,
        raydiumPrice: routingDecision.raydiumQuote.price,
        meteoraPrice: routingDecision.meteoraQuote.price
      });
      
      // Step 2: Building - Create transaction
      await this.publishStatus(orderId, 'building');
      console.log(`🔨 [${orderId}] Building transaction for ${routingDecision.selectedDex}...`);
      
      await this.db.updateOrderStatus(orderId, 'building');
      
      // Step 3: Submitted - Execute swap
      await this.publishStatus(orderId, 'submitted');
      console.log(`📤 [${orderId}] Submitting transaction to ${routingDecision.selectedDex}...`);
      
      await this.db.updateOrderStatus(orderId, 'submitted');
      
      const result = await this.dexRouter.executeSwap(
        routingDecision.selectedDex,
        orderData,
        routingDecision.selectedQuote
      );
      
      if (result.success) {
        // Step 4: Confirmed - Success!
        console.log(`✅ [${orderId}] Transaction confirmed: ${result.txHash}`);
        
        await this.db.updateOrderStatus(orderId, 'confirmed', {
          txHash: result.txHash,
          executedPrice: result.executedPrice,
          amountOut: result.amountOut
        });
        
        await this.publishStatus(orderId, 'confirmed', {
          txHash: result.txHash,
          executedPrice: result.executedPrice,
          amountOut: result.amountOut
        });
      } else {
        // Execution failed - retry with exponential backoff
        throw new Error(result.error || 'Execution failed');
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const currentRetry = job.attemptsMade;
      
      console.error(`❌ [${orderId}] Attempt ${currentRetry} failed: ${errorMessage}`);
      
      // Increment retry count in database
      const retryCount = await this.db.incrementRetryCount(orderId);
      
      if (currentRetry >= maxRetries) {
        // Max retries reached - mark as failed
        console.error(`💀 [${orderId}] Max retries (${maxRetries}) reached. Marking as failed.`);
        
        await this.db.updateOrderStatus(orderId, 'failed', {
          errorMessage: `Failed after ${maxRetries} attempts: ${errorMessage}`,
          retryCount
        });
        
        await this.publishStatus(orderId, 'failed', {
          error: errorMessage
        });
      } else {
        // Will retry with exponential backoff
        const delay = Math.pow(2, currentRetry) * 1000; // 2^n seconds
        console.log(`🔄 [${orderId}] Will retry in ${delay / 1000}s (attempt ${currentRetry + 1}/${maxRetries})`);
        throw error; // Let BullMQ handle the retry
      }
    }
  }
  
  /**
   * Publish status update to Redis pub/sub
   * WebSocket server subscribes to these updates
   */
  private async publishStatus(orderId: string, status: any, data?: any): Promise<void> {
    const update: StatusUpdate = {
      orderId,
      status,
      timestamp: new Date().toISOString(),
      data
    };
    
    await this.redis.publish(`order:${orderId}`, JSON.stringify(update));
  }
  
  /**
   * Close worker and connections
   */
  async close(): Promise<void> {
    await this.worker.close();
    await this.redis.quit();
    console.log('Queue worker closed');
  }
}

export default QueueWorker;