import { Queue } from 'bullmq';
import DatabaseService from '../services/database';
import { CreateOrderRequest, OrderJob } from '../types';

// Mock Redis connection for tests
const mockRedisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379')
};

describe('Integration Tests', () => {
  let db: DatabaseService;
  let queue: Queue<OrderJob>;
  
  beforeAll(async () => {
    db = new DatabaseService();
    await db.initialize();
    
    queue = new Queue<OrderJob>('order-execution-test', {
      connection: mockRedisConnection
    });
  });
  
  afterAll(async () => {
    await queue.close();
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
    it('should add job to queue', async () => {
      const orderId = `TEST-QUEUE-${Date.now()}`;
      const orderData: CreateOrderRequest = {
        orderType: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 1
      };
      
      const job = await queue.add(
        `order-${orderId}`,
        { orderId, orderData }
      );
      
      expect(job.id).toBeDefined();
      expect(job.data.orderId).toBe(orderId);
    });
    
    it('should configure job with retry settings', async () => {
      const orderId = `TEST-RETRY-${Date.now()}`;
      const orderData: CreateOrderRequest = {
        orderType: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 1
      };
      
      const job = await queue.add(
        `order-${orderId}`,
        { orderId, orderData },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000
          }
        }
      );
      
      expect(job.opts.attempts).toBe(3);
      expect(job.opts.backoff).toEqual({
        type: 'exponential',
        delay: 1000
      });
    });
    
    it('should handle multiple concurrent jobs', async () => {
      const jobs = [];
      
      for (let i = 0; i < 5; i++) {
        const job = queue.add(
          `concurrent-${Date.now()}-${i}`,
          {
            orderId: `CONCURRENT-${i}`,
            orderData: {
              orderType: 'market',
              tokenIn: 'SOL',
              tokenOut: 'USDC',
              amountIn: 1
            }
          }
        );
        jobs.push(job);
      }
      
      const results = await Promise.all(jobs);
      expect(results.length).toBe(5);
      
      // All jobs should have unique IDs
      const ids = results.map(j => j.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(5);
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