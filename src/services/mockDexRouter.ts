import { DexQuote, DexType, RoutingDecision, ExecutionResult, CreateOrderRequest } from '../types';

/**
 * MockDexRouter - Simulates DEX price comparison and execution
 * 
 * In production, this would use actual Raydium and Meteora SDKs
 * For now, we simulate realistic price variations and delays
 */
export class MockDexRouter {
  // Base prices for common token pairs (SOL/USDC as example)
  private basePrice = 100; // 1 SOL = 100 USDC
  
  /**
   * Get quote from Raydium
   * Simulates network delay and returns price with variance
   */
  async getRaydiumQuote(tokenIn: string, tokenOut: string, amountIn: number): Promise<DexQuote> {
    // Simulate network latency
    await this.sleep(150 + Math.random() * 100);
    
    // Calculate price with 2-4% variance from base
    const priceVariance = 0.98 + Math.random() * 0.04;
    const price = this.basePrice * priceVariance;
    
    // Raydium typically has 0.3% fee
    const fee = 0.003;
    const amountOut = (amountIn * price) * (1 - fee);
    
    return {
      dex: 'raydium',
      price,
      amountOut,
      fee,
      estimatedGas: 5000
    };
  }
  
  /**
   * Get quote from Meteora
   * Meteora often has slightly better prices but varies
   */
  async getMeteorQuote(tokenIn: string, tokenOut: string, amountIn: number): Promise<DexQuote> {
    await this.sleep(150 + Math.random() * 100);
    
    // Meteora price variance 1-5% from base
    const priceVariance = 0.97 + Math.random() * 0.05;
    const price = this.basePrice * priceVariance;
    
    // Meteora typically has 0.2% fee (lower than Raydium)
    const fee = 0.002;
    const amountOut = (amountIn * price) * (1 - fee);
    
    return {
      dex: 'meteora',
      price,
      amountOut,
      fee,
      estimatedGas: 4500
    };
  }
  
  /**
   * Compare both DEXs and select the best one
   * Best = highest amountOut (more tokens for your money)
   */
  async getBestRoute(tokenIn: string, tokenOut: string, amountIn: number): Promise<RoutingDecision> {
    // Get quotes from both DEXs in parallel
    const [raydiumQuote, meteoraQuote] = await Promise.all([
      this.getRaydiumQuote(tokenIn, tokenOut, amountIn),
      this.getMeteorQuote(tokenIn, tokenOut, amountIn)
    ]);
    
    // Compare which gives more output tokens
    const selectedDex: DexType = raydiumQuote.amountOut > meteoraQuote.amountOut ? 'raydium' : 'meteora';
    const selectedQuote = selectedDex === 'raydium' ? raydiumQuote : meteoraQuote;
    
    const priceDiff = Math.abs(raydiumQuote.price - meteoraQuote.price);
    const betterBy = Math.abs(raydiumQuote.amountOut - meteoraQuote.amountOut);
    
    const reason = `${selectedDex} selected: better output by ${betterBy.toFixed(4)} tokens (price diff: ${priceDiff.toFixed(4)})`;
    
    return {
      selectedDex,
      selectedQuote,
      raydiumQuote,
      meteoraQuote,
      reason
    };
  }
  
  /**
   * Execute the swap on selected DEX
   * Simulates transaction creation, submission, and confirmation
   */
  async executeSwap(dex: DexType, orderData: CreateOrderRequest, quote: DexQuote): Promise<ExecutionResult> {
    try {
      // Simulate transaction building delay
      await this.sleep(500 + Math.random() * 500);
      
      // Simulate transaction submission and confirmation (2-3 seconds)
      await this.sleep(2000 + Math.random() * 1000);
      
      // 95% success rate (simulate occasional failures)
      if (Math.random() < 0.95) {
        return {
          success: true,
          txHash: this.generateMockTxHash(),
          executedPrice: quote.price,
          amountOut: quote.amountOut
        };
      } else {
        // Simulate failure scenarios
        const errors = [
          'Slippage tolerance exceeded',
          'Insufficient liquidity',
          'Transaction timeout',
          'RPC node error'
        ];
        return {
          success: false,
          error: errors[Math.floor(Math.random() * errors.length)]
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during swap execution'
      };
    }
  }
  
  /**
   * Generate realistic-looking transaction hash
   * Format matches Solana transaction signatures
   */
  private generateMockTxHash(): string {
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let hash = '';
    for (let i = 0; i < 88; i++) {
      hash += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return hash;
  }
  
  /**
   * Sleep utility for simulating delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default MockDexRouter;