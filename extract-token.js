/**
 * ==============================================================================
 * 🌐 Meta AI Web Bridge - Robust Session Extractor (Universal)
 * ==============================================================================
 * 
 * Works across ALL modern browsers (Chrome, Edge, Brave, Firefox, Safari)
 * whether you logged in via Facebook, Instagram, or Meta Account.
 * Handles httpOnly cookies gracefully by checking document.cookie and localStorage.
 * ==============================================================================
 */
(() => {
  const getCookie = (name) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return '';
  };

  // 1. Collect all accessible cookies
  const cookies = [];
  const cookiePairs = document.cookie.split(';');
  for (const pair of cookiePairs) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim();
      if (k) {
        cookies.push({
          name: k,
          value: v,
          domain: '.meta.ai',
          path: '/',
          httpOnly: false,
          secure: true,
          sameSite: 'Lax'
        });
      }
    }
  }

  // 2. Identify key markers
  const datr = getCookie('datr');
  const cUser = getCookie('c_user');
  const ecto1 = getCookie('ecto_1_sess');
  const abraSess = getCookie('abra_sess');

  // Format 1: Direct cookie string (Easiest to copy and paste)
  const rawCookieString = document.cookie.trim();

  // Format 2: Full JSON storage state (Playwright compatible)
  const fullPayload = JSON.stringify({
    cookies,
    origins: [
      {
        origin: 'https://www.meta.ai',
        localStorage: Object.keys(localStorage).map(k => ({ name: k, value: localStorage.getItem(k) }))
      }
    ],
    summary: {
      userId: cUser || 'authenticated_session',
      has_datr: !!datr,
      has_ecto_1_sess: !!ecto1,
      has_abra_sess: !!abraSess,
      totalCookies: cookies.length
    }
  }, null, 2);

  console.clear();
  console.log('%c=====================================================', 'color: #3b82f6;');
  console.log('%c  🌐 Meta AI Session Extractor', 'color: #06b6d4; font-weight: bold; font-size: 14px;');
  console.log('%c=====================================================', 'color: #3b82f6;');

  if (rawCookieString.length > 0) {
    console.log('%c[✓] Session detected successfully!', 'color: #10b981; font-weight: bold; font-size: 13px;');
    if (cUser) {
      console.log(`%c[i] Facebook User ID: ${cUser}`, 'color: #6366f1; font-weight: bold;');
    }
    console.log('%c[i] Found ' + cookies.length + ' cookie(s).', 'color: #94a3b8;');

    // Try auto-copying JSON or cookie string
    const toCopy = fullPayload;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(toCopy).then(() => {
        console.log('%c✓ COPIED TO CLIPBOARD AUTOMATICALLY!', 'background: #10b981; color: white; padding: 4px 10px; border-radius: 4px; font-weight: bold;');
        console.log('%cNow simply paste it into 9Router modal or ./add-account.sh.', 'color: #10b981;');
      }).catch(() => {
        console.log('%cCopy below JSON string manually:', 'color: #f59e0b; font-weight: bold;');
        console.log(toCopy);
      });
    } else {
      console.log('%cCopy below JSON string manually:', 'color: #f59e0b; font-weight: bold;');
      console.log(toCopy);
    }
  } else {
    console.warn('%c[!] document.cookie is empty.', 'color: #ef4444; font-weight: bold; font-size: 13px;');
    console.log('%c💡 If your browser blocks script access to cookies, use the manual method below:', 'color: #f59e0b; font-weight: bold;');
    console.log('1. In DevTools, switch to the "Application" tab (on Firefox: "Storage").');
    console.log('2. Expand "Cookies" in the left sidebar and click "https://www.meta.ai".');
    console.log('3. Find "datr" and "ecto_1_sess" (or "c_user"), copy their values.');
    console.log('4. Or right-click any network request to meta.ai in the "Network" tab -> Copy -> Copy as cURL, and extract the Cookie header.');
  }

  // Also expose helper globally in window
  window.__metaSessionPayload = fullPayload;
  window.__metaRawCookieString = rawCookieString;
  console.log('%c=====================================================', 'color: #3b82f6;');
  return 'Extraction complete. Payload also available in window.__metaSessionPayload';
})();
