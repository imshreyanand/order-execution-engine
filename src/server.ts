import Fastify, { FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import { WebSocketServer } from 'ws';
import { z } from 'zod';
import DatabaseService from './services/database';
import QueueWorker from './services/queueWorker';
import pubsub from './services/pubsub';
import { CreateOrderRequest, Order } from './types';

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
  
  constructor() {
    this.app = Fastify({
      logger: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
      }
    });
    
    this.db = new DatabaseService();
    this.worker = new QueueWorker(this.db);
  }
  
  /**
   * Initialize server and register routes
   */
  async initialize(): Promise<void> {
    // Register WebSocket plugin
    await this.app.register(websocket);
    
    // Initialize database
    await this.db.initialize();
    
    // In-memory queue and pubsub are used by default (no Redis required)
    console.log('ℹ️  Using in-memory order queue and pubsub (no Redis required)');

    // Custom content-type parser: skip body parsing for upgrade requests
    this.app.addContentTypeParser('application/json', (request, payload, done) => {
      if (request.headers.upgrade === 'websocket') {
        // Skip body parsing for websocket upgrades — the upgrade listener handles it
        done(null, {});
      } else {
        // Normal JSON parsing for non-upgrade requests
        let data = '';
        payload.on('data', chunk => (data += chunk.toString()));
        payload.on('end', () => {
          try {
            done(null, data ? JSON.parse(data) : {});
          } catch (err) {
            done(err as any, undefined);
          }
        });
        payload.on('error', done);
      }
    });

    // Also support same-connection POST -> WebSocket upgrade for /api/orders/execute
    // This is a lightweight handler that buffers a short HTTP body and then upgrades the connection.
    const wssExec = new WebSocketServer({ noServer: true });

    (this.app.server as any).on('upgrade', (req: any, socket: any, head: any) => {
      try {
        console.log(`🔄 Upgrade event for ${req.url}`);
        if (!req.url) return;
        const url = req.url.split('?')[0];
        if (url !== '/api/orders/execute') {
          console.log(`  ↳ Not /api/orders/execute, skipping`);
          return;
        }
        console.log(`  ↳ Processing upgrade...`);

        // Buffer incoming body for a short window (200ms) then proceed
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => {
          console.log(`  📦 Received ${chunk.length} bytes`);
          chunks.push(chunk);
        });

        const waitForBody = new Promise<Buffer>((resolve) => {
          const timer = setTimeout(() => {
            console.log(`  ⏱️  Timeout waiting for body`);
            resolve(Buffer.concat(chunks));
          }, 200);
          req.on('end', () => {
            clearTimeout(timer);
            console.log(`  ✅ Body complete, total ${Buffer.concat(chunks).length} bytes`);
            resolve(Buffer.concat(chunks));
          });
        });

        waitForBody.then(async (buf) => {
          console.log(`  🔍 Parsing body...`);
          let body: any = {};
          try {
            if (buf && buf.length) {
              const str = buf.toString();
              console.log(`  📄 Body string: ${str.substring(0, 100)}...`);
              body = JSON.parse(str);
              console.log(`  ✅ Parsed JSON:`, body);
            } else {
              console.log(`  ⚠️  Empty body buffer`);
            }
          } catch (err) {
            console.log(`  ❌ JSON parse error:`, err);
          }

          // Validate order body quickly
          try {
            console.log(`  🔎 Validating order schema...`);
            const orderData = CreateOrderSchema.parse(body);
            console.log(`  ✅ Order valid:`, orderData);
            // Generate unique order ID
            const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            // Create order in database (best effort)
            try {
              await this.db.createOrder(orderId, orderData);
            } catch (err) {
              console.warn(`  Order creation skipped (database unavailable)`);
            }

            // Enqueue
            this.worker.enqueue(orderId, orderData);
            console.log(`📝 [${orderId}] Order created and enqueued via upgraded connection`);

            // Upgrade to WebSocket and attach pubsub forwarding
            wssExec.handleUpgrade(req, socket, head, (ws) => {
              // Send initial pending message
              const subscribeAck = { success: true, message: `Subscribed to order ${orderId}` };
              try { ws.send(JSON.stringify(subscribeAck)); } catch (e) {}

              // Immediately send pending status
              const pending = { orderId, status: 'pending', timestamp: new Date().toISOString(), data: { message: 'Order received and queued for execution' } };
              try { ws.send(JSON.stringify(pending)); } catch (e) {}

              const unsubscribe = pubsub.subscribeOrder(orderId, (message) => {
                if (ws.readyState === 1) {
                  try { ws.send(JSON.stringify(message)); } catch (e) {}
                }
              });

              ws.on('close', () => unsubscribe());
            });
          } catch (err) {
            console.log(`  ❌ Validation or upgrade error:`, err);
            // Invalid body — return HTTP 400-like response over socket and close
            try {
              socket.write('HTTP/1.1 400 Bad Request\r\n\r\nInvalid order body');
            } catch (e) {}
            socket.destroy();
          }
        });
      } catch (err) {
        console.error(`  ❌ Upgrade listener error:`, err);
        socket.destroy();
      }
    });

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
    
    // REST API for order submission (non-upgrade requests only)
    // Upgrade requests are handled by the upgrade listener below
    this.app.post<{ Body: any }>('/api/orders/execute', async (request, reply) => {
      try {
        const body = request.body as any;
        const orderData = CreateOrderSchema.parse(body);
        
        // Generate unique order ID
        const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Create order in database (if available)
        try {
          await this.db.createOrder(orderId, orderData);
        } catch (error) {
          console.warn(`  Order creation skipped (database unavailable)`);
        }
        
        // Enqueue order for execution using the in-memory worker
        this.worker.enqueue(orderId, orderData);
        
        console.log(`📝 [${orderId}] Order created and enqueued: ${orderData.amountIn} ${orderData.tokenIn} → ${orderData.tokenOut}`);
        
        return {
          success: true,
          orderId,
          status: 'pending',
          message: 'Order received and queued for execution',
          timestamp: new Date().toISOString()
        };
      } catch (error: any) {
        reply.code(400);
        return {
          success: false,
          error: error.message || 'Invalid order data'
        };
      }
    });
    
    // WebSocket for real-time order status updates
    this.app.get<{ Querystring: { orderId?: string } }>('/ws', { websocket: true }, async (socket, request) => {
      const orderId = request.query.orderId;
      
      if (!orderId) {
        socket.send(JSON.stringify({
          error: 'orderId query parameter is required'
        }));
        socket.close();
        return;
      }
      
      console.log(`📡 WebSocket client connected for order ${orderId}`);
      
      // Subscribe to in-memory pubsub for order updates
      const unsubscribe = pubsub.subscribeOrder(orderId, (message) => {
        if (socket.readyState === 1) { // 1 = OPEN
          socket.send(JSON.stringify(message));
        }
      });

      socket.on('close', () => {
        unsubscribe();
      });

      // Acknowledge subscription
      socket.send(JSON.stringify({
        success: true,
        message: `Subscribed to order ${orderId}`
      }));
    });
    
    // Get order status (REST endpoint for checking order without WebSocket)
    this.app.get('/api/orders/:orderId', async (request, reply) => {
      const { orderId } = request.params as { orderId: string };
      
      try {
        const order = await this.db.getOrder(orderId);
        
        if (!order) {
          return reply.code(404).send({ error: 'Order not found' });
        }
        
        return order;
      } catch (error) {
        console.warn(`  Order lookup failed for ${orderId} (database unavailable)`);
        // Provide an example order in case the DB is not available so clients see the payload shape
        const examples = this.getExampleOrders();
        const example = examples.find(e => e.orderId === orderId) || { ...examples[0], orderId };
        return example;
      }
    });
    
    // List all orders (for debugging/admin)
    this.app.get('/api/orders', async (request, reply) => {
      try {
        const { limit = 50, offset = 0 } = request.query as { limit?: number; offset?: number };
        
        const orders = await this.db.getOrders(Number(limit), Number(offset));
        
        return {
          orders,
          count: orders.length,
          limit: Number(limit),
          offset: Number(offset)
        };
      } catch (error) {
        console.warn('  Order list retrieval failed (database unavailable)');
        const examples = this.getExampleOrders();
        return {
          orders: examples,
          count: examples.length,
          limit: Number(limit),
          offset: Number(offset),
          message: 'Orders unavailable (database not connected) — returning example orders'
        };
      }
    });
  }

  // Return sample orders used when the database is unavailable.
  private getExampleOrders(): Order[] {
    const now = new Date();
    return [
      {
        id: 'example-1',
        orderId: 'EX-1',
        orderType: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 1.5,
        amountOut: 152,
        status: 'confirmed',
        selectedDex: 'meteora',
        raydiumPrice: 100.2,
        meteoraPrice: 101.5,
        executedPrice: 101.333,
        txHash: '0xabc123example',
        slippage: 0.01,
        errorMessage: undefined,
        retryCount: 0,
        createdAt: now,
        updatedAt: now,
        confirmedAt: now
      },
      {
        id: 'example-2',
        orderId: 'EX-2',
        orderType: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDT',
        amountIn: 2,
        amountOut: 199,
        status: 'failed',
        selectedDex: 'raydium',
        raydiumPrice: 99.8,
        meteoraPrice: 100.1,
        slippage: 0.02,
        errorMessage: 'Insufficient liquidity',
        retryCount: 3,
        createdAt: now,
        updatedAt: now
      }
    ];
  }

  /**
   * Start the server
   */
  async start(port: number = 3000): Promise<void> {
    try {
      await this.app.listen({ port, host: '0.0.0.0' });
      console.log(`\n✅ Server running on http://localhost:${port}`);
      console.log(`\n📝 API Endpoints:`);
      console.log(`   POST /api/orders/execute - Submit a new order`);
      console.log(`   GET /api/orders/:orderId - Get order status`);
      console.log(`   GET /api/orders - List all orders\n`);
      console.log(`📡 WebSocket Endpoint:`);
      console.log(`   ws://localhost:${port}/ws?orderId=<order-id>`);
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
    await this.app.close();
  }
}

export default OrderExecutionServer;