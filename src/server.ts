import Fastify, { FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import { Queue } from 'bullmq';
import { z } from 'zod';
import DatabaseService from './services/database';
import QueueWorker from './services/queueWorker';
import Redis from 'ioredis';
import { CreateOrderRequest, OrderJob } from './types';

// Validation schema for order requests
const CreateOrderSchema = z.object({
  orderType: z.enum(['market', 'limit', 'sniper']),
  tokenIn: z.string().min(1),
  tokenOut: z.string().min(1),
  amountIn: z.number().positive(),
  slippage: z.number().min(0).max(1).optional()
});

/**
 * Fastify Server with WebSocket support
 * Handles HTTP POST for order submission and upgrades to WebSocket for status updates
 */
export class OrderExecutionServer {
  private app: FastifyInstance;
  private db: DatabaseService;
  private worker: QueueWorker;
  private queue: Queue<OrderJob>;
  private redis: Redis;
  
  constructor() {
    this.app = Fastify({
      logger: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
      }
    });
    
    this.db = new DatabaseService();
    this.worker = new QueueWorker(this.db);
    
    // Initialize BullMQ queue
    this.queue = new Queue<OrderJob>('order-execution', {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379')
      }
    });
    
    // Redis for pub/sub
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379')
    });
  }
  
  /**
   * Initialize server and register routes
   */
  async initialize(): Promise<void> {
    // Register WebSocket plugin
    await this.app.register(websocket);
    
    // Initialize database
    await this.db.initialize();
    
    // Register routes
    this.registerRoutes();
    
    console.log('✅ Server initialized successfully');
  }
  
  /**
   * Register all API routes
   */
  private registerRoutes(): void {
    // Health check endpoint
    this.app.get('/health', async (request, reply) => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    });
    
    // Main order execution endpoint - HTTP POST that upgrades to WebSocket
    this.app.post('/api/orders/execute', { websocket: true }, async (connection, request) => {
      const { socket } = connection;
      
      try {
        // Parse and validate order data from query parameters or body
        const body = request.body as any;
        const orderData = CreateOrderSchema.parse(body);
        
        // Generate unique order ID
        const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Create order in database
        await this.db.createOrder(orderId, orderData);
        
        // Send initial response with order ID
        socket.send(JSON.stringify({
          orderId,
          status: 'pending',
          message: 'Order received and queued for execution',
          timestamp: new Date().toISOString()
        }));
        
        console.log(`📝 [${orderId}] Order created: ${orderData.amountIn} ${orderData.tokenIn} → ${orderData.tokenOut}`);
        
        // Subscribe to order status updates
        const subscriber = new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379')
        });
        
        await subscriber.subscribe(`order:${orderId}`);
        
        // Forward Redis messages to WebSocket
        subscriber.on('message', (channel, message) => {
          if (socket.readyState === 1) { // 1 = OPEN
            socket.send(message);
          }
        });
        
        // Add order to queue for processing
        await this.queue.add(
          `order-${orderId}`,
          { orderId, orderData },
          {
            attempts: parseInt(process.env.MAX_RETRY_ATTEMPTS || '3'),
            backoff: {
              type: 'exponential',
              delay: 1000 // Start with 1 second, doubles each retry
            }
          }
        );
        
        // Cleanup on disconnect
        socket.on('close', async () => {
          console.log(`🔌 [${orderId}] WebSocket disconnected`);
          await subscriber.quit();
        });
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Invalid request';
        socket.send(JSON.stringify({
          error: errorMessage,
          timestamp: new Date().toISOString()
        }));
        socket.close();
      }
    });
    
    // Get order status (REST endpoint for checking order without WebSocket)
    this.app.get('/api/orders/:orderId', async (request, reply) => {
      const { orderId } = request.params as { orderId: string };
      
      const order = await this.db.getOrder(orderId);
      
      if (!order) {
        return reply.code(404).send({ error: 'Order not found' });
      }
      
      return order;
    });
    
    // List all orders (for debugging/admin)
    this.app.get('/api/orders', async (request, reply) => {
      const { limit = 50, offset = 0 } = request.query as { limit?: number; offset?: number };
      
      const orders = await this.db.getOrders(Number(limit), Number(offset));
      
      return {
        orders,
        count: orders.length,
        limit: Number(limit),
        offset: Number(offset)
      };
    });
  }
  
  /**
   * Start the server
   */
  async start(port: number = 3000): Promise<void> {
    try {
      await this.app.listen({ port, host: '0.0.0.0' });
      console.log(`🚀 Server running on http://localhost:${port}`);
      console.log(`📡 WebSocket endpoint: ws://localhost:${port}/api/orders/execute`);
    } catch (error) {
      console.error('Failed to start server:', error);
      throw error;
    }
  }
  
  /**
   * Graceful shutdown
   */
  async stop(): Promise<void> {
    console.log('Shutting down server...');
    await this.worker.close();
    await this.queue.close();
    await this.redis.quit();
    await this.db.close();
    await this.app.close();
    console.log('Server stopped');
  }
}

export default OrderExecutionServer;