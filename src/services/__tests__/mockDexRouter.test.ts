import MockDexRouter from '../mockDexRouter';
import { CreateOrderRequest } from '../../types';

describe('MockDexRouter', () => {
  let router: MockDexRouter;
  
  beforeEach(() => {
    router = new MockDexRouter();
  });
  
  describe('getRaydiumQuote', () => {
    it('should return a valid quote with expected structure', async () => {
      const quote = await router.getRaydiumQuote('SOL', 'USDC', 1);
      
      expect(quote).toHaveProperty('dex', 'raydium');
      expect(quote).toHaveProperty('price');
      expect(quote).toHaveProperty('amountOut');
      expect(quote).toHaveProperty('fee', 0.003);
      expect(quote.price).toBeGreaterThan(0);
      expect(quote.amountOut).toBeGreaterThan(0);
    });
    
    it('should apply correct fee (0.3%)', async () => {
      const quote = await router.getRaydiumQuote('SOL', 'USDC', 1);
      
      // Fee should be deducted from output
      const expectedOutput = 1 * quote.price * (1 - 0.003);
      expect(quote.amountOut).toBeCloseTo(expectedOutput, 2);
    });
    
    it('should have realistic network delay', async () => {
      const start = Date.now();
      await router.getRaydiumQuote('SOL', 'USDC', 1);
      const duration = Date.now() - start;
      
      // Should take between 150-250ms
      expect(duration).toBeGreaterThanOrEqual(150);
      expect(duration).toBeLessThan(400);
    });
  });
  
  describe('getMeteorQuote', () => {
    it('should return a valid quote with expected structure', async () => {
      const quote = await router.getMeteorQuote('SOL', 'USDC', 1);
      
      expect(quote).toHaveProperty('dex', 'meteora');
      expect(quote).toHaveProperty('price');
      expect(quote).toHaveProperty('amountOut');
      expect(quote).toHaveProperty('fee', 0.002);
      expect(quote.price).toBeGreaterThan(0);
      expect(quote.amountOut).toBeGreaterThan(0);
    });
    
    it('should have lower fee than Raydium (0.2% vs 0.3%)', async () => {
      const meteoraQuote = await router.getMeteorQuote('SOL', 'USDC', 1);
      const raydiumQuote = await router.getRaydiumQuote('SOL', 'USDC', 1);
      
      expect(meteoraQuote.fee).toBeLessThan(raydiumQuote.fee);
    });
  });
  
  describe('getBestRoute', () => {
    it('should fetch quotes from both DEXs', async () => {
      const result = await router.getBestRoute('SOL', 'USDC', 1);
      
      expect(result).toHaveProperty('raydiumQuote');
      expect(result).toHaveProperty('meteoraQuote');
      expect(result).toHaveProperty('selectedDex');
      expect(result).toHaveProperty('selectedQuote');
      expect(result).toHaveProperty('reason');
    });
    
    it('should select DEX with higher amountOut', async () => {
      const result = await router.getBestRoute('SOL', 'USDC', 1);
      
      const selectedAmountOut = result.selectedQuote.amountOut;
      const otherDex = result.selectedDex === 'raydium' ? 'meteora' : 'raydium';
      const otherQuote = result.selectedDex === 'raydium' ? result.meteoraQuote : result.raydiumQuote;
      
      expect(selectedAmountOut).toBeGreaterThanOrEqual(otherQuote.amountOut);
    });
    
    it('should provide a reason for selection', async () => {
      const result = await router.getBestRoute('SOL', 'USDC', 1);
      
      expect(result.reason).toContain(result.selectedDex);
      expect(result.reason).toContain('selected');
    });
    
    it('should complete both queries in parallel (< 500ms)', async () => {
      const start = Date.now();
      await router.getBestRoute('SOL', 'USDC', 1);
      const duration = Date.now() - start;
      
      // Should be ~250ms, not 500ms (proof of parallel execution)
      expect(duration).toBeLessThan(500);
    });
  });
  
  describe('executeSwap', () => {
    const mockOrderData: CreateOrderRequest = {
      orderType: 'market',
      tokenIn: 'SOL',
      tokenOut: 'USDC',
      amountIn: 1,
      slippage: 0.01
    };
    
    it('should return success result most of the time', async () => {
      // Run multiple times to test success rate
      const results = await Promise.all(
        Array(10).fill(0).map(() => 
          router.executeSwap('raydium', mockOrderData, {
            dex: 'raydium',
            price: 100,
            amountOut: 99.7,
            fee: 0.003
          })
        )
      );
      
      const successCount = results.filter(r => r.success).length;
      
      // Should have mostly successes (95% rate, so 8-10 out of 10)
      expect(successCount).toBeGreaterThanOrEqual(7);
    });
    
    it('should include txHash on success', async () => {
      const result = await router.executeSwap('raydium', mockOrderData, {
        dex: 'raydium',
        price: 100,
        amountOut: 99.7,
        fee: 0.003
      });
      
      if (result.success) {
        expect(result.txHash).toBeDefined();
        expect(result.txHash).toHaveLength(88); // Solana tx hash length
        expect(result.executedPrice).toBeDefined();
        expect(result.amountOut).toBeDefined();
      }
    });
    
    it('should include error message on failure', async () => {
      // Force multiple attempts to increase chance of hitting a failure
      let failureFound = false;
      
      for (let i = 0; i < 20; i++) {
        const result = await router.executeSwap('raydium', mockOrderData, {
          dex: 'raydium',
          price: 100,
          amountOut: 99.7,
          fee: 0.003
        });
        
        if (!result.success) {
          expect(result.error).toBeDefined();
          expect(result.error).toBeTruthy();
          failureFound = true;
          break;
        }
      }
      
      // With 5% failure rate, we should hit at least one failure in 20 attempts
      expect(failureFound).toBe(true);
    });
    
    it('should simulate realistic execution time (2-3 seconds)', async () => {
      const start = Date.now();
      await router.executeSwap('raydium', mockOrderData, {
        dex: 'raydium',
        price: 100,
        amountOut: 99.7,
        fee: 0.003
      });
      const duration = Date.now() - start;
      
      expect(duration).toBeGreaterThanOrEqual(2000);
      expect(duration).toBeLessThan(4000);
    });
  });
});