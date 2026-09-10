import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';

process.on('uncaughtException', (err) => {
  console.error('[meta-bridge] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[meta-bridge] Unhandled rejection:', reason);
});

const PORT = 17843;
const CHROME_EXECUTABLE = '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const PROXY_SERVER = 'socks5://127.0.0.1:40000';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';
const PROJECT_DIR = '/root/projects/meta-ai-free-bridge';
const ACCOUNTS_FILE = path.join(PROJECT_DIR, 'accounts.json');
const ACCOUNTS_DIR = path.join(PROJECT_DIR, 'accounts');

const sessionValidationCache = new Map<string, { ts: number; res: any }>();

export function validateSessionToken(token: string): {
  valid: boolean;
  user?: { name: string; email: string; id: string };
  planType?: string;
  cookies?: Array<{ name: string; value: string; domain: string; path: string; httpOnly: boolean; secure: boolean; sameSite: string; expires: number }>;
  error?: string;
} {
  try {
    const res = spawnSync('python3', [path.join(PROJECT_DIR, 'validate_token.py')], {
      input: JSON.stringify({ token }),
      encoding: 'utf-8',
      timeout: 15000
    });
    if (res.error) {
      return { valid: false, error: res.error.message };
    }
    const parsed = JSON.parse(res.stdout || '{}');
    return parsed;
  } catch (err: any) {
    return { valid: false, error: err.message || 'Validation failed' };
  }
}

export interface AccountConfig {
  id: string;
  name: string;
  tier: 'free' | 'paid';
  storagePath: string;
  enabled: boolean;
  models?: string[];
}

interface AccountSession {
  config: AccountConfig;
  context: BrowserContext | null;
  page: Page | null;
  cooldownUntil: number;
  lastHealthStatus: 'active' | 'error' | 'unknown';
  lastHealthError: string | null;
}

class MetaBridgePool {
  private browser: Browser | null = null;
  private pool: Map<string, AccountSession> = new Map();
  private guestSession: AccountSession | null = null;
  private roundRobinIndex = 0;
  private keepAliveInterval: any = null;
  private queue: Promise<any> = Promise.resolve();
  private startTime = Date.now();

  async init() {
    console.log('[meta-bridge] Launching headless browser engine via Playwright...');
    if (!fs.existsSync(ACCOUNTS_DIR)) {
      fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
    }

    this.browser = await chromium.launch({
      executablePath: CHROME_EXECUTABLE,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-gpu',
        '--no-first-run',
        '--disable-dev-shm-usage'
      ],
      proxy: { server: PROXY_SERVER }
    });

    console.log('[meta-bridge] Browser engine launched successfully.');
    await this.syncFrom9RouterDB();
    await this.reloadAccounts();
    console.log('[meta-bridge] Multi-account pool initialized with', this.pool.size, 'account(s).');

    // Pre-warm active sessions
    this.enqueue(async () => {
      if (this.pool.size === 0) {
        await this.initGuestSession();
      } else {
        for (const account of this.pool.values()) {
          await this.refreshAccountSession(account);
        }
      }
      await this.syncAccountsTo9RouterDB();
    });

    this.startKeepAliveLoop();

