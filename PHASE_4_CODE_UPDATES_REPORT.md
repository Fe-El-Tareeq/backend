# تقرير تحديثات الكود — Phase 4: Wallet & Token Ledger

## 1. معلومات عامة

- **المرحلة:** Phase 4 — Wallet & Token Ledger
- **الـcommit الرئيسي:** `db13635` — `feature(wallet): complete Phase 4 wallet and token ledger`
- **حالة المرحلة:** مدموجة في فرع `dev` ضمن Pull Request رقم `#8`.
- **حجم التغيير:** 18 ملفًا، بإجمالي 1158 سطرًا مضافًا و56 سطرًا محذوفًا.
- **الهدف:** توفير محفظة وسجل حركات Tokens آمنين وقابلين للاستخدام من الوحدات الداخلية، خصوصًا Errands وTrips.

---

## 2. النتيجة النهائية للمرحلة

أصبح النظام يدعم:

- قراءة رصيد محفظة المستخدم المسجل دخوله.
- قراءة سجل حركات المحفظة مع Pagination.
- تنفيذ عمليات Debit وCredit وRefund داخليًا.
- تسجيل كل تعديل على الرصيد داخل Token Ledger.
- تنفيذ تعديل الرصيد وإنشاء سجل الحركة داخل Database Transaction واحدة.
- قفل صف المحفظة أثناء العملية باستخدام PostgreSQL `FOR UPDATE`.
- منع الرصيد من النزول تحت الصفر.
- منع تكرار العملية من خلال Wallet-scoped Idempotency.
- تسجيل مكافأة إنشاء الحساب كحركة فعلية من نوع `SIGNUP_BONUS`.
- منع العميل من تعديل الرصيد مباشرة عبر API عامة.

---

## 3. تحديثات Wallet API

تم تفعيل مسارات المحفظة تحت:

```text
/api/v1/wallet
```

### 3.1 قراءة المحفظة

```http
GET /api/v1/wallet
```

يعيد بيانات محفظة المستخدم الحالي، ومنها:

- Wallet ID.
- User ID.
- Token balance.
- تاريخ الإنشاء.
- تاريخ آخر تحديث.

### 3.2 قراءة سجل الحركات

```http
GET /api/v1/wallet/transactions
```

يدعم Pagination من خلال:

```http
GET /api/v1/wallet/transactions?skip=0&take=20
```

ويعيد:

- قائمة الحركات مرتبة من الأحدث إلى الأقدم.
- `skip` المستخدم.
- `take` المستخدم.
- العدد الكلي للحركات `total`.

تم تحديد الحد الأعلى لـ`take` بقيمة 100 لمنع الاستعلامات الكبيرة.

### 3.3 حماية المسارات

جميع Wallet routes تستخدم `requireAuth`، ولذلك لا يستطيع المستخدم غير المسجل دخوله قراءة المحفظة أو سجل الحركات.

### 3.4 عدم توفير API عامة لتعديل الرصيد

لم تتم إضافة مسارات عامة مثل:

```http
POST /api/v1/wallet/deduct
POST /api/v1/wallet/credit
```

تعديل الرصيد متاح فقط من خلال Wallet Service الداخلية. هذا يمنع العميل من إرسال طلب مباشر لإضافة Tokens أو خصمها.

---

## 4. التعديلات حسب طبقات الكود

### 4.1 Wallet Route

الملف:

```text
src/features/wallet/wallet.route.js
```

التحديثات:

- إضافة Authentication middleware لجميع المسارات.
- إضافة مسار قراءة المحفظة.
- إضافة مسار قراءة سجل الحركات.
- ربط Validation middleware باستعلام سجل الحركات.

### 4.2 Wallet Controller

الملف:

```text
src/features/wallet/wallet.controller.js
```

التحديثات:

- أخذ `userId` من `req.user.id` بدلًا من استقبال هوية المحفظة من العميل.
- استدعاء Service المناسبة لقراءة المحفظة أو الحركات.
- إرجاع استجابات موحدة باستخدام `ApiResponse`.
- تمرير الأخطاء إلى Error middleware من خلال `next(error)`.

### 4.3 Wallet Validation

الملف:

```text
src/features/wallet/wallet.validation.js
```

تمت إضافة قواعد Zod التالية:

- `skip` عدد صحيح وقيمته لا تقل عن صفر، والقيمة الافتراضية صفر.
- `take` عدد صحيح بين 1 و100، والقيمة الافتراضية 20.
- تحويل Query String إلى أرقام باستخدام `z.coerce.number()`.

### 4.4 Wallet Repository

الملف:

```text
src/features/wallet/wallet.repository.js
```

تمت إضافة عمليات قاعدة البيانات التالية:

- `findWalletByUserId`: قراءة محفظة المستخدم.
- `findTransactionsByWalletId`: قراءة الحركات مع Pagination وترتيب زمني تنازلي.
- `countTransactionsByWalletId`: حساب العدد الكلي للحركات.
- `findByIdempotencyKey`: البحث عن العملية داخل نفس المحفظة.
- `lockWallet`: قفل صف المحفظة باستخدام `SELECT ... FOR UPDATE`.
- `updateBalance`: تحديث الرصيد داخل الـtransaction الحالية.
- `createLedgerEntry`: إنشاء سجل Ledger كامل للعملية.

### 4.5 Wallet Service

الملف:

```text
src/features/wallet/wallet.service.js
```

أصبحت طبقة الخدمة تحتوي على:

- `getWallet`
- `getTransactionHistory`
- `debit`
- `credit`
- `refund`
- التحقق من قيمة Tokens.
- التحقق من تطابق بيانات العملية عند إعادة استخدام Idempotency Key.

---

## 5. Debit وCredit وRefund

### 5.1 Debit

عملية Debit:

1. تتحقق أن قيمة Tokens عدد صحيح موجب.
2. تبدأ Database Transaction إذا لم يتم تمرير Transaction موجودة.
3. تقفل محفظة المستخدم.
4. تبحث عن Idempotency Key داخل نفس المحفظة.
5. تتحقق من كفاية الرصيد.
6. تحسب `balanceBefore` و`balanceAfter`.
7. تحدث الرصيد.
8. تنشئ Ledger Entry داخل نفس Database Transaction.

إذا كان الرصيد غير كافٍ، يتم إرجاع خطأ ولا يتغير الرصيد ولا ينشأ Ledger Entry.

تدعم `debit` تمرير Prisma client موجود، حتى تستطيع وحدات مثل Errands وTrips تضمين عملية الخصم ضمن معاملتها الأكبر.

### 5.2 Credit

عملية Credit تنفذ داخل Database Transaction، وتقفل المحفظة قبل قراءة الرصيد وتحديثه. بعد حساب الرصيد الجديد، يتم تحديث المحفظة وإنشاء Ledger Entry بشكل ذري.

### 5.3 Refund

عملية Refund تستخدم منطق Credit مع:

```text
transactionType = REFUND
```

ويشترط وجود Idempotency Key، لأن إعادة محاولة Refund نفسها يجب ألا تضيف المبلغ أكثر من مرة.

---

## 6. Database Transactions والتزامن

تم تنفيذ التدفق الآمن التالي:

```text
Begin Database Transaction
        ↓
Lock Wallet Row (FOR UPDATE)
        ↓
Check Wallet-Scoped Idempotency
        ↓
Validate Balance and Operation Data
        ↓
Update Wallet Balance
        ↓
Create Ledger Entry
        ↓
Commit
```

إذا فشل تحديث الرصيد أو إنشاء Ledger Entry، تقوم قاعدة البيانات بعمل Rollback للعملية كاملة.

استخدام `FOR UPDATE` يمنع طلبين متزامنين من قراءة الرصيد القديم نفسه ثم الخصم منه مرتين بطريقة غير آمنة.

---

## 7. منع الرصيد السالب

قبل تنفيذ Debit تتم مقارنة:

```text
balanceBefore < amount
```

إذا كانت قيمة الخصم أكبر من الرصيد، يتم إرجاع:

```text
Insufficient token balance
```

ولا يتم تحديث المحفظة أو إنشاء حركة. توجد أيضًا قيود قاعدة بيانات سابقة لحماية رصيد المحفظة من القيم السالبة.

---

## 8. Wallet-Scoped Idempotency

قبل المرحلة كان `idempotencyKey` فريدًا بشكل Global، أي لا تستطيع محفظتان مختلفتان استخدام المفتاح نفسه.

تم تغيير القيد ليصبح المفتاح فريدًا داخل المحفظة فقط:

```text
wallet_id + idempotency_key
```

