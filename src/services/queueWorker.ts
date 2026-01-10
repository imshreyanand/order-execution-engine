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

  // Accept optional dexRouter for easier testing and future real implementations
  constructor(db: DatabaseService, dexRouter?: MockDexRouter) {
    this.db = db;
    this.dexRouter = dexRouter ?? new MockDexRouter();
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
        // Enforce slippage tolerance (with adaptive increase per attempt)
        const baseSlippage = job.orderData.slippage ?? 0.01;
        const effectiveSlippage = Math.min(0.2, baseSlippage * (1 + job.attempts * 0.5)); // increase 50% per attempt, cap at 20%

        const expectedAmountOut = routingDecision.selectedQuote.amountOut;
        const minAmountOut = expectedAmountOut * (1 - effectiveSlippage);

        if (typeof result.amountOut !== 'number' || result.amountOut < minAmountOut) {
          // Log details for debugging
          console.warn(`🔻 [${orderId}] Slippage check failed (dex=${routingDecision.selectedDex}) — expected=${expectedAmountOut.toFixed(6)}, min=${minAmountOut.toFixed(6)}, actual=${(result.amountOut ?? 0).toFixed(6)}, slippageAllowed=${(effectiveSlippage * 100).toFixed(2)}%`);

          // Try fallback to the other DEX once before treating as failure
          if (!(job as any).triedFallback) {
            (job as any).triedFallback = true;
            const otherQuote = routingDecision.selectedDex === 'raydium' ? routingDecision.meteoraQuote : routingDecision.raydiumQuote;
            const otherDex = otherQuote.dex;

            console.log(`🔁 [${orderId}] Attempting fallback to ${otherDex} due to slippage`);
            const fallbackResult = await this.dexRouter.executeSwap(otherDex, job.orderData, otherQuote as any);

            if (fallbackResult.success) {
              const otherExpected = otherQuote.amountOut;
              const otherMin = otherExpected * (1 - effectiveSlippage);

              if (typeof fallbackResult.amountOut === 'number' && fallbackResult.amountOut >= otherMin) {
                // Accept fallback result
                await this.db.updateOrderStatus(orderId, 'confirmed', {
                  txHash: fallbackResult.txHash,
                  executedPrice: fallbackResult.executedPrice,
                  amountOut: fallbackResult.amountOut
                });

                await this.publishStatus(orderId, 'confirmed', {
                  txHash: fallbackResult.txHash,
                  executedPrice: fallbackResult.executedPrice,
                  amountOut: fallbackResult.amountOut
                });

                console.log(`✅ [${orderId}] Completed via fallback on ${otherDex}`);
                return; // job done
              }
            }

            // If fallback didn't succeed, publish a retrying status and proceed to retry logic below
            await this.publishStatus(orderId, 'retrying', { reason: 'slippage', attemptedDex: routingDecision.selectedDex, fallbackTried: true, allowedSlippage: effectiveSlippage });
          }

          throw new Error('Slippage tolerance exceeded');
        }

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