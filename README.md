# 🌐 Meta AI Web Gateway Bridge (Multi-Account & Llama Hub)
> **Turnkey, Production-Ready, Headless Web-to-API Gateway for Meta AI (`meta.ai` & Llama Models)**

یک گیت‌وی قدرتمند، ماژولار و کاملاً وایت‌لیبل (White-Label) برای تبدیل نشست‌های وب سرویس هوش مصنوعی **Meta AI (`meta.ai`)** به یک API کاملاً استاندارد و سازگار با **OpenAI (`/v1/chat/completions`)**، با قابلیت مدیریت همزمان چندین اکانت، سوییچ خودکار بین مدل‌های پرچمدار لاما (`Llama 3.3 70B`، `Llama 3.1 405B`، `Meta AI Standard` و حالت استدلال `Thinking`)، لود بالانسینگ (Round-Robin)، و اتصال بلادرنگ به پنل **9Router**.

---

## 🌟 قابلیت‌های کلیدی (Key Features)

- **استاندارد OpenAI و استریم مقاوم در برابر قطع (Fault-Tolerant Streaming):**  
  پیاده‌سازی کامل اندپوینت `/v1/chat/completions` بر بستر ران‌تایم فوق سریع Bun، استریم Server-Sent Events (SSE) بلادرنگ، حذف قطعی‌های سوکت در پردازش‌های سنگین و استدلال‌های طولانی، و محافظت کامل در برابر قطع ارتباط ناگهانی کلاینت.

- **بای‌پس کامل چالش‌های امنیتی و ضد ربات (Anti-Detection Headless Engine):**  
  بهره‌گیری از انجین اتوماسیون Playwright Chromium با فلگ‌های استیلث پیشرفته (`--disable-blink-features=AutomationControlled`) و پروکسی هوشمند WARP جهت دور زدن چالش‌های لبه CDN فیسبوک/متا (`rd_challenge` و فایروال متا).

- **مکانیزم پیش‌گرمایش نشست مرورگر (Pre-Warming Session Engine):**  
  بارگذاری پیش‌دستانه صفحه Meta AI درون صف ران‌تایم بلافاصله پس از اجرای سرویس، جهت حذف تاخیر اولیه لود و پاسخ‌دهی فوری به نخستین درخواست‌های کاربر.

- **پشتیبانی کامل از خانواده مدل‌های لاما و استدلال (Llama 3.3 & Thinking Mode):**  
  دسترسی مستقیم و تفکیک‌شده به مدل‌های:
  - `meta/meta-ai`: دستیار عمومی استاندارد Meta AI
  - `meta/llama-3.3-70b`: مدل فوق‌سریع و هوشمند Llama 3.3 70B
  - `meta/llama-3.1-405b`: ابرمدل پرچمدار ۴۰۵ میلیاردی Llama
  - `meta/meta-ai-thinking`: سوییچ خودکار به حالت تفکر عمیق (Reasoning / Thinking Mode)
  - `meta/auto`: مسیریابی و چرخش خودکار مدل

- **مدیریت هوشمند سقف کانتکست (Context Budgeting for AI Agents):**  
  مدیریت خودکار مکالمات طولانی ایجنت‌های کدنویسی (Hermes Agent، Claude Code و Cline) تا سقف ۳۵,۰۰۰ کاراکتر با حفظ پرامپت سیستمی ریشه‌ای و آخرین دورهای تعاملی.

- **استخر چند اکانته و چرخش هوشمند (Multi-Account Connection Pool):**  
  امکان ثبت نامحدود اکانت‌های متا / فیسبوک، نگهداری ایزوله سشن‌ها در فایل‌های `storageState.json`، مدیریت چرخش چرخشی درخواست‌ها (Round-Robin)، و بازیابی خودکار نشست‌ها با مکانیزم Keep-Alive دوره‌ای (هر ۳۰ دقیقه).

- **اعتبارسنجی بلادرنگ توکن و کوکی (Live Session Probe):**  
  ماژول `validate_token.py` جهت اعتبارسنجی خودکار کوکی‌های ورودی (`datr`، `c_user`، `ecto_1_sess`، `abra_sess`) همراه با سیستم کشینگ بر اساس هش SHA-256.

