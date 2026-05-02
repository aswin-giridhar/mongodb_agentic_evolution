/**
 * Generate synthetic code chunks for Acme Robotics
 */

import { loadSeedSpec, saveData, generateId } from '../src/lib/utils.js';
import type { SeedSpec, CodeChunk } from '../src/types.js';

// Code templates that demonstrate tribal rules
const CODE_TEMPLATES = [
  {
    path: "lib/limiter.ts",
    service: "inventory",
    language: "typescript",
    content: `import Redis from 'ioredis';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

export class RateLimiter {
  private redis: Redis;
  private config: RateLimitConfig;

  constructor(redis: Redis, config: RateLimitConfig) {
    this.redis = redis;
    this.config = config;
  }

  async checkLimit(key: string): Promise<{ allowed: boolean; remaining: number }> {
    const redisKey = \`\${this.config.keyPrefix}\${key}\`;
    const current = await this.redis.incr(redisKey);

    if (current === 1) {
      await this.redis.expire(redisKey, this.config.windowMs / 1000);
    }

    const allowed = current <= this.config.maxRequests;
    const remaining = Math.max(0, this.config.maxRequests - current);

    return { allowed, remaining };
  }
}

export const limiter = new RateLimiter(
  new Redis(process.env.REDIS_HOST),
  { windowMs: 60000, maxRequests: 100, keyPrefix: 'rate_limit:' }
);`,
    imports: ["ioredis"]
  },
  {
    path: "services/payments-api/src/routes/checkout.ts",
    service: "payments-api",
    language: "typescript",
    content: `import { Router, Request, Response } from 'express';
import { limiter } from '@/lib/limiter';
import { authMiddleware } from '@/middleware/auth';
import { processPayment } from './payment';

const router = Router();

// Apply rate limiting BEFORE the route handler
router.use('/checkout', limiter.checkLimit.bind(limiter));

router.post('/checkout', authMiddleware, async (req: Request, res: Response) => {
  const { amount, currency, items, customer_id } = req.body;

  // Validate request
  if (!amount || amount <= 0) {
    return res.status(400).json({
      error: { code: 'INVALID_AMOUNT', message: 'Amount must be positive' }
    });
  }

  try {
    // Process payment
    const result = await processPayment({
      amount,
      currency: currency || 'USD',
      items,
      customer_id,
      created_at: Date.now()
    });

    // Return with tx_id (not transactionId) - R2
    return res.status(200).json({
      tx_id: result.id,
      status: result.status,
      amount: result.amount
    });
  } catch (error) {
    return res.status(500).json({
      error: {
        code: 'PAYMENT_FAILED',
        message: error.message,
        tx_id: null
      }
    });
  }
});

export default router;`,
    imports: ["express", "@/lib/limiter", "@/middleware/auth"]
  },
  {
    path: "services/mobile-app/src/hooks/useCheckout.ts",
    service: "mobile-app",
    language: "typescript",
    content: `import { useState, useCallback } from 'react';
import { api } from '@/api/payments';

interface CheckoutData {
  tx_id: string;
  status: 'pending' | 'complete' | 'failed';
  amount: number;
}

export function useCheckout() {
  const [data, setData] = useState<CheckoutData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const startCheckout = useCallback(async (items: any[]) => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.post('/checkout', { items });
      setData(response.data);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  const pollStatus = useCallback(async (txId: string) => {
    // Poll for status updates
    const interval = setInterval(async () => {
      try {
        const response = await api.get(\`/status/\${txId}\`);
        setData(response.data);

        if (response.data.status !== 'pending') {
          clearInterval(interval);
        }
      } catch (err) {
        clearInterval(interval);
        setError(err as Error);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return { data, loading, error, startCheckout, reset, pollStatus };
}`,
    imports: ["react", "@/api/payments"]
  },
  {
    path: "services/auth/src/middleware.ts",
    service: "auth",
    language: "typescript",
    content: `import { Request, Response, NextFunction } from 'express';
import { verifyToken } from './jwt';
import { logger } from '@/lib/logger';

/**
 * AUTH MIDDLEWARE - MUST RUN FIRST (R4)
 * Validates JWT tokens and sets user context
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next(); // Only proceed to logging AFTER auth
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * LOGGING MIDDLEWARE - MUST RUN AFTER AUTH (R4)
 * Only logs authenticated requests for security
 */
export function loggingMiddleware(req: Request, res: Response, next: NextFunction) {
  // Only log if user is authenticated (authMiddleware ran first)
  if (req.user) {
    logger.info({
      method: req.method,
      path: req.path,
      user: req.user.id,
      timestamp: new Date().toISOString()
    });
  }
  next();
}

// Export in correct order: auth BEFORE logging
export default [authMiddleware, loggingMiddleware];`,
    imports: ["express", "./jwt", "@/lib/logger"]
  },
  {
    path: "services/auth/src/jwt.ts",
    service: "auth",
    language: "typescript",
    content: `import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'dev-secret';

export interface TokenPayload {
  id: string;
  email: string;
  iat?: number;
  exp?: number;
}

export function generateToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, SECRET, { expiresIn: '1h' });
}

export function verifyToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, SECRET) as TokenPayload;
  } catch (error) {
    throw new Error('Invalid token');
  }
}

export function decodeToken(token: string): TokenPayload | null {
  try {
    return jwt.decode(token) as TokenPayload;
  } catch {
    return null;
  }
}`,
    imports: ["jsonwebtoken"]
  },
  {
    path: "services/mobile-app/src/checkout/CheckoutForm.tsx",
    service: "mobile-app",
    language: "typescript",
    content: `import { useState } from 'react';
import { useCheckout } from '@/hooks/useCheckout';
import { Button } from '@/components/ui/Button';

export function CheckoutForm({ items }: { items: any[] }) {
  const { data, loading, error, startCheckout } = useCheckout();
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    setSubmitted(true);
    await startCheckout(items);
  };

  if (data) {
    return (
      <div className="checkout-success">
        <h2>Order Placed!</h2>
        <p>Transaction ID: {data.tx_id}</p>
        <p>Status: {data.status}</p>
      </div>
    );
  }

  return (
    <div className="checkout-form">
      <h2>Complete Your Order</h2>
      <div className="items">
        {items.map(item => (
          <div key={item.id}>{item.name} - \${item.price}</div>
        ))}
      </div>
      <div className="total">
        Total: \${items.reduce((sum, i) => sum + i.price, 0)}
      </div>
      {error && <div className="error">{error.message}</div>}
      <Button
        onClick={handleSubmit}
        disabled={loading || submitted}
      >
        {loading ? 'Processing...' : 'Place Order'}
      </Button>
    </div>
  );
}`,
    imports: ["react", "@/hooks/useCheckout", "@/components/ui/Button"]
  },
  {
    path: "lib/middleware.ts",
    service: "inventory",
    language: "typescript",
    content: `import { Request, Response, NextFunction } from 'express';

// Shared middleware utilities

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error('Error:', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'An error occurred'
        : err.message
    }
  });
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function validateContentType(...types: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!types.includes(req.headers['content-type'] || '')) {
      return res.status(415).json({
        error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Invalid content type' }
      });
    }
    next();
  };
}`,
    imports: ["express"]
  },
  {
    path: "services/inventory/src/stock.ts",
    service: "inventory",
    language: "typescript",
    content: `import { Router } from 'express';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_HOST);
const router = Router();

// Check stock availability
router.get('/stock/:sku', async (req, res) => {
  const { sku } = req.params;
  const stock = await redis.get(\`stock:\${sku}\`);

  res.json({ sku, available: parseInt(stock || '0') });
});

// Reserve stock for an order
router.post('/stock/reserve', async (req, res) => {
  const { items } = req.body;
  const reservationId = \`res_\${Date.now()}\`;

  try {
    // Atomic reservation using Redis transaction
    const multi = redis.multi();

    for (const item of items) {
      multi.decrBy(\`stock:\${item.sku}\`, item.quantity);
    }

    await multi.exec();

    // Store reservation
    await redis.setex(
      \`reservation:\${reservationId}\`,
      300, // 5 minute TTL
      JSON.stringify(items)
    );

    res.json({ reservation_id: reservationId, status: 'reserved' });
  } catch (error) {
    res.status(500).json({ error: 'Reservation failed' });
  }
});

export default router;`,
    imports: ["express", "ioredis"]
  }
];

