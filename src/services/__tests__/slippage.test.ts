import DatabaseService from '../database';
import QueueWorker from '../queueWorker';
import { CreateOrderRequest, DexQuote, RoutingDecision, ExecutionResult, DexType } from '../../types';

// Stub DexRouter to control execution result
class StubDexRouter {
  async getBestRoute(tokenIn: string, tokenOut: string, amountIn: number): Promise<RoutingDecision> {
    const quote: DexQuote = {
      dex: 'raydium' as DexType,
      price: 100,
      amountOut: amountIn * 100 * (1 - 0.003),
      fee: 0.003
    };

    return {
      selectedDex: 'raydium' as DexType,
      selectedQuote: quote,
      raydiumQuote: quote,
      meteoraQuote: quote,
      reason: 'stub'
    };
  }

  // This executeSwap returns amountOut below the minimum (simulate slippage)
  async executeSwap(dex: DexType, orderData: CreateOrderRequest, quote: DexQuote): Promise<ExecutionResult> {
    return {
      success: true,
      txHash: 'stubtx',
      executedPrice: 95, // intentionally low
      amountOut: quote.amountOut * 0.95
    };
  }
}

describe('Slippage enforcement', () => {
  let db: DatabaseService;
  let worker: QueueWorker;
  const oldMaxRetry = process.env.MAX_RETRY_ATTEMPTS;

  beforeAll(async () => {
    process.env.MAX_RETRY_ATTEMPTS = '1'; // fail fast for test
    db = new DatabaseService();
    await db.initialize();
    worker = new QueueWorker(db, new (StubDexRouter as any)());
  });

  afterAll(async () => {
    process.env.MAX_RETRY_ATTEMPTS = oldMaxRetry;
    await worker.close();
    await db.close();
  });

  it('should mark order failed when slippage exceeds tolerance', async () => {
    const orderId = `SLIP-${Date.now()}`;
    const orderData: CreateOrderRequest = {
      orderType: 'market',
      tokenIn: 'SOL',
      tokenOut: 'USDC',
      amountIn: 1,
      slippage: 0.01
    };

    await db.createOrder(orderId, orderData);
    worker.enqueue(orderId, orderData);

    // wait for status to become failed
    const start = Date.now();
    let order = null;
    while (Date.now() - start < 10000) {
      order = await db.getOrder(orderId);
      if (order && order.status === 'failed') break;
      await new Promise((r) => setTimeout(r, 200));
    }

    expect(order).not.toBeNull();
    expect(order?.status).toBe('failed');
    expect(order?.errorMessage).toMatch(/Slippage tolerance exceeded/);
  });

  it('should fallback to the other DEX when selected DEX has excessive slippage', async () => {
    // Stub router: selected is raydium which returns low execution; meteora returns acceptable execution
    class FallbackStub {
      async getBestRoute(tokenIn: string, tokenOut: string, amountIn: number) {
        const quote = {
          dex: 'raydium',
          price: 100,
          amountOut: amountIn * 100 * (1 - 0.003),
          fee: 0.003
        } as any;

        // Return raydium as selected but keep meteora quote the same (other dex available)
        return {
          selectedDex: 'raydium',
          selectedQuote: quote,
          raydiumQuote: quote,
          meteoraQuote: quote,
          reason: 'stub'
        } as any;
      }

      async executeSwap(dex: any, orderData: CreateOrderRequest, quote: any) {
        if (dex === 'raydium') {
          return { success: true, txHash: 'badtx', executedPrice: 95, amountOut: quote.amountOut * 0.95 };
        }
        // meteora succeeds with minor slippage
        return { success: true, txHash: 'goodtx', executedPrice: 99.9, amountOut: quote.amountOut * 0.995 };
      }
    }

    const orderId = `FALL-${Date.now()}`;
    const orderData: CreateOrderRequest = {
      orderType: 'market',
      tokenIn: 'SOL',
      tokenOut: 'USDC',
      amountIn: 1,
      slippage: 0.01
    };

    // Create a new worker with the stub router
    const workerWithFallback = new QueueWorker(db, new (FallbackStub as any)());

    await db.createOrder(orderId, orderData);
    workerWithFallback.enqueue(orderId, orderData);

    // wait for confirmed
    const start = Date.now();
    let order = null;
    while (Date.now() - start < 10000) {
      order = await db.getOrder(orderId);
      if (order && order.status === 'confirmed') break;
      await new Promise((r) => setTimeout(r, 200));
    }

    expect(order).not.toBeNull();
    expect(order?.status).toBe('confirmed');
    expect(order?.txHash).toBe('goodtx');

    await workerWithFallback.close();
  });
});