- **یکپارچه‌سازی اختصاصی با 9Router (Seamless Flyout & UI Integration):**  
  پچر اختصاصی هسته Next.js جهت ثبت آیکون اختصاصی گرادیان Meta AI در پنل ۹Router، ایجاد فرم‌های استاندارد و افزودن حساب کاربری با دکمه تست زنده اتصال (**Test Connection**).

- **راه‌اندازی صفر تا صد با یک دستور (Turnkey Automation):**  
  ارائه اسکریپت‌های نصب خودکار `setup.sh`، مدیریت سرویس پس‌زمینه لینوکس `meta-ai-bridge.service`، و سوییت تست جامع سلامت `test-bridge.sh`.

---

## 🏗️ ساختار پروژه (Project Structure)

```
meta-ai-free-bridge/
├── server.ts                 # هسته اصلی سرور وب و استخر مرورگرهای Playwright (Bun)
├── validate_token.py         # موتور اعتبارسنجی سشن و استخراج کوکی‌های متا
├── setup.sh                  # اسکریپت نصب خودکار وابستگی‌ها و سرویس سیستمی لینوکس
├── add-account.sh            # ابزار تعاملی خط فرمان جهت ثبت سریع اکانت جدید
├── register-9router.sh       # اسکریپت جامع اتصال مستقیم به دیتابیس و رجیستر در ۹Router
├── register_db.py            # اسکریپت ثبت ایمن کانکشن و نود در SQLite دیتابیس ۹Router
├── patch-9router-ui.py       # پچر خودکار باندل Next.js برای فعال‌سازی آیکون و ظاهر Meta AI
├── test-bridge.sh            # سوییت تست خودکار جامع بررسی سلامت و استریم زنده
├── extract-token.js          # کد کنسول مرورگر جهت استخراج فوری کوکی‌های سشن
├── accounts.example.json     # قالب نمونه پیکربندی حساب‌های کاربری
├── accounts.json             # محل نگهداری حساب‌های فعال (Ignore در گیت)
├── accounts/                 # پوشه نگهداری نشست‌های مجزا (storage-state)
├── package.json              # تعریف وابستگی‌ها و اسکریپت‌های اجرایی پروژه
└── README.md                 # مستندات کامل فنی و معماری سیستم
```

---

## 🚀 راهنمای سریع نصب و راه‌اندازی (Quick Start)

### ۱. راه‌اندازی با اسکریپت خودکار

```bash
cd /root/projects/meta-ai-free-bridge
./setup.sh
```

### ۲. افزودن اکانت Meta AI

1. در مرورگر خود وارد حساب کاربری در سایت [meta.ai](https://www.meta.ai) شوید.
2. کلید `F12` را زده و تب `Console` را باز کنید.
3. محتوای فایل `extract-token.js` را داخل کنسول پیست کرده و اینتر بزنید تا کوکی‌ها در کلیپ‌بورد کپی شوند.
4. دستور زیر را در ترمینال سرور اجرا نموده و کوکی کپی‌شده را پیست نمایید:
```bash
./add-account.sh
```

### ۳. اتصال به ۹Router

برای ثبت نود جدید در ۹Router و پچ خودکار ظاهر فرانت‌اند:
```bash
./register-9router.sh
```

### ۴. تست و اعتبارسنجی عملکرد

```bash
./test-bridge.sh
```

---

## 🔌 مشخصات اندپوینت‌ها (API Endpoints)

- **پورت پیش‌فرض:** `17843`
- **چت استریم و عادی:** `POST http://127.0.0.1:17843/v1/chat/completions`
- **لیست مدل‌ها:** `GET http://127.0.0.1:17843/v1/models`
- **بررسی سلامت سرویس:** `GET http://127.0.0.1:17843/healthz`
- **لیست اکانت‌ها:** `GET http://127.0.0.1:17843/v1/accounts`
- **اعتبارسنجی توکن:** `POST http://127.0.0.1:17843/v1/accounts/validate`

---

## 📄 لایسنس
توسعه‌یافته به صورت کاملاً متن‌باز و تحت مجوز MIT.
