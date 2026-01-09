// Unit tests for mockDexRouter
import { mockDexRouter } from '../mockDexRouter';

describe('MockDexRouter', () => {
  describe('getAmountsOut', () => {
    it('should return amounts out for valid inputs', async () => {
      const amountIn = '1000000000000000000';
      const path = ['0xToken1', '0xToken2'];
      
      const result = await mockDexRouter.getAmountsOut(amountIn, path);
      
      expect(result).toHaveLength(2);
    });
  });

  describe('swapExactTokensForTokens', () => {
    it('should execute swap and return transaction hash', async () => {
      const amountIn = '1000000000000000000';
      const minAmountOut = '900000000000000000';
      const path = ['0xToken1', '0xToken2'];
      const to = '0xUserAddress';
      
      const result = await mockDexRouter.swapExactTokensForTokens(
        amountIn,
        minAmountOut,
        path,
        to
      );
      
      expect(result).toMatch(/^0x/);
    });
  });
});