    // Auto sync with 9Router DB every 15s to pick up accounts added via UI
    setInterval(() => {
      this.syncFrom9RouterDB();
    }, 15000);
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const res = this.queue.then(fn);
    this.queue = res.catch(() => {});
    return res;
  }

  private async initGuestSession() {
    if (!this.browser) return;
    try {
      console.log('[meta-bridge] Initializing guest browser session...');
      const context = await this.browser.newContext({
        userAgent: USER_AGENT,
        viewport: { width: 1280, height: 800 }
      });
      const page = await context.newPage();
      await this.preparePage(page);
      this.guestSession = {
        config: {
          id: 'guest',
          name: 'Meta AI Guest',
          tier: 'free',
          storagePath: '',
          enabled: true,
          models: ['meta-ai', 'llama-3.3-70b', 'auto']
        },
        context,
        page,
        cooldownUntil: 0,
        lastHealthStatus: 'active',
        lastHealthError: null
      };
      console.log('[meta-bridge] Guest session pre-warmed and ready.');
    } catch (e: any) {
      console.warn('[meta-bridge] Failed to pre-warm guest session:', e.message);
    }
  }

  private async preparePage(page: Page, account?: AccountSession) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.goto('https://www.meta.ai/', {
          waitUntil: 'domcontentloaded',
          timeout: 45000
        });
        await page.waitForTimeout(2000);
        break;
      } catch (e: any) {
        if (attempt === 3) throw e;
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    await this.dismissDialogs(page);
    try {
      const title = await page.title();
      console.log(`[meta-bridge] Page loaded: "${title}" (${page.url()})`);
    } catch {}
  }

  private async dismissDialogs(page: Page) {
    try {
      await page.evaluate(() => {
        const textToDismiss = ['accept all', 'accept', 'dismiss', 'got it', 'close'];
        const allButtons = Array.from(document.querySelectorAll('button, [role="button"], [aria-label="Close"], [data-testid="close-button"]'));
        for (const el of allButtons) {
          const t = (el.innerText || el.textContent || '').trim().toLowerCase();
          const label = (el.getAttribute('aria-label') || '').toLowerCase();
          if (textToDismiss.some(td => t.includes(td) || label.includes(td))) {
            try { (el as HTMLElement).click(); } catch {}
          }
        }
      });
    } catch {}
  }

  public async reloadAccounts() {
    if (!fs.existsSync(ACCOUNTS_FILE)) {
      fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify([], null, 2));
    }
    let configs: AccountConfig[] = [];
    try {
      const data = fs.readFileSync(ACCOUNTS_FILE, 'utf-8');
      configs = JSON.parse(data || '[]');
    } catch (err) {
      console.error('[meta-bridge] Error reading accounts.json:', err);
    }

    const currentIds = new Set(configs.map(c => c.id));
    for (const [id, session] of this.pool.entries()) {
      if (!currentIds.has(id)) {
        if (session.context) await session.context.close().catch(() => {});
        this.pool.delete(id);
      }
    }

    for (const config of configs) {
      const existing = this.pool.get(config.id);
      if (existing) {
        existing.config = config;
      } else {
        this.pool.set(config.id, {
          config,
          context: null,
          page: null,
          cooldownUntil: 0,
          lastHealthStatus: 'unknown',
          lastHealthError: null
        });
      }
    }
  }

  public async getAccountSession(account: AccountSession): Promise<Page> {
    if (!this.browser) throw new Error('Browser engine is not initialized');

    if (!account.context) {
      const storageExists = account.config.storagePath && fs.existsSync(account.config.storagePath);
      account.context = await this.browser.newContext({
        storageState: storageExists ? account.config.storagePath : undefined,
        userAgent: USER_AGENT,
        viewport: { width: 1280, height: 800 }
      });
    }

    if (!account.page || account.page.isClosed()) {
      account.page = await account.context.newPage();
      await this.preparePage(account.page, account);
    }

    return account.page;
  }

  private selectAccount(requestedModel?: string, explicitAccountId?: string): AccountSession {
    const all = Array.from(this.pool.values()).filter(a => a.config.enabled);

    if (explicitAccountId) {
      const match = all.find(a => a.config.id === explicitAccountId);
      if (match) return match;
    }

    if (all.length === 0) {
      if (this.guestSession) return this.guestSession;
      throw new Error('No Meta AI accounts registered and guest fallback is inactive.');
    }

    const now = Date.now();
    const ready = all.filter(a => a.cooldownUntil < now);
    const pool = ready.length > 0 ? ready : all;

    const selected = pool[this.roundRobinIndex % pool.length];
    this.roundRobinIndex++;
    return selected;
  }

  public async ask(
    promptText: string,
    options: { model?: string; accountId?: string; onChunk?: (delta: string, isThinking?: boolean) => void } = {}
  ): Promise<{ text: string; reasoning?: string; account: AccountConfig }> {
    const session = this.selectAccount(options.model, options.accountId);
    console.log(`[meta-bridge] Routing request to account: "${session.config.name}" (${session.config.tier})`);

    const page = await this.getAccountSession(session);
    await this.dismissDialogs(page);

    // If Thinking mode requested, toggle it if button is available
    let effectivePrompt = promptText;
    if (options.model && /thinking|reason/i.test(options.model)) {
      try {
        const modeBtn = page.locator('button').filter({ hasText: /Instant|Thinking/ }).first();
        if (await modeBtn.isVisible().catch(() => false)) {
          await modeBtn.click();
          await page.waitForTimeout(300);
          const thinkingItem = page.locator('[role="menuitemcheckbox"]').filter({ hasText: /Thinking/ }).first();
          if (await thinkingItem.isVisible().catch(() => false)) {
            await thinkingItem.click();
            await page.waitForTimeout(300);
          }
        }
      } catch {}
    }

    // Locate composer input
    const composer = page.locator('textarea, [contenteditable="true"]').filter({ visible: true }).first();
    await composer.waitFor({ state: 'visible', timeout: 20000 });
    await composer.focus();
    await page.waitForTimeout(200);

    // Type prompt text using Playwright keyboard (triggers genuine Lexical/React input events)
    await page.keyboard.insertText(effectivePrompt);
    await page.waitForTimeout(300);

    // Count initial assistant messages
    const initialAssistantCount = await page.evaluate(() => {
      return document.querySelectorAll('[data-testid="assistant-message"], .markdown-content').length;
    });

    // Click Send button with trusted CDP click
    let clicked = false;
    try {
      const sendBtn = page.locator('button[data-testid="composer-send-button"], button[aria-label="Send"]').filter({ visible: true }).first();
      await sendBtn.waitFor({ state: 'visible', timeout: 3000 });
      await sendBtn.click();
      clicked = true;
    } catch {}

    if (!clicked) {
      await composer.focus();
      await page.keyboard.press('Enter');
    }

    // Wait for generation start (either stop button appears or new message appears)
    const startDeadline = Date.now() + 15000;
    while (Date.now() < startDeadline) {
      await page.waitForTimeout(400);
      const state = await page.evaluate((initCount) => {
        const msgs = document.querySelectorAll('[data-testid="assistant-message"], .markdown-content');
        const stopBtn = document.querySelector('button[aria-label*="Stop"], button[aria-label*="stop"], button[data-testid*="stop"]');
        return {
          count: msgs.length,
          hasStopBtn: !!stopBtn,
          hasNewMsg: msgs.length > initCount
        };
      }, initialAssistantCount);

      if (state.hasStopBtn || state.hasNewMsg) {
        break;
      }
    }

    // Poll for response tokens
    const completionDeadline = Date.now() + 90000;
    let fullText = '';
    let fullReasoning = '';
    let lastReportedLen = 0;
    let lastReportedReasoningLen = 0;
    let stableRounds = 0;
    let sawGenerationStart = false;

    while (Date.now() < completionDeadline) {
      await page.waitForTimeout(400);
      let state = { generating: false, hasSendBtn: false, answerText: '', reasoningText: '' };
      try {
        state = await page.evaluate(() => {
          const stopBtn = document.querySelector('button[data-testid="composer-stop-button"], button[aria-label*="Stop"], button[aria-label*="stop"]');
          const sendBtn = document.querySelector('button[data-testid="composer-send-button"], button[aria-label="Send"]');
          const msgs = document.querySelectorAll('[data-testid="assistant-message"]');
          let lastMsg: Element | null = null;
          if (msgs.length > 0) {
            lastMsg = msgs[msgs.length - 1];
          }
          if (!lastMsg) {
            const fallback = document.querySelector('.markdown-content');
            lastMsg = fallback;
          }
          if (!lastMsg) return { generating: !!stopBtn, hasSendBtn: !!sendBtn, answerText: '', reasoningText: '' };

          const thinkEl = lastMsg.querySelector('[class*="thought"], [class*="thinking"], [class*="reasoning"], [data-testid*="thought"], [data-testid*="thinking"], details, summary');
          
          let reasoningText = thinkEl ? (thinkEl.textContent || '').trim() : '';
          let answerText = (lastMsg.textContent || '').trim();
          if (thinkEl && answerText.includes(reasoningText)) {
            answerText = answerText.replace(reasoningText, '').trim();
          }

          return {
            generating: !!stopBtn,
            hasSendBtn: !!sendBtn,
            answerText,
            reasoningText
          };
        });
      } catch (err: any) {
        if (err?.message?.includes('Execution context was destroyed')) {
          await page.waitForTimeout(1000);
          continue;
        }
        throw err;
      }

      if (state.generating) {
        sawGenerationStart = true;
        stableRounds = 0; // Reset while stop button is actively on screen
      }

      // Stream reasoning delta if present
      if (state.reasoningText.length > lastReportedReasoningLen) {
        const delta = state.reasoningText.slice(lastReportedReasoningLen);
        lastReportedReasoningLen = state.reasoningText.length;
        fullReasoning = state.reasoningText;
        if (options.onChunk) options.onChunk(delta, true);
      }

      // Stream answer delta
      if (state.answerText.length > lastReportedLen) {
        const delta = state.answerText.slice(lastReportedLen);
        lastReportedLen = state.answerText.length;
        fullText = state.answerText;
        if (options.onChunk) options.onChunk(delta, false);
      }

      // Completion conditions:
      // Case 1: Stop button was visible, and now is GONE, and send button is back
      if (sawGenerationStart && !state.generating && state.hasSendBtn) {
        if (state.answerText === fullText && (fullText.length > 0 || fullReasoning.length > 0)) {
          stableRounds++;
          if (stableRounds >= 3) break; // 3 cycles * 400ms = 1.2s after stop button completely gone
        } else {
          stableRounds = 0;
          fullText = state.answerText;
        }
      } else if (!sawGenerationStart && !state.generating && fullText.length > 0) {
        // Fallback if stop button was never caught (fast response or very short text)
        if (state.answerText === fullText) {
          stableRounds++;
          if (stableRounds >= 6) break; // Require 2.4s of stability
        } else {
          stableRounds = 0;
          fullText = state.answerText;
        }
      }
    }

    // If fullText is still empty, grab last message as fallback
    if (!fullText) {
      fullText = await page.evaluate(() => {
        const msgs = document.querySelectorAll('[data-testid="assistant-message"], .markdown-content');
        return msgs.length > 0 ? (msgs[msgs.length - 1].textContent || '').trim() : '';
      });
    }

    try {
      await this.persistAccountCookies(session);
    } catch {}

    return { text: fullText, reasoning: fullReasoning, account: session.config };
  }

  public async getAvailableModels(): Promise<Array<{ id: string; object: string; owned_by: string; description?: string }>> {
    return [
      { id: 'muse-spark-1.3', object: 'model', owned_by: 'meta-ai', description: 'Muse Spark 1.3 Flagship Superintelligence Model' },
      { id: 'muse-spark', object: 'model', owned_by: 'meta-ai', description: 'Muse Spark Frontier Reasoning Model' },
      { id: 'muse-code', object: 'model', owned_by: 'meta-ai', description: 'Muse Code Dedicated Coding & Agent Model' },
      { id: 'muse-glimmer', object: 'model', owned_by: 'meta-ai', description: 'Muse Glimmer Fast Multimodal Model' },
      { id: 'muse-spark-thinking', object: 'model', owned_by: 'meta-ai', description: 'Muse Spark Deep Thinking / Reasoning Mode' },
      { id: 'meta-ai', object: 'model', owned_by: 'meta-ai', description: 'Meta AI Standard Web Assistant' },
      { id: 'auto', object: 'model', owned_by: 'meta-ai', description: 'Smart Auto Routing' }
    ];
  }

  private async refreshAccountSession(account: AccountSession) {
    if (!account.config.enabled) return false;
    try {
      const page = await this.getAccountSession(account);
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      account.lastHealthStatus = 'active';
      account.lastHealthError = null;
      await this.persistAccountCookies(account);
      console.log(`[meta-bridge] [KeepAlive] Successfully verified active session for "${account.config.name}".`);
      await this.syncAccountsTo9RouterDB();
      return true;
    } catch (err: any) {
      account.lastHealthStatus = 'error';
      account.lastHealthError = err.message || 'Health check failed';
      console.warn(`[meta-bridge] [KeepAlive] Account "${account.config.name}" session check failed:`, err.message);
      await this.syncAccountsTo9RouterDB();
      return false;
    }
  }

  private async persistAccountCookies(account: AccountSession) {
    if (!account.context || !account.config.storagePath) return;
    try {
      await account.context.storageState({ path: account.config.storagePath });
    } catch (err: any) {
      console.error(`[meta-bridge] Failed to persist cookies for ${account.config.name}:`, err.message);
    }
  }

  private startKeepAliveLoop() {
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
    this.keepAliveInterval = setInterval(() => {
      this.enqueue(async () => {
        for (const account of this.pool.values()) {
          if (account.config.enabled) {
            await this.refreshAccountSession(account);
          }
        }
      });
    }, 30 * 60 * 1000);
  }

  public async syncAccountsTo9RouterDB() {
    try {
      spawnSync('python3', [path.join(PROJECT_DIR, 'register_db.py')], { encoding: 'utf-8' });
    } catch {}
  }

  public syncFrom9RouterDB() {
    const dbPath = path.join('/root/.9router/db', 'data.sqlite');
    if (!fs.existsSync(dbPath)) return;

    try {
      const res = spawnSync('python3', ['-c', `
import sqlite3, json
conn = sqlite3.connect('${dbPath}')
c = conn.cursor()
c.execute("SELECT id, name, email, isActive, data FROM providerConnections WHERE provider = 'openai-compatible-chat-meta'")
rows = c.fetchall()
out = []
for r in rows:
    data_obj = {}
    try:
        data_obj = json.loads(r[4] or '{}')
    except:
        pass
    api_key = data_obj.get('apiKey') or data_obj.get('token') or ''
    out.append({'id': r[0], 'name': r[1] or r[2] or 'Meta AI Account', 'apiKey': api_key, 'enabled': bool(r[3])})
print(json.dumps(out))
      `], { encoding: 'utf-8', timeout: 5000 });

      if (!res.stdout) return;
      const dbConns = JSON.parse(res.stdout);
      let localAccounts: AccountConfig[] = [];
      if (fs.existsSync(ACCOUNTS_FILE)) {
        try { localAccounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8')); } catch {}
      }

      let changed = false;
      for (const conn of dbConns) {
        let existing = localAccounts.find(a => a.id === conn.id);
        if (conn.apiKey && (!existing || existing.enabled !== conn.enabled)) {
          const valRes = validateSessionToken(conn.apiKey);
          const storagePath = path.join(ACCOUNTS_DIR, `${conn.id}_storage.json`);
          if (valRes.cookies && valRes.cookies.length > 0) {
            fs.writeFileSync(storagePath, JSON.stringify({ cookies: valRes.cookies, origins: [] }, null, 2));
            if (!existing) {
              localAccounts.push({
                id: conn.id,
                name: conn.name || 'Meta AI Account',
                tier: 'free',
                storagePath,
                enabled: conn.enabled
              });
            } else {
              existing.enabled = conn.enabled;
            }
            changed = true;
          }
        }
      }

      if (changed) {
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(localAccounts, null, 2));
        this.reloadAccounts();
      }
    } catch {}
  }

  public getStats() {
    return {
      accountsCount: this.pool.size,
      hasGuestFallback: !!this.guestSession,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000)
    };
  }

  public async validateSessionLive(token: string): Promise<{
    valid: boolean;
    user?: { id: string; name: string; email: string };
    planType?: string;
    cookies?: any[];
    error?: string;
  }> {
    const parseRes = validateSessionToken(token);
    if (!parseRes.valid) {
      return { valid: false, error: parseRes.error || 'Token is malformed or too short' };
    }

    if (!this.browser) {
      return { valid: false, error: 'Browser engine not available' };
    }

    const tokenHash = createHash('sha256').update(token.trim()).digest('hex');
    const cached = sessionValidationCache.get(tokenHash);
    if (cached && Date.now() - cached.ts < 300000) {
      return cached.res;
    }

    let context: BrowserContext | null = null;
    try {
      context = await this.browser.newContext({
        userAgent: USER_AGENT,
        viewport: { width: 1280, height: 800 }
      });

      if (parseRes.cookies && parseRes.cookies.length > 0) {
        await context.addCookies(parseRes.cookies as any);
      }

      const page = await context.newPage();
      await page.goto('https://www.meta.ai/', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });

      // Wait a moment for dynamic auth hydration
      await Promise.race([
        page.waitForLoadState('networkidle').catch(() => {}),
        page.waitForTimeout(4000)
      ]);

      const bodyText = await page.evaluate(() => document.body.innerText || '');
      const isLoggedOut = bodyText.includes('Log in') || bodyText.includes('Sign up');

      const result = {
        valid: !isLoggedOut,
        user: parseRes.user,
        planType: 'free',
        cookies: parseRes.cookies,
        error: isLoggedOut
          ? 'Authentication failed: Meta AI shows unauthenticated login page. Please ensure you copied a valid, active session token from a logged-in session.'
          : undefined
      };

      sessionValidationCache.set(tokenHash, { ts: Date.now(), res: result });
      return result;
    } catch (err: any) {
      return { valid: false, error: `Upstream validation error: ${err.message}` };
    } finally {
      if (context) {
        await context.close().catch(() => {});
      }
    }
  }

  public getAccountsInfo() {
    const accs = Array.from(this.pool.values()).map(a => ({
      id: a.config.id,
      name: a.config.name,
      tier: a.config.tier,
      enabled: a.config.enabled,
      status: a.lastHealthStatus === 'active' ? 'ready' : (a.lastHealthStatus === 'error' ? 'error' : 'warming'),
      healthStatus: a.lastHealthStatus,
      lastError: a.lastHealthError
    }));

    if (accs.length === 0 && this.guestSession) {
      accs.push({
        id: 'guest',
        name: 'Meta AI Guest Mode',
        tier: 'free',
        enabled: true,
        status: 'ready',
        healthStatus: 'active',
        lastError: null
      });
    }
    return accs;
  }

  public async close() {
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
    for (const a of this.pool.values()) {
      if (a.context) await a.context.close().catch(() => {});
    }
    if (this.guestSession?.context) {
      await this.guestSession.context.close().catch(() => {});
    }
    if (this.browser) await this.browser.close().catch(() => {});
  }
}

