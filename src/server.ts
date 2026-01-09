// Express server setup
import express from 'express';
import { queueWorker } from './services/queueWorker';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Create order
app.post('/orders', (req, res) => {
  // Create order implementation
  res.json({ orderId: '123', status: 'pending' });
});

// Get order
app.get('/orders/:id', (req, res) => {
  // Get order implementation
  res.json({ id: req.params.id, status: 'pending' });
});

// List pending orders
app.get('/orders', (req, res) => {
  // List orders implementation
  res.json({ orders: [] });
});

export async function startServer() {
  await queueWorker.start();
  
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
