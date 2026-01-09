import { OrderJob, StatusUpdate } from '../types';
import MockDexRouter from './mockDexRouter';
import DatabaseService from './database';
import { pubsub } from './pubsub';

/**
 * In-memory queue worker - replaces BullMQ/Redis
 */
export class QueueWorker {
  private queue: Array<{ orderId: string; orderData: OrderJob['orderData']; attempts: number }> = [];
  private running: Set<string> = new Set();
  private dexRouter: MockDexRouter;
  private db: DatabaseService;
  private concurrency: number;
  private maxRetries: number;

  constructor(db: DatabaseService) {
    this.db = db;
    this.dexRouter = new MockDexRouter();
    this.concurrency = parseInt(process.env.MAX_CONCURRENT_ORDERS || '10');
    this.maxRetries = parseInt(process.env.MAX_RETRY_ATTEMPTS || '3');

    // Start processing loop
    this.processLoop();
  }

  enqueue(orderId: string, orderData: OrderJob['orderData']) {
    this.queue.push({ orderId, orderData, attempts: 0 });
  }

  private async processLoop() {
    while (true) {
      try {
        if (this.running.size < this.concurrency && this.queue.length > 0) {
          const job = this.queue.shift()!;
          this.running.add(job.orderId);
          this.processJob(job).finally(() => {
            this.running.delete(job.orderId);
          });
        } else {
          // Idle wait
          await new Promise((r) => setTimeout(r, 200));
        }
      } catch (err) {
        console.error('Queue processing error:', err);
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  private async processJob(job: { orderId: string; orderData: OrderJob['orderData']; attempts: number }) {
    const { orderId, orderData } = job;

    try {
      await this.publishStatus(orderId, 'routing');
      const routingDecision = await this.dexRouter.getBestRoute(orderData.tokenIn, orderData.tokenOut, orderData.amountIn);

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

      await this.publishStatus(orderId, 'building');
      await this.db.updateOrderStatus(orderId, 'building');

      await this.publishStatus(orderId, 'submitted');
      await this.db.updateOrderStatus(orderId, 'submitted');

      const result = await this.dexRouter.executeSwap(routingDecision.selectedDex, orderData, routingDecision.selectedQuote);

      if (result.success) {
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

        console.log(`✅ [${orderId}] Completed`);
      } else {
        throw new Error(result.error || 'Execution failed');
      }
    } catch (error:any) {
      job.attempts += 1;
      console.error(`❌ [${orderId}] Attempt ${job.attempts} failed: ${error.message || error}`);

      await this.db.incrementRetryCount(orderId);

      if (job.attempts >= this.maxRetries) {
        await this.db.updateOrderStatus(orderId, 'failed', {
          errorMessage: `Failed after ${job.attempts} attempts: ${error.message || error}`,
          retryCount: job.attempts
        });

        await this.publishStatus(orderId, 'failed', { error: error.message || error });
      } else {
        const delay = Math.pow(2, job.attempts) * 1000;
        console.log(`🔄 [${orderId}] Will retry in ${delay / 1000}s`);
        setTimeout(() => this.queue.push(job), delay);
      }
    }
  }

  private async publishStatus(orderId: string, status: any, data?: any) {
    const update: StatusUpdate = { orderId, status, timestamp: new Date().toISOString(), data };
    pubsub.publishOrder(orderId, update);
  }

  async close(): Promise<void> {
    // No external connections to close in in-memory implementation
    console.log('In-memory Queue worker closed');
  }
}

export default QueueWorker;