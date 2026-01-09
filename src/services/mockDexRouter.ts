// Mock DEX Router implementation
import { RouterResponse } from '../types';

export class MockDexRouter {
  async getAmountsOut(amountIn: string, path: string[]): Promise<string[]> {
    // Mock implementation
    return [amountIn];
  }

  async swapExactTokensForTokens(
    amountIn: string,
    minAmountOut: string,
    path: string[],
    to: string
  ): Promise<string> {
    // Mock implementation
    return '0x' + '0'.repeat(64);
  }
}

export const mockDexRouter = new MockDexRouter();
