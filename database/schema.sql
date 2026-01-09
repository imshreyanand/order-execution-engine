-- Order Execution Engine Database Schema

-- Orders table - stores all order history
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id VARCHAR(50) UNIQUE NOT NULL,
    order_type VARCHAR(20) NOT NULL, -- 'market', 'limit', 'sniper'
    token_in VARCHAR(50) NOT NULL,
    token_out VARCHAR(50) NOT NULL,
    amount_in DECIMAL(20, 8) NOT NULL,
    amount_out DECIMAL(20, 8),
    status VARCHAR(20) NOT NULL, -- 'pending', 'routing', 'building', 'submitted', 'confirmed', 'failed'
    selected_dex VARCHAR(20), -- 'raydium' or 'meteora'
    raydium_price DECIMAL(20, 8),
    meteora_price DECIMAL(20, 8),
    executed_price DECIMAL(20, 8),
    tx_hash VARCHAR(100),
    slippage DECIMAL(5, 4) DEFAULT 0.01, -- 1% default
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();