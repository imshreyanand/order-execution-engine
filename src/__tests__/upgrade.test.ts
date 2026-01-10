import OrderExecutionServer from '../server';
import http from 'http';

jest.setTimeout(20000);

describe('POST->WebSocket upgrade', () => {
  let server: OrderExecutionServer;
  let port = 3001;

  beforeAll(async () => {
    server = new OrderExecutionServer();
    await server.initialize();
    await server.start(port);
  });

  afterAll(async () => {
    await server.stop();
  });

  it('accepts WebSocket upgrade on POST /api/orders/execute and sends pending update', async () => {
    const orderData = JSON.stringify({ orderType: 'market', tokenIn: 'SOL', tokenOut: 'USDC', amountIn: 1, slippage: 0.01 });

    const options = {
      hostname: 'localhost',
      port,
      path: '/api/orders/execute',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Connection': 'Upgrade',
        'Upgrade': 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': Buffer.from(Math.random().toString()).toString('base64')
      }
    } as any;

    const gotPending = new Promise<void>((resolve, reject) => {
      const req = http.request(options as any);

      req.on('upgrade', (res, socket, head) => {
        let buffer = '';
        socket.on('data', (chunk) => {
          buffer += chunk.toString();
          const jsonMatch = buffer.match(/\{.*\}/);
          if (jsonMatch) {
            try {
              const msg = JSON.parse(jsonMatch[0]);
              if (msg.status === 'pending' || (msg.success && msg.message && msg.message.includes('Subscribed to order'))) {
                resolve();
                socket.destroy();
              }
            } catch (e) {
              // ignore
            }
          }
        });

        socket.on('end', () => reject(new Error('Socket ended before pending message')));
        socket.on('error', (err) => reject(err));
      });

      req.on('error', (err) => reject(err));

      // Write body and end
      req.write(orderData);
      req.end();
    });

    await expect(gotPending).resolves.toBeUndefined();
  });
});