تم إنشاء Partial Unique Index:

```sql
CREATE UNIQUE INDEX
"wallet_transactions_wallet_id_idempotency_key_key"
ON "wallet_transactions" ("wallet_id", "idempotency_key")
WHERE "idempotency_key" IS NOT NULL;
```

النتيجة:

- يمنع تكرار العملية نفسها داخل المحفظة الواحدة.
- يسمح لمحفظتين مختلفتين باستخدام المفتاح نفسه.
- عند إعادة الطلب بالبيانات نفسها، يتم إرجاع الحركة الموجودة بدل تكرار تعديل الرصيد.
- عند إعادة المفتاح نفسه ببيانات مختلفة، يتم إرجاع HTTP `409 Conflict`.

يتم التحقق من تطابق:

- قيمة Tokens.
- Transaction type.
- Reference type.
- Reference ID.

---

## 9. Token Ledger

كل عملية تعديل رصيد تسجل المعلومات التالية:

- Wallet ID.
- Transaction type.
- Token amount.
- Balance before.
- Balance after.
- Reference type.
- Reference ID.
- Idempotency key.
- Description.
- Payment invoice ID عند توفره.
- Creation timestamp.

بهذا أصبح مصدر كل تغيير على رصيد المستخدم قابلًا للتتبع والمراجعة.

---

## 10. Signup Bonus

تمت إضافة النوع التالي إلى `WalletTransactionType`:

```text
SIGNUP_BONUS
```

تم تعديل Auth Service بحيث عند إنشاء محفظة جديدة:

- يبدأ رصيدها بـ3 Tokens.
- يتم إنشاء Ledger Entry من نوع `SIGNUP_BONUS`.
- يسجل `balanceBefore = 0`.
- يسجل `balanceAfter = 3`.
- يستخدم المرجع `USER` ومعرف المستخدم.
- يستخدم المفتاح `signup-bonus:{userId}`.

إنشاء المحفظة وتسجيل مكافأة التسجيل يحدثان داخل نفس Auth Database Transaction.

يشمل ذلك المستخدم الجديد، وكذلك المستخدم الموثق الموجود مسبقًا إذا لم تكن لديه محفظة.

---

## 11. تحديثات Prisma وMigrations

### 11.1 إصلاح ترتيب Migration History

تم تغيير اسم:

```text
20260810_add_business_constraints
```

إلى:

```text
20260810145855_add_business_constraints
```

السبب أن الاسم القديم احتوى Timestamp قصيرًا، فكان Prisma يعيد تشغيل Business Constraints قبل Initial Migration داخل Shadow Database، وينتج الخطأ:

```text
relation "wallets" does not exist
```

لم يتم تعديل SQL الخاص بالـmigration أو checksum. تم تصحيح اسمها محليًا وفي جدول Supabase `_prisma_migrations` ليبقيا متطابقين.

### 11.2 Wallet Idempotency Migration

تمت إضافة:

```text
20260816201903_wallet_idempotency_scope
```

وظيفتها:

- حذف Global unique index القديم.
- إنشاء Wallet-scoped partial unique index الجديد.

### 11.3 Signup Bonus Migration

تمت إضافة:

```text
20260817074504_add_signup_bonus_transaction_type
```

وظيفتها إضافة `SIGNUP_BONUS` إلى enum الخاص بأنواع حركات المحفظة.

### 11.4 Prisma Schema

تم:

- إضافة `SIGNUP_BONUS` إلى `WalletTransactionType`.
- إزالة `@unique` العام من `idempotencyKey`.
- نقل ضمان uniqueness المركب إلى migration SQL بسبب الحاجة إلى Partial Index عندما تكون القيمة غير فارغة.

### 11.5 Shadow Database

تم تعديل `prisma.config.ts` لاستخدام:

```env
SHADOW_DATABASE_URL
```

واستُخدمت قاعدة PostgreSQL 16 محلية داخل Docker كـShadow Database لإنشاء وفحص migrations دون المساس بقاعدة Supabase الأساسية.

---

## 12. Backup قاعدة Supabase

قبل تطبيق تعديل idempotency تم إنشاء نسخة احتياطية:

```text
D:\fe\backups\supabase-before-wallet-idempotency-2026-08-16.dump
```

معلومات التحقق:

```text
Format: PostgreSQL Custom Dump
TOC entries: 592
SHA-256: ED2A7BCCDF0DA5D6777505E12E696FAA2AB6D140188D570ECFA66F4D2C6AD67A
```

تم التحقق من إمكانية قراءة محتويات النسخة قبل تطبيق migration.

---

## 13. الاختبارات المضافة والمعدلة

تمت إضافة اختبارات تغطي:

- قراءة المحفظة عبر API.
- قراءة سجل الحركات.
- Pagination والقيم غير الصالحة.
- رفض المستخدم غير المسجل دخوله.
- التأكد من عدم وجود POST endpoint عامة للمحفظة.
- Debit وCredit وRefund.
- رفض الخصم عند عدم كفاية الرصيد.
- التحقق من القيم الموجبة الصحيحة للـTokens.
- إعادة المحاولة باستخدام Idempotency Key نفسها.
- رفض المفتاح نفسه عند اختلاف بيانات العملية.
- استخدام المفتاح نفسه في محافظ مختلفة.
- Repository queries.
- Wallet row locking.
- عمليات الخصم المتزامنة.
- إنشاء Signup Bonus ledger entry.
- إنشاء محفظة لمستخدم موثق لا يملك محفظة.

الملفات الجديدة:

```text
tests/wallet.api.test.js
tests/wallet.auth.test.js
tests/wallet.concurrency.test.js
tests/wallet.repository.test.js
tests/wallet.signup-bonus.test.js
tests/wallet.test.js
```

كما تم تحديث `tests/auth.test.js` ليتوافق مع إنشاء Ledger Entry أثناء التسجيل.

---

## 14. نتائج التحقق

آخر تحقق كامل للمرحلة أعطى:

```text
Prisma validation: PASSED
Prisma migrations: 4 migrations found
Database schema: UP TO DATE
Test suites: 9 passed
Tests: 50 passed
Git diff check: PASSED
```

الأوامر المستخدمة:

```powershell
npx prisma validate
npx prisma migrate status
npm test -- --runInBand --forceExit
git diff --check origin/dev...HEAD
```

---

## 15. الملفات التي تغيرت في Phase 4

```text
prisma.config.ts
prisma/schema.prisma
prisma/migrations/20260810145855_add_business_constraints/migration.sql
prisma/migrations/20260816201903_wallet_idempotency_scope/migration.sql
prisma/migrations/20260817074504_add_signup_bonus_transaction_type/migration.sql
src/features/auth/auth.service.js
src/features/wallet/wallet.controller.js
src/features/wallet/wallet.repository.js
src/features/wallet/wallet.route.js
src/features/wallet/wallet.service.js
src/features/wallet/wallet.validation.js
tests/auth.test.js
tests/wallet.api.test.js
tests/wallet.auth.test.js
tests/wallet.concurrency.test.js
tests/wallet.repository.test.js
tests/wallet.signup-bonus.test.js
tests/wallet.test.js
```

---

## 16. ملاحظات تحسين مستقبلية

هذه الملاحظات لا تمنع اكتمال Phase 4، لكنها مفيدة لاحقًا:

- إضافة `SHADOW_DATABASE_URL` إلى `.env.example` لتسهيل إعداد بيئة أعضاء الفريق.
- تشخيص Jest open handles باستخدام `--detectOpenHandles` بدل الاعتماد الدائم على `--forceExit`.
- إلزام الوحدات المستهلكة للخدمة بإرسال Idempotency Key ثابت لكل عملية مالية مهمة، وليس للـRefund فقط.
- دراسة عدم إظهار `idempotencyKey` ضمن الاستجابة العامة لسجل الحركات إذا اعتُبر معلومة داخلية.
- إضافة تحقق أكثر صرامة للعلاقة بين Transaction Type واتجاه العملية Debit/Credit عند توسيع النظام.

---

## 17. الخلاصة

Phase 4 قدمت أساسًا آمنًا للمحفظة وسجل الـTokens. الرصيد لم يعد مجرد قيمة قابلة للتعديل، بل أصبح كل تغيير عليه مرتبطًا بحركة Ledger قابلة للتتبع، ويحدث داخل Database Transaction مع Row Lock وحماية من التكرار والرصيد السالب.

بهذا أصبحت Wallet Service جاهزة للاستخدام الداخلي من Errands وTrips وباقي الوحدات التي تحتاج إلى خصم Tokens أو إضافتها أو إرجاعها بأمان.
