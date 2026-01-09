// Order Types and Interfaces

export type OrderType = 'market' | 'limit' | 'sniper';
export type OrderStatus = 'pending' | 'routing' | 'building' | 'submitted' | 'confirmed' | 'failed';
export type DexType = 'raydium' | 'meteora';

// Incoming order from user
export interface CreateOrderRequest {
  orderType: OrderType;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  slippage?: number; // Optional, defaults to 0.01 (1%)
}

// Order stored in database
export interface Order {
  id: string;
  orderId: string;
  orderType: OrderType;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  amountOut?: number;
  status: OrderStatus;
  selectedDex?: DexType;
  raydiumPrice?: number;
  meteoraPrice?: number;
  executedPrice?: number;
  txHash?: string;
  slippage: number;
  errorMessage?: string;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
  confirmedAt?: Date;
}

// DEX Quote Response
export interface DexQuote {
  dex: DexType;
  price: number; // Price per token
  amountOut: number; // How many output tokens you'll get
  fee: number; // DEX fee percentage
  estimatedGas?: number;
}

// Comparison result
export interface RoutingDecision {
  selectedDex: DexType;
  selectedQuote: DexQuote;
  raydiumQuote: DexQuote;
  meteoraQuote: DexQuote;
  reason: string; // Why this DEX was chosen
}

// WebSocket status update
export interface StatusUpdate {
  orderId: string;
  status: OrderStatus;
  timestamp: string;
  data?: {
    selectedDex?: DexType;
    raydiumPrice?: number;
    meteoraPrice?: number;
    txHash?: string;
    executedPrice?: number;
    amountOut?: number;
    error?: string;
  };
}

// Transaction result
export interface ExecutionResult {
  success: boolean;
  txHash?: string;
  executedPrice?: number;
  amountOut?: number;
  error?: string;
}

// Job data for background worker
export interface OrderJob {
  orderId: string;
  orderData: CreateOrderRequest;
}