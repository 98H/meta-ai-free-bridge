import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

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
        // Try dismissing cookie dialogs, welcome banners, overlays
        const selectors = [
          'button:has-text("Accept all")',
          'button:has-text("Accept")',
          'button:has-text("Dismiss")',
          'button:has-text("Got it")',
          'button:has-text("Close")',
          '[aria-label="Close"]',
          '[data-testid="close-button"]'
        ];
        for (const sel of selectors) {
          try {
            const btn = document.querySelector(sel) as HTMLElement;
            if (btn && btn.offsetParent !== null) {
              btn.click();
            }
          } catch {}
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
    options: { model?: string; accountId?: string; onChunk?: (delta: string) => void } = {}
  ): Promise<{ text: string; account: AccountConfig }> {
    const session = this.selectAccount(options.model, options.accountId);
    console.log(`[meta-bridge] Routing request to account: "${session.config.name}" (${session.config.tier})`);

    const page = await this.getAccountSession(session);
    await this.dismissDialogs(page);

    // Reset to new conversation if not on a clean home page
    await page.evaluate(() => {
      const newChatBtn = document.querySelector('button[aria-label="New chat"], a[href="/"], button:has-text("New chat")') as HTMLElement;
      if (newChatBtn) newChatBtn.click();
    });
    await page.waitForTimeout(500);

    // Switch mode if model specifies thinking
    if (options.model && /thinking|reason/i.test(options.model)) {
      await page.evaluate(() => {
        const modeBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText?.includes('Instant') || b.innerText?.includes('Thinking'));
        if (modeBtn) modeBtn.click();
      });
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        const item = document.querySelector('[role="menuitemcheckbox"]:has-text("Thinking"), button:has-text("Thinking")') as HTMLElement;
        if (item) item.click();
      });
      await page.waitForTimeout(300);
    }

    // Locate composer input
    const composer = page.locator('input[aria-label*="Ask Meta AI"], input[placeholder*="Ask Meta AI"], textarea[data-testid="composer-input"], div[data-testid="composer-input"] [contenteditable], textarea, input[type="text"]')
      .filter({ visible: true })
      .first();
    await composer.waitFor({ state: 'visible', timeout: 20000 });

    const initialAssistantCount = await page.evaluate(() => {
      return document.querySelectorAll('[class*="assistant-message"], [data-message-author-role="assistant"]').length;
    });

    // Type prompt text
    await composer.evaluate((el: HTMLElement, val: string) => {
      el.focus();
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const input = el as HTMLInputElement;
        const nativeSetter = Object.getOwnPropertyDescriptor(
          el instanceof HTMLInputElement ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype,
          'value'
        )?.set;
        if (nativeSetter) nativeSetter.call(input, val);
        else input.value = val;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        el.textContent = val;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: val }));
      }
    }, promptText);

    await page.waitForTimeout(400);

    // Fallback insertText if value didn't latch
    const isValSet = await composer.evaluate((el: HTMLElement) => {
      return (el as any).value?.length > 0 || (el.textContent || '').length > 0;
    });
    if (!isValSet) {
      await composer.focus();
      await page.keyboard.insertText(promptText);
      await page.waitForTimeout(300);
    }

    // Click Send button
    const sendButtonSelector = 'button[aria-label="Send"], button[data-testid*="send"], button:has-text("Send")';
    let clicked = false;
    try {
      const sendBtn = page.locator(sendButtonSelector).filter({ visible: true }).first();
      await sendBtn.waitFor({ state: 'visible', timeout: 4000 });
      clicked = await sendBtn.evaluate((b: HTMLButtonElement) => {
        if (!b.disabled) {
          b.click();
          return true;
        }
        return false;
      });
    } catch {}

    if (!clicked) {
      await composer.focus();
      await page.keyboard.press('Enter');
    }

    // Wait for generation start
    const startDeadline = Date.now() + 15000;
    let started = false;
    while (Date.now() < startDeadline) {
      await page.waitForTimeout(500);
      const state = await page.evaluate(() => {
        const msgs = document.querySelectorAll('[class*="assistant-message"], [data-message-author-role="assistant"]');
        const stopBtn = document.querySelector('button[aria-label*="Stop"], button[data-testid*="stop"]');
        const lastMsg = msgs[msgs.length - 1];
        const hasText = lastMsg && (lastMsg.innerText || lastMsg.textContent || '').trim().length > 0;
        return {
          count: msgs.length,
          hasStopBtn: !!stopBtn,
          hasText: !!hasText
        };
      });
      if (state.count > initialAssistantCount || state.hasStopBtn || (state.count > 0 && state.hasText)) {
        started = true;
        break;
      }
    }

    if (!started) {
      // Try Enter key fallback one more time
      try {
        await composer.focus();
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1500);
      } catch {}
    }

    // Poll for response tokens
    const completionDeadline = Date.now() + 60000;
    let fullText = '';
    let lastReportedLen = 0;
    let stableRounds = 0;

    while (Date.now() < completionDeadline) {
      await page.waitForTimeout(600);
      let state = { generating: false, text: '' };
      try {
        state = await page.evaluate(() => {
          const stopBtn = document.querySelector('button[aria-label*="Stop"], button[data-testid*="stop"]');
          const msgs = document.querySelectorAll('[class*="assistant-message"], [data-message-author-role="assistant"], div[dir="auto"]');
          let lastMsg: Element | null = null;
          for (let i = msgs.length - 1; i >= 0; i--) {
            const t = (msgs[i].textContent || '').trim();
            if (t.length > 5 && !t.includes('Ask Meta AI') && !t.includes('Where should we start')) {
              lastMsg = msgs[i];
              break;
            }
          }
          return {
            generating: !!stopBtn,
            text: lastMsg ? (lastMsg.textContent || '').trim() : ''
          };
        });
      } catch (err: any) {
        if (err?.message?.includes('Execution context was destroyed')) {
          await page.waitForTimeout(1000);
          continue;
        }
        throw err;
      }

      if (state.text.length > lastReportedLen) {
        const delta = state.text.slice(lastReportedLen);
        lastReportedLen = state.text.length;
        fullText = state.text;
        if (options.onChunk) options.onChunk(delta);
      }

      if (!state.generating && fullText.length > 0) {
        if (state.text === fullText) {
          stableRounds++;
          if (stableRounds >= 2) break;
        } else {
          stableRounds = 0;
          fullText = state.text;
        }
      }
    }

    try {
      await this.persistAccountCookies(session);
    } catch {}

    return { text: fullText, account: session.config };
  }

  public async getAvailableModels(): Promise<Array<{ id: string; object: string; owned_by: string; description?: string }>> {
    return [
      { id: 'meta-ai', object: 'model', owned_by: 'meta-ai', description: 'Meta AI Standard Assistant' },
      { id: 'llama-3.3-70b', object: 'model', owned_by: 'meta-ai', description: 'Llama 3.3 70B Instruct' },
      { id: 'llama-3.1-405b', object: 'model', owned_by: 'meta-ai', description: 'Llama 3.1 405B Flagship' },
      { id: 'meta-ai-thinking', object: 'model', owned_by: 'meta-ai', description: 'Meta AI Reasoning / Thinking Mode' },
      { id: 'auto', object: 'model', owned_by: 'meta-ai', description: 'Auto Model Routing' }
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
c.execute("SELECT id, name, apiKey, enabled FROM providerConnections WHERE provider = 'openai-compatible-chat-meta'")
rows = c.fetchall()
out = []
for r in rows:
    out.append({'id': r[0], 'name': r[1], 'apiKey': r[2], 'enabled': bool(r[3])})
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
        if (!existing && conn.apiKey) {
          const valRes = validateSessionToken(conn.apiKey);
          const storagePath = path.join(ACCOUNTS_DIR, `${conn.id}_storage.json`);
          if (valRes.cookies) {
            fs.writeFileSync(storagePath, JSON.stringify({ cookies: valRes.cookies, origins: [] }, null, 2));
            localAccounts.push({
              id: conn.id,
              name: conn.name || 'Meta AI Account',
              tier: 'free',
              storagePath,
              enabled: conn.enabled
            });
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

// Start Bun HTTP Server
Bun.serve({
  port: PORT,
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
        const valRes = validateSessionToken(token);
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
          const MAX_CHARS = 35000;
          let formatted = messages.map(m => {
            const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
            return `${m.role.toUpperCase()}:\n${text}`;
          });

          let totalLen = formatted.reduce((acc, str) => acc + str.length, 0);
          if (totalLen > MAX_CHARS && messages.length > 2) {
            const first = formatted[0];
            let currentLen = first.length;
            const remaining = formatted.slice(1);
            const pickedBackwards: string[] = [];
            for (let i = remaining.length - 1; i >= 0; i--) {
              if (currentLen + remaining[i].length > MAX_CHARS && pickedBackwards.length >= 2) break;
              pickedBackwards.unshift(remaining[i]);
              currentLen += remaining[i].length;
            }
            formatted = [first, ...pickedBackwards];
          }
          promptText = formatted.join('\n\n');
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
                onChunk: async (delta) => {
                  const chunk = {
                    id,
                    object: 'chat.completion.chunk',
                    created,
                    model: requestedModel || 'meta-ai',
                    choices: [{ index: 0, delta: { content: delta }, finish_reason: null }]
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
                message: { role: 'assistant', content: result.text },
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
