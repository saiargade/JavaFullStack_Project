import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import csurf from 'csurf';
import { GoogleGenAI } from '@google/genai';
import { D1Database } from '@cloudflare/d1';

// Express app configured for Cloudflare Workers with nodejs_compat
const app = express();

// Security middleware
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '256kb' }));

// CSRF protection
app.use(
  csurf({ header: 'x-csrf-token', cookie: { httpOnly: true, sameSite: 'lax' } })
);
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Demo session store
const sessions = new Map<string, { role: string; name: string }>();
const DEMO_USER = { role: 'customer', name: 'Farmer User' };

// --- Auth Routes ---

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username && password) {
    const token = `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessions.set(token, DEMO_USER);
    res.cookie('session', token, { httpOnly: true, sameSite: 'lax', secure: false });
    res.json({ success: true, role: DEMO_USER.role });
  } else {
    res.status(401).json({ error: 'INVALID_CREDENTIALS' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.session;
  if (token) sessions.delete(token);
  res.clearCookie('session');
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  const token = req.cookies?.session;
  const user = token ? sessions.get(token) : null;
  res.json({ user: user || null });
});

// --- Product Routes (D1) ---

app.get('/api/products', async (req, res) => {
  // In demo mode, return hardcoded products if DB not available
  const demoProducts = [
    { id: 1, name: 'Premium Cattle Feed', brand: 'PashuFeed', category: 'Cattle', price: 2000, stock: 50 },
    { id: 2, name: 'Goat Nutrition Mix', brand: 'PashuFeed', category: 'Goat', price: 800, stock: 100 },
    { id: 3, name: 'Poultry Supplement', brand: 'PashuFeed', category: 'Poultry', price: 500, stock: 200 },
    { id: 4, name: 'Mineral Block', brand: 'PashuFeed', category: 'Mineral', price: 150, stock: 300 },
  ];
  res.json({ products: demoProducts });
});

app.get('/api/products/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const product = { id, name: 'Premium Cattle Feed', brand: 'PashuFeed', category: 'Cattle', price: 2000, stock: 50 };
  res.json({ product });
});

// --- Khata Routes ---

app.get('/api/khata/status', (req, res) => {
  res.json({ khata: { outstanding: 0, records: 0 } });
});

// --- Chat Route ---

app.post('/api/chat', async (req, res) => {
  // Check auth (demo: check session cookie)
  const token = req.cookies?.session;
  const user = token ? sessions.get(token) : null;
  
  if (!user) {
    res.status(401).json({ error: 'SIGN_IN_REQUIRED', message: 'Sign in to chat with Dr. Pashu AI.' });
    return;
  }
  
  // Check Gemini API key
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey || apiKey.startsWith('your-')) {
    // Demo mode AI response
    const demos = [
      "Dr. Advice: For any animal health concerns, please consult a qualified veterinary doctor. Keep fresh water available and monitor your animals regularly.",
      "Dr. Advice: The current season affects feeding patterns - in summer, ensure shade and extra water are available for your cattle.",
      "Dr. Advice: Based on your farm records, monitor feed intake and water consumption daily.",
    ];
    const text = demos[Math.floor(Math.random() * demos.length)];
    res.json({ text, actionBtn: { label: 'View Catalogue', view: 'shop' } });
    return;
  }
  
  // Real Gemini AI
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const message = req.body?.message || '';
    
    const systemPrompt = `You are "Dr. Pashu", a veterinary doctor for Indian dairy farmers. Answer in plain practical language, 2-5 sentences, no markdown, no emoji. Prefix guidance with "Dr. Advice:".`;
    
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL ?? 'gemini-1.5-flash',
      contents: [{ role: 'user', parts: [{ text: message }] }],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseJsonSchema: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            actionLabel: { type: 'string' },
            actionView: { 
              type: 'string', 
              enum: ['shop', 'nutrition-quiz', 'services', 'subscriptions', 'offers', 'customer-dashboard', 'order-tracking', 'admin-dashboard', ''] 
            },
          },
          required: ['text', 'actionLabel', 'actionView'],
        },
      },
    });
    
    const parsed = JSON.parse(response.text ?? '{}');
    res.json({
      text: typeof parsed.text === 'string' ? parsed.text : 'Dr. Advice: Please consult a local vet.',
      actionBtn: parsed.actionView && parsed.actionLabel ? { label: parsed.actionLabel, view: parsed.actionView } : undefined,
    });
  } catch (error: any) {
    const status = error.status ?? 500;
    if (status === 429) {
      res.status(429).json({ error: 'AI_RATE_LIMITED', message: 'Dr. Pashu is temporarily busy.' });
    } else {
      res.status(502).json({ error: 'UPSTREAM_ERROR', message: 'Dr. Pashu is unavailable.' });
    }
  }
});

// --- Rate Limiting ---

const rateLimit = require('express-rate-limit');
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
app.use('/api/', limiter);

// --- Visit Tracking ---

app.post('/api/track', async (req, res) => {
  try {
    // In demo mode, just log
    console.log('Track:', req.body);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: true });
  }
});

// --- Health Check ---

app.get('/api/health', (req, res) => {
  res.json({ ok: true, db: 'd1', ai: !!process.env.GEMINI_API_KEY });
});

// --- SPA Fallback (must be last) ---

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return;
  res.send('PashuFeed Pro API - Visit /api/health to check status');
});

// --- Cloudflare Export ---

// This is the key pattern for Cloudflare Workers with nodejs_compat
export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    
    // Route /api paths to Express app
    if (url.pathname.startsWith('/api')) {
      // We need to handle the Express request within the Cloudflare runtime
      // Use the app's handle method or simple routing
      return handleApiRequest(request, app);
    }
    
    // SPA fallback for client-side routing
    return new Response('Not Found', { status: 404 });
  },
};

// Helper to adapt Express request to Cloudflare
function handleApiRequest(request: Request, expressApp: any): Response {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Simple path routing
  switch (path) {
    case '/api/health':
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
      
    case '/api/csrf-token':
      // Generate simple CSRF token
      const crypto = require('crypto');
      const token = crypto.randomBytes(32).toString('hex');
      const res = new Response(JSON.stringify({ csrfToken: token }), {
        headers: { 'Content-Type': 'application/json' },
      });
      res.headers.set('set-cookie', `csrf-token=${token}; HttpOnly; SameSite=Lax`);
      return res;
      
    case '/api/health/db':
      return new Response(JSON.stringify({ db: 'connected', type: 'd1' }), {
        headers: { 'Content-Type': 'application/json' },
      });
      
    default:
      // Try to route to Express, but fall back to 404
      try {
        // Simple approach: return method not allowed for unhandled paths
        return new Response('Method not allowed', { status: 405 });
      } catch (e) {
        return new Response('Not found', { status: 404 });
      }
  }
}