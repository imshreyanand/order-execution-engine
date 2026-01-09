import DatabaseService from '../services/database';
import { CreateOrderRequest } from '../types';
import QueueWorker from '../services/queueWorker';

describe('Integration Tests', () => {
  let db: DatabaseService;
  let worker: QueueWorker;
  
  beforeAll(async () => {
    db = new DatabaseService();
    await db.initialize();
    
    worker = new QueueWorker(db);
  });
  
  afterAll(async () => {
    await worker.close();
    await db.close();
  });
  
  describe('Database Operations', () => {
    it('should create and retrieve an order', async () => {
      const orderId = `TEST-${Date.now()}`;
      const orderData: CreateOrderRequest = {
        orderType: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 1.5,
        slippage: 0.01
      };
      
      await db.createOrder(orderId, orderData);
      const retrieved = await db.getOrder(orderId);
      
      expect(retrieved).not.toBeNull();
      expect(retrieved?.orderId).toBe(orderId);
      expect(retrieved?.tokenIn).toBe('SOL');
      expect(retrieved?.tokenOut).toBe('USDC');
      expect(retrieved?.amountIn).toBe(1.5);
      expect(retrieved?.status).toBe('pending');
    });
    
    it('should update order status with additional data', async () => {
      const orderId = `TEST-${Date.now()}`;
      const orderData: CreateOrderRequest = {
        orderType: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 1,
        slippage: 0.01
      };
      
      await db.createOrder(orderId, orderData);
      
      await db.updateOrderStatus(orderId, 'routing', {
        selectedDex: 'raydium',
        raydiumPrice: 100.5,
        meteoraPrice: 99.8
      });
      
      const order = await db.getOrder(orderId);
      
      expect(order?.status).toBe('routing');
      expect(order?.selectedDex).toBe('raydium');
      expect(order?.raydiumPrice).toBe(100.5);
      expect(order?.meteoraPrice).toBe(99.8);
    });
    
    it('should increment retry count', async () => {
      const orderId = `TEST-${Date.now()}`;
      const orderData: CreateOrderRequest = {
        orderType: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 1
      };
      
      await db.createOrder(orderId, orderData);
      
      const count1 = await db.incrementRetryCount(orderId);
      expect(count1).toBe(1);
      
      const count2 = await db.incrementRetryCount(orderId);
      expect(count2).toBe(2);
      
      const order = await db.getOrder(orderId);
      expect(order?.retryCount).toBe(2);
    });
    
    it('should list orders with pagination', async () => {
      // Create multiple test orders
      for (let i = 0; i < 5; i++) {
        await db.createOrder(`TEST-PAGINATION-${Date.now()}-${i}`, {
          orderType: 'market',
          tokenIn: 'SOL',
          tokenOut: 'USDC',
          amountIn: 1
        });
      }
      
      const orders = await db.getOrders(3, 0);
      expect(orders.length).toBeGreaterThanOrEqual(3);
      
      // Should be ordered by created_at DESC
      for (let i = 1; i < orders.length; i++) {
        expect(orders[i].createdAt.getTime()).toBeLessThanOrEqual(
          orders[i - 1].createdAt.getTime()
        );
      }
    });
  });
  
  describe('Queue Operations', () => {
    const waitForStatus = async (orderId: string, timeout = 10000) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const order = await db.getOrder(orderId);
        if (order && order.status !== 'pending') return order;
        await new Promise((r) => setTimeout(r, 200));
      }
      throw new Error('Timeout waiting for order status change');
    };

    it('should enqueue and process a job', async () => {
      const orderId = `TEST-QUEUE-${Date.now()}`;
      const orderData: CreateOrderRequest = {
        orderType: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 1
      };

      await db.createOrder(orderId, orderData);
      worker.enqueue(orderId, orderData);

      const processed = await waitForStatus(orderId, 15000);
      expect(['confirmed', 'failed', 'submitted']).toContain(processed.status);
    });

    it('should handle multiple concurrent jobs', async () => {
      const orderIds: string[] = [];

      for (let i = 0; i < 5; i++) {
        const orderId = `CONCURRENT-${Date.now()}-${i}`;
        orderIds.push(orderId);
        await db.createOrder(orderId, {
          orderType: 'market',
          tokenIn: 'SOL',
          tokenOut: 'USDC',
          amountIn: 1
        });
        worker.enqueue(orderId, {
          orderType: 'market',
          tokenIn: 'SOL',
          tokenOut: 'USDC',
          amountIn: 1
        });
      }

      // Wait for all to be processed
      const results = await Promise.all(orderIds.map(id => waitForStatus(id, 20000)));
      results.forEach(r => expect(r.status).not.toBe('pending'));
    });
  });
  
  describe('End-to-End Order Flow', () => {
    it('should complete full order lifecycle', async () => {
      const orderId = `E2E-${Date.now()}`;
      const orderData: CreateOrderRequest = {
        orderType: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 2.5,
        slippage: 0.01
      };
      
      // Step 1: Create order
      await db.createOrder(orderId, orderData);
      let order = await db.getOrder(orderId);
      expect(order?.status).toBe('pending');
      
      // Step 2: Routing
      await db.updateOrderStatus(orderId, 'routing', {
        selectedDex: 'meteora',
        raydiumPrice: 100.2,
        meteoraPrice: 101.5
      });
      order = await db.getOrder(orderId);
      expect(order?.status).toBe('routing');
      expect(order?.selectedDex).toBe('meteora');
      
      // Step 3: Building
      await db.updateOrderStatus(orderId, 'building');
      order = await db.getOrder(orderId);
      expect(order?.status).toBe('building');
      
      // Step 4: Submitted
      await db.updateOrderStatus(orderId, 'submitted');
      order = await db.getOrder(orderId);
      expect(order?.status).toBe('submitted');
      
      // Step 5: Confirmed
      await db.updateOrderStatus(orderId, 'confirmed', {
        txHash: '5' + 'x'.repeat(87), // Mock tx hash
        executedPrice: 101.5,
        amountOut: 253.75
      });
      order = await db.getOrder(orderId);
      expect(order?.status).toBe('confirmed');
      expect(order?.txHash).toBeDefined();
      expect(order?.executedPrice).toBe(101.5);
      expect(order?.confirmedAt).toBeDefined();
    }, 10000);
  });
});