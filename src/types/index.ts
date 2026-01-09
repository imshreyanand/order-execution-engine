// Type definitions for order execution engine
export interface Order {
  id: string;
  userId: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  minAmountOut: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

export interface ExecutionResult {
  orderId: string;
  amountOut: string;
  transactionHash: string;
  success: boolean;
  error?: string;
}

export interface RouterResponse {
  path: string[];
  amount: string;
}
