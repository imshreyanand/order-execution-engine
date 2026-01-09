import { Pool, QueryResult } from 'pg';
import { Order, OrderStatus, CreateOrderRequest } from '../types';

/**
 * Database service for PostgreSQL operations
 * Handles all order CRUD operations
 */
export class DatabaseService {
  private pool: Pool;
  
  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (connectionString) {
      // Use DATABASE_URL when provided (works with Supabase/hosted providers)
      this.pool = new Pool({
        connectionString,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });
    } else {
      this.pool = new Pool({
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        user: process.env.POSTGRES_USER || 'user',
        password: process.env.POSTGRES_PASSWORD || 'password',
        database: process.env.POSTGRES_DB || 'order_engine',
        max: 20, // Maximum connections in pool
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });
    }
  }
  
  /**
   * Initialize database connection
   * Tests connection and creates tables if needed
   */
  async initialize(): Promise<void> {
    try {
      const client = await this.pool.connect();
      console.log('✅ Database connected successfully');
      client.release();
    } catch (error) {
      const isDev = process.env.NODE_ENV !== 'production';
      if (isDev) {
        console.warn('⚠️  Database connection failed (running in development mode without database)');
        console.warn('   To enable database features, start PostgreSQL and set POSTGRES_HOST, POSTGRES_USER, etc.');
        return;
      }
      console.error('❌ Database connection failed:', error);
      throw error;
    }
  }
  
  /**
   * Create new order record
   */
  async createOrder(orderId: string, orderData: CreateOrderRequest): Promise<Order> {
    const query = `
      INSERT INTO orders (
        order_id, order_type, token_in, token_out, 
        amount_in, status, slippage, retry_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    
    const values = [
      orderId,
      orderData.orderType,
      orderData.tokenIn,
      orderData.tokenOut,
      orderData.amountIn,
      'pending',
      orderData.slippage || 0.01,
      0
    ];
    
    const result: QueryResult = await this.pool.query(query, values);
    return this.mapRowToOrder(result.rows[0]);
  }
  
  /**
   * Update order status
   */
  async updateOrderStatus(orderId: string, status: OrderStatus, additionalData?: Partial<Order>): Promise<void> {
    let query = 'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP';
    const values: any[] = [status];
    let paramIndex = 2;
    
    // Add optional fields if provided
    if (additionalData?.selectedDex) {
      query += `, selected_dex = $${paramIndex}`;
      values.push(additionalData.selectedDex);
      paramIndex++;
    }
    
    if (additionalData?.raydiumPrice !== undefined) {
      query += `, raydium_price = $${paramIndex}`;
      values.push(additionalData.raydiumPrice);
      paramIndex++;
    }
    
    if (additionalData?.meteoraPrice !== undefined) {
      query += `, meteora_price = $${paramIndex}`;
      values.push(additionalData.meteoraPrice);
      paramIndex++;
    }
    
    if (additionalData?.executedPrice !== undefined) {
      query += `, executed_price = $${paramIndex}`;
      values.push(additionalData.executedPrice);
      paramIndex++;
    }
    
    if (additionalData?.amountOut !== undefined) {
      query += `, amount_out = $${paramIndex}`;
      values.push(additionalData.amountOut);
      paramIndex++;
    }
    
    if (additionalData?.txHash) {
      query += `, tx_hash = $${paramIndex}`;
      values.push(additionalData.txHash);
      paramIndex++;
    }
    
    if (additionalData?.errorMessage) {
      query += `, error_message = $${paramIndex}`;
      values.push(additionalData.errorMessage);
      paramIndex++;
    }
    
    if (additionalData?.retryCount !== undefined) {
      query += `, retry_count = $${paramIndex}`;
      values.push(additionalData.retryCount);
      paramIndex++;
    }
    
    if (status === 'confirmed') {
      query += `, confirmed_at = CURRENT_TIMESTAMP`;
    }
    
    query += ` WHERE order_id = $${paramIndex}`;
    values.push(orderId);
    
    await this.pool.query(query, values);
  }
  
  /**
   * Get order by ID
   */
  async getOrder(orderId: string): Promise<Order | null> {
    const query = 'SELECT * FROM orders WHERE order_id = $1';
    const result: QueryResult = await this.pool.query(query, [orderId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToOrder(result.rows[0]);
  }
  
  /**
   * Get all orders with pagination
   */
  async getOrders(limit: number = 50, offset: number = 0): Promise<Order[]> {
    const query = 'SELECT * FROM orders ORDER BY created_at DESC LIMIT $1 OFFSET $2';
    const result: QueryResult = await this.pool.query(query, [limit, offset]);
    
    return result.rows.map(row => this.mapRowToOrder(row));
  }
  
  /**
   * Increment retry count
   */
  async incrementRetryCount(orderId: string): Promise<number> {
    const query = `
      UPDATE orders 
      SET retry_count = retry_count + 1 
      WHERE order_id = $1 
      RETURNING retry_count
    `;
    const result: QueryResult = await this.pool.query(query, [orderId]);
    return result.rows[0].retry_count;
  }
  
  /**
   * Map database row to Order object
   */
  private mapRowToOrder(row: any): Order {
    return {
      id: row.id,
      orderId: row.order_id,
      orderType: row.order_type,
      tokenIn: row.token_in,
      tokenOut: row.token_out,
      amountIn: parseFloat(row.amount_in),
      amountOut: row.amount_out ? parseFloat(row.amount_out) : undefined,
      status: row.status,
      selectedDex: row.selected_dex,
      raydiumPrice: row.raydium_price ? parseFloat(row.raydium_price) : undefined,
      meteoraPrice: row.meteora_price ? parseFloat(row.meteora_price) : undefined,
      executedPrice: row.executed_price ? parseFloat(row.executed_price) : undefined,
      txHash: row.tx_hash,
      slippage: parseFloat(row.slippage),
      errorMessage: row.error_message,
      retryCount: row.retry_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      confirmedAt: row.confirmed_at
    };
  }
  
  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.pool.end();
    console.log('Database connection closed');
  }
}

export default DatabaseService;