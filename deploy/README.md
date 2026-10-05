# Imalissa — Live deploy (Bangla)

InfinityFree শুধু PHP shared hosting → Node/`next start` সেখানে চলে না। তাই
সাইট যাবে **Render**-এ (ফ্রি, কার্ড লাগে না) এবং MySQL থাকবে **Aiven**-এ
(always-free, কার্ড লাগে না)। আপনার `imalissa.page.gd` পরে এই সাইটে
CNAME দিয়ে দেখাবে।

## যা একবার লাগবে (আপনার পক্ষ থেকে)

1. **Git** — পিসিতে install (আমি করে দেব, অনুমতি দিলে)।
2. **GitHub** account (ফ্রি) — কোড ওখানে যাবে।
3. **Render** account (ফ্রি, github দিয়ে sign up) — <https://render.com>
4. **Aiven** account (ফ্রি, কার্ড ছাড়া) — <https://aiven.io/free-mysql-database>
   → MySQL service খুলবেন, Host/Port/User/Password কপি করবেন।

## যা আমি করব (আপনি credentials দিলেই)

1. `git init` + commit + GitHub-এ push (যদি আমাকে access দেন)।
2. Aiven MySQL-এ **schema** (`prisma db push`) + **সব data import**
   (ডাটাবেজ মাত্র 2.4 MB — dump বানিয়ে import করব)।
3. `render.yaml` অনুযায়ী Render service তৈরির ধাপ + env bulk paste
   (`deploy/render-env.txt` — লোকাল file, git-ignored, দরকার না হলে মুছে দেবেন)।
4. Deploy হলে **পুরো verify**: home/checkout/admin/login সব API + Telegram
   order alert (Chat ID দিলে) — একটাও ভুল success দেখাব না।

## Deploy ধাপ (এক নজরে)

| # | কে | কী |
|---|---|---|
| 1 | আপনি | GitHub + Render + Aiven অ্যাকাউন্ট খুলবেন |
| 2 | আপনি | Aiven-এর Host/Port/User/Password + Render-এর রেপো দেবেন |
| 3 | আমি | DB dump বানিয়ে Aiven-এ import + `DATABASE_URL` বসাব |
| 4 | আপনি | Render → New Web Service → রেপো সিলেক্ট → env paste → Create |
| 5 | আমি | লাইভ URL দিয়ে `NEXT_PUBLIC_SITE_URL` ঠিক করে পুরো verify |
| 6 | আপনি | (optional) `imalissa.page.gd` DNS → CNAME `imalissa.onrender.com` |
| 7 | আপনি | লাইভ Admin → Settings → Telegram → Title + Chat ID → Save |

## জানে রাখবেন (ফ্রি tier-এর সীমা)

- Render free: ১৫ মিনিট idle হলে ঘুমায় → প্রথম ভিজিটে ~৪০–৫০ সেকেন্ড wake।
- Runtime-এ করা upload (`public/uploads`) পরের deploy-এ মুছে যায় — তাই
  আপলোড করা সব image রিপোতে commit করে রাখা হয়েছে (`.gitignore` ঠিক করা)।
- লোকাল (localhost:3000) সাইট আগের মতোই চলবে — deploy করলেও নষ্ট হবে না।
