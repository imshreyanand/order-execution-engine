/**
 * WebSocket Test Script
 * Tests the order submission and real-time status updates
 * 
 * Usage: node test-websocket.js
 */

const http = require('http');

// Order data
const orderData = {
  orderType: 'market',
  tokenIn: 'SOL',
  tokenOut: 'USDC',
  amountIn: 2.5,
  slippage: 0.01
};

// Create HTTP request that will upgrade to WebSocket
const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/orders/execute',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Connection': 'Upgrade',
    'Upgrade': 'websocket',
    'Sec-WebSocket-Version': '13',
    'Sec-WebSocket-Key': Buffer.from(Math.random().toString()).toString('base64')
  }
};

console.log('🚀 Connecting to Order Execution Engine...\n');
console.log('📦 Order Details:');
console.log(`   Type: ${orderData.orderType}`);
console.log(`   Swap: ${orderData.amountIn} ${orderData.tokenIn} → ${orderData.tokenOut}`);
console.log(`   Slippage: ${orderData.slippage * 100}%\n`);
console.log('⏳ Waiting for updates...\n');
console.log('━'.repeat(60));

const req = http.request(options);

req.on('upgrade', (res, socket, head) => {
  console.log('\n✅ WebSocket connection established!\n');
  
  socket.on('data', (data) => {
    try {
      // WebSocket frames need to be parsed
      // For simplicity, we'll just look for JSON in the data
      const str = data.toString();
      const jsonMatch = str.match(/\{.*\}/);
      
      if (jsonMatch) {
        const update = JSON.parse(jsonMatch[0]);
        displayUpdate(update);
      }
    } catch (error) {
      // Ignore parsing errors for WebSocket frames
    }
  });
  
  socket.on('end', () => {
    console.log('\n━'.repeat(60));
    console.log('\n🔌 Connection closed');
    process.exit(0);
  });
  
  socket.on('error', (error) => {
    console.error('\n❌ WebSocket error:', error.message);
    process.exit(1);
  });
});

req.on('error', (error) => {
  console.error('❌ Connection error:', error.message);
  console.error('\n💡 Make sure the server is running on http://localhost:3000');
  process.exit(1);
});

// Send order data
req.write(JSON.stringify(orderData));
req.end();

/**
 * Display formatted status update
 */
function displayUpdate(update) {
  const timestamp = new Date(update.timestamp).toLocaleTimeString();
  
  console.log(`\n[${timestamp}] Status: ${update.status.toUpperCase()}`);
  
  switch (update.status) {
    case 'pending':
      console.log(`   Order ID: ${update.orderId}`);
      console.log(`   💬 ${update.message || 'Order received and queued'}`);
      break;
      
    case 'routing':
      if (update.data) {
        console.log(`   🔍 Comparing prices...`);
        if (update.data.raydiumPrice) {
          console.log(`   📊 Raydium: $${update.data.raydiumPrice.toFixed(4)}`);
          console.log(`   📊 Meteora: $${update.data.meteoraPrice.toFixed(4)}`);
          console.log(`   ✅ Selected: ${update.data.selectedDex.toUpperCase()}`);
          
          const diff = Math.abs(update.data.raydiumPrice - update.data.meteoraPrice);
          const savings = (diff / Math.max(update.data.raydiumPrice, update.data.meteoraPrice) * 100).toFixed(2);
          console.log(`   💰 Price difference: $${diff.toFixed(4)} (${savings}%)`);
        }
      }
      break;
      
    case 'building':
      console.log(`   🔨 Creating transaction...`);
      break;
      
    case 'submitted':
      console.log(`   📤 Transaction submitted to blockchain...`);
      break;
      
    case 'confirmed':
      if (update.data) {
        console.log(`   ✅ Transaction confirmed!`);
        console.log(`   🔗 TX Hash: ${update.data.txHash}`);
        console.log(`   💵 Executed Price: $${update.data.executedPrice?.toFixed(4)}`);
        console.log(`   📈 Amount Out: ${update.data.amountOut?.toFixed(4)} ${orderData.tokenOut}`);
        
        const expectedOut = orderData.amountIn * update.data.executedPrice;
        const actualOut = update.data.amountOut;
        const slippage = ((expectedOut - actualOut) / expectedOut * 100).toFixed(2);
        console.log(`   📉 Slippage: ${slippage}%`);
      }
      setTimeout(() => process.exit(0), 1000);
      break;
      
    case 'failed':
      console.log(`   ❌ Order failed!`);
      if (update.data?.error) {
        console.log(`   ⚠️  Error: ${update.data.error}`);
      }
      setTimeout(() => process.exit(1), 1000);
      break;
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n🛑 Interrupted by user');
  process.exit(0);
});