async function generateCode(spec: SeedSpec): Promise<CodeChunk[]> {
  console.log('🔨 Generating code chunks...');

  const chunks: CodeChunk[] = [];

  for (const template of CODE_TEMPLATES) {
    chunks.push({
      id: generateId(template.path, 'code'),
      path: template.path,
      content: template.content,
      imports: template.imports,
      service: template.service,
      language: template.language
    });
  }

  // Generate additional chunks to reach ~30
  const additionalPaths = [
    { path: "services/payments-api/src/routes/refund.ts", service: "payments-api" },
    { path: "services/mobile-app/src/api/payments.ts", service: "mobile-app" },
    { path: "services/inventory/src/reservations.ts", service: "inventory" },
    { path: "services/auth/src/health.ts", service: "auth" },
    { path: "lib/redis.ts", service: "inventory" },
    { path: "lib/logger.ts", service: "inventory" },
    { path: "services/payments-api/src/payment/index.ts", service: "payments-api" },
    { path: "services/mobile-app/src/components/ui/Button.tsx", service: "mobile-app" }
  ];

  for (const { path, service } of additionalPaths) {
    chunks.push({
      id: generateId(path, 'code'),
      path,
      content: `// ${path}\n// Auto-generated placeholder\n\nexport function placeholder() {\n  // TODO: Implement\n}\n`,
      imports: [],
      service,
      language: "typescript"
    });
  }

  console.log(`✅ Generated ${chunks.length} code chunks`);
  return chunks;
}

async function main() {
  try {
    console.log('📥 Loading seed-spec.json...');
    const spec = await loadSeedSpec() as SeedSpec;

    const chunks = await generateCode(spec);
    await saveData(chunks, 'code.json');

    console.log(`   Languages: ${[...new Set(chunks.map(c => c.language))].join(', ')}`);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