const pool = new MetaBridgePool();
await pool.init();

process.on('SIGTERM', async () => {
  console.log('[meta-bridge] Received SIGTERM. Shutting down cleanly...');
  await pool.close();
  process.exit(0);
});
process.on('SIGINT', async () => {
  console.log('[meta-bridge] Received SIGINT. Shutting down cleanly...');
  await pool.close();
  process.exit(0);
});

// Bun HTTP Server
Bun.serve({
  port: PORT,
  idleTimeout: 0, // CRITICAL: Prevent socket timeout on long reasoning generations
  async fetch(req) {
    const url = new URL(req.url);

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    };

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Health endpoints
    if (url.pathname === '/healthz' || url.pathname === '/health' || url.pathname === '/') {
      return Response.json({
        status: 'ok',
        service: 'meta-ai-free-bridge',
        version: '1.0.0',
        stats: pool.getStats(),
        accounts: pool.getAccountsInfo(),
        timestamp: new Date().toISOString()
      }, { headers: corsHeaders });
    }

    // Accounts endpoints
    if (url.pathname === '/v1/accounts/validate' && req.method === 'POST') {
      try {
        const body: any = await req.json();
        const token = body.token || body.apiKey;
        if (!token) return Response.json({ valid: false, error: 'Token is required' }, { status: 400, headers: corsHeaders });
        const valRes = await pool.validateSessionLive(token);
        return Response.json(valRes, { status: valRes.valid ? 200 : 401, headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ valid: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    if (url.pathname === '/v1/accounts') {
      return Response.json(pool.getAccountsInfo(), { headers: corsHeaders });
    }

    // Models endpoint
    if (url.pathname === '/v1/models' || url.pathname === '/models') {
      // In-Modal Connection Testing Hook for 9Router:
      const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
      if (authHeader.startsWith('Bearer ')) {
        const probeToken = authHeader.slice(7).trim();
        if (probeToken && !probeToken.startsWith('***')) {
          if (probeToken.length < 15) {
            return Response.json({
              error: {
                message: 'Meta AI connection test failed: Token is too short or malformed',
                type: 'invalid_token',
                code: 'invalid_api_key'
              }
            }, { status: 401, headers: corsHeaders });
          }
          const testRes = await pool.validateSessionLive(probeToken);
          if (!testRes.valid) {
            return Response.json({
              error: {
                message: `Meta AI connection test failed: ${testRes.error || 'Token expired or invalid'}`,
                type: 'invalid_token',
                code: 'invalid_api_key'
              }
            }, { status: 401, headers: corsHeaders });
          }
        }
      }

      const models = await pool.getAvailableModels();
      return Response.json({
        object: 'list',
        data: models.map(m => ({
          ...m,
          created: Math.floor(Date.now() / 1000)
        }))
      }, { headers: corsHeaders });
    }

    // Chat completions endpoint
    if (url.pathname === '/v1/chat/completions' && req.method === 'POST') {
      try {
        const body: any = await req.json();
        const messages: Array<{ role: string; content: any }> = body.messages || [];
        const stream = !!body.stream;
        const requestedModel = body.model;
        const explicitAccountId = req.headers.get('x-account-id') || undefined;

        let promptText = '';
        if (messages.length === 1) {
          promptText = typeof messages[0].content === 'string' ? messages[0].content : JSON.stringify(messages[0].content);
        } else {
          const MAX_CHARS = 14000;
          let systemPrompt = '';
          const turns: string[] = [];
          for (const m of messages) {
            const role = (m.role || 'user').toUpperCase();
            const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
            if (m.role === 'system' && !systemPrompt) {
              systemPrompt = `System: ${content}\n\n`;
            } else {
              turns.push(`${role}: ${content}`);
            }
          }
          let totalChars = systemPrompt.length;
          const keptTurns: string[] = [];
          for (let i = turns.length - 1; i >= 0; i--) {
            const t = turns[i];
            if (totalChars + t.length <= MAX_CHARS || keptTurns.length === 0) {
              keptTurns.unshift(t);
              totalChars += t.length;
            } else {
              break;
            }
          }
          promptText = (systemPrompt + keptTurns.join('\n\n')).trim();
        }

        const id = `chatcmpl-${Math.random().toString(36).slice(2, 11)}`;
        const created = Math.floor(Date.now() / 1000);

        if (stream) {
          const { readable, writable } = new TransformStream();
          const writer = writable.getWriter();
          const encoder = new TextEncoder();
          let streamClosed = false;

          const safeWrite = async (data: string) => {
            if (streamClosed) return;
            try { await writer.write(encoder.encode(data)); } catch { streamClosed = true; }
          };
          const safeClose = async () => {
            if (streamClosed) return;
            streamClosed = true;
            try { await writer.close(); } catch {}
          };

          (async () => {
            try {
              const result = await pool.ask(promptText, {
                model: requestedModel,
                accountId: explicitAccountId,
                onChunk: async (delta, isThinking) => {
                  const chunk = {
                    id,
                    object: 'chat.completion.chunk',
                    created,
                    model: requestedModel || 'meta-ai',
                    choices: [{
                      index: 0,
                      delta: isThinking ? { reasoning_content: delta } : { content: delta },
                      finish_reason: null
                    }]
                  };
                  await safeWrite(`data: ${JSON.stringify(chunk)}\n\n`);
                }
              });

              const finalChunk = {
                id,
                object: 'chat.completion.chunk',
                created,
                model: requestedModel || 'meta-ai',
                choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
              };
              await safeWrite(`data: ${JSON.stringify(finalChunk)}\n\n`);
              await safeWrite('data: [DONE]\n\n');
            } catch (err: any) {
              const errChunk = {
                id,
                object: 'chat.completion.chunk',
                created,
                model: requestedModel || 'meta-ai',
                choices: [{ index: 0, delta: { content: `\n[Meta AI Bridge Error: ${err.message}]` }, finish_reason: 'stop' }]
              };
              await safeWrite(`data: ${JSON.stringify(errChunk)}\n\n`);
              await safeWrite('data: [DONE]\n\n');
            } finally {
              await safeClose();
            }
          })();

          return new Response(readable, {
            headers: {
              ...corsHeaders,
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive'
            }
          });
        } else {
          // Non-streaming
          const result = await pool.ask(promptText, {
            model: requestedModel,
            accountId: explicitAccountId
          });

          return Response.json({
            id,
            object: 'chat.completion',
            created,
            model: requestedModel || 'meta-ai',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: result.text,
                  ...(result.reasoning ? { reasoning_content: result.reasoning } : {})
                },
                finish_reason: 'stop'
              }
            ],
            usage: {
              prompt_tokens: Math.ceil(promptText.length / 4),
              completion_tokens: Math.ceil(result.text.length / 4),
              total_tokens: Math.ceil((promptText.length + result.text.length) / 4)
            },
            account: {
              id: result.account.id,
              name: result.account.name,
              tier: result.account.tier
            }
          }, { headers: corsHeaders });
        }
      } catch (err: any) {
        console.error('[meta-bridge] Chat completion error:', err);
        return Response.json({
          error: {
            message: err.message || 'Internal server error in Meta AI bridge',
            type: 'meta_ai_bridge_error'
          }
        }, { status: 500, headers: corsHeaders });
      }
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  }
});

console.log(`[meta-bridge] Meta AI Web Bridge listening on http://127.0.0.1:${PORT}`);
