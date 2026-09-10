/**
 * ==============================================================================
 * 🌐 Meta AI Web Bridge - Quick Session Cookie & Token Extractor
 * ==============================================================================
 * 
 * 💡 Step-by-Step Instructions to Extract Your Meta AI Session:
 *  1. Open your web browser and sign in to https://www.meta.ai (via Facebook / Instagram / Meta Account).
 *  2. Press F12 (or Ctrl+Shift+I on Windows/Linux, Cmd+Option+I on macOS) and navigate to the "Console" tab.
 *  3. Copy and paste all code from this script into the console, then press Enter.
 *  4. Your session cookies/tokens are automatically copied to your clipboard.
 *  5. You can now paste them into ./add-account.sh or directly inside the 9Router dashboard modal.
 * ==============================================================================
 */
(() => {
  const getCookie = (name) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return '';
  };

  const cookies = [];
  const cookiePairs = document.cookie.split(';');
  for (const pair of cookiePairs) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const k = trimmed.slice(0, eqIdx);
      const v = trimmed.slice(eqIdx + 1);
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

  const datr = getCookie('datr');
  const cUser = getCookie('c_user');
  const ecto1 = getCookie('ecto_1_sess');
  const abraSess = getCookie('abra_sess');

  const exportPayload = {
    cookies,
    origins: [
      {
        origin: 'https://www.meta.ai',
        localStorage: Object.keys(localStorage).map(k => ({ name: k, value: localStorage.getItem(k) }))
      }
    ],
    meta: {
      user_id: cUser || 'guest',
      has_datr: !!datr,
      has_ecto: !!ecto1,
      has_abra: !!abraSess
    }
  };

  const payloadStr = JSON.stringify(exportPayload, null, 2);

  const successStyle = 'background: #0284c7; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 13px;';
  const infoStyle = 'color: #38bdf8; font-family: monospace; font-size: 12px; font-weight: bold;';

  console.log('%c[✓] Meta AI session payload extracted successfully!', successStyle);
  if (cUser) {
    console.log(`%cAuthenticated user ID: ${cUser}`, 'color: #10b981; font-weight: bold;');
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(payloadStr).then(() => {
      console.log('%c✓ Full session state copied to clipboard! Paste directly into ./add-account.sh or 9Router.', 'color: #10b981; font-weight: bold;');
    }).catch(() => {
      console.log('%cSession payload (copy manually below):', 'font-weight: bold;');
      console.log(payloadStr);
    });
  } else {
    console.log('%cSession payload (copy manually below):', 'font-weight: bold;');
    console.log(payloadStr);
  }
})();
