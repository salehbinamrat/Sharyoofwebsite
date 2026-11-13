# بوابة شريوف — النسخة الجديدة V2

**مشروع مستقل تماما** عن بوابة شريوف القديمة. اسم Worker هو `sharyoof-v2`، وقاعدة البيانات `sharyoof-portal-v2-db`، ولا يستخدم أي قاعدة بيانات أو أسرار تخص `sharyoof` القديم.

## الوظائف

- موقع عربي RTL متجاوب للبرامج وصفحات الهوتسبوت وشروحات الفيديو.
- لوحة إدارة لإضافة/تعديل/حذف ونشر العناصر وإدارة روابط التنزيل.
- أربع روابط لإصدارات ويندوز: x86 Portable وx86 Installer وx64 Portable وx64 Installer.
- رفع صورة رئيسية ومعرض صور متعدد للمشروع من لوحة الإدارة إلى D1 مباشرة (PNG/JPEG/WebP/GIF حتى 700 كيلوبايت). لا تحتاج إلى GitHub Token للصور.
- تنزيل ملفات البرامج الكبيرة من روابط GitHub Releases أو روابط HTTPS موثوقة.
- تسجيل دخول باسم `admin` وسر Cloudflare واحد فقط: **`ADMIN_PASSWORD`**، ولا يوجد رمز تجزئة `ADMIN_PASSWORD_HASH` ولا `SESSION_SECRET` في هذه النسخة.
- جلسة آمنة HttpOnly/Secure/SameSite، وتوقيع HMAC، والتحقق من CSRF، وحظر مؤقت بعد خمس محاولات فاشلة في 15 دقيقة.
- اتصال SQLite D1 مستقل ونسخ العناصر والمسودات ضمن القاعدة الجديدة.

## شرط الأمان الرئيسي

**لا تكتب كلمة مرور المدير في الكود، ولا في GitHub، ولا في wrangler.toml.** ضَعها داخل Secret لدى GitHub Actions تحت الاسم `PORTAL_ADMIN_PASSWORD`. تقوم عملية النشر بإرسالها بصورة آمنة إلى Cloudflare Worker Secret باسم `ADMIN_PASSWORD`. تغيير كلمة المرور في GitHub Secret يتطلب تشغيل النشر مجددا.

> كلمة المرور التي ظهرت في محادثة سابقة ليست سرية بعد الآن. يُنصح باستبدالها بكلمة مرور جديدة وفريدة قبل فتح الموقع للعامة.

## إعداد المستودع الجديد (دون مساس بالقديم)

1. أنشئ مستودعا مستقلا باسم `sharyoof-portal-v2` في حساب GitHub الصحيح، ثم ارفع **محتويات** حزمة المشروع إليه بحيث يكون `package.json` في جذر المستودع.
2. في المستودع الجديد فقط، افتح `Settings → Secrets and variables → Actions → New repository secret` وأضف ثلاثة Secrets:
   - `CLOUDFLARE_ACCOUNT_ID`: معرف حساب Cloudflare الذي يملك Worker الجديد.
   - `CLOUDFLARE_API_TOKEN`: رمز API بصلاحيات حساب **Workers Scripts Edit** و**D1 Write** على الحساب المعني.
   - `PORTAL_ADMIN_PASSWORD`: كلمة مرور المدير الجديدة، 12 حرفا على الأقل.
3. افتح `Actions` وشغّل workflow باسم **Sharyoof V2 - Test First and Deploy**، أو ارفع التغييرات إلى `main` لتشغيله تلقائيا.
4. تعمل `Site Core` و`Site Release` بالتوازي على نفس الالتزام. بعد نجاح الاثنين فقط تبدأ مهمة النشر. تنشئ مهمة النشر قاعدة البيانات الجديدة تلقائيا (إن لم تكن موجودة)، تطبق migrations عليها، تنشر Worker الجديد، ثم تحفظ كلمة المرور سرا.
5. راجع عنوان Worker `sharyoof-v2` الذي يظهر في سجل النشر. افتح `/api/health` وتأكد من `ok:true, db:true, configured:true`. افتح `/#admin` وسجل الدخول باسم `admin` وكلمة المرور المحفوظة في `PORTAL_ADMIN_PASSWORD`.
6. **لا تحذف Worker `sharyoof` القديم ولا قاعدة `sharyoof-portal-db`** إلا بعد موافقتك وبعد التحقق من النسخة الجديدة ونقل المحتويات إن أردت.

### اختبار محلي (لا يتطلب Cloudflare)

```bash
npm install
npm run check
npm test
```

### تشغيل محلي مع D1

يمكن تشغيل `wrangler dev` بعد توليد `wrangler.generated.toml` بواسطة `npm run provision` في بيئة Cloudflare ذات صلاحية، ثم استخدام `npx wrangler d1 migrations apply sharyoof-portal-v2-db --local --config wrangler.generated.toml` و`npx wrangler dev --config wrangler.generated.toml`. ملف `wrangler.generated.toml` غير محفوظ في Git.

### فحص التشغيل

- `/api/health`: يتحقق من اتصال D1 ووجود كلمة مرور بطول مناسب فقط؛ **لا يتحقق من صحتها**.
- `/#admin`: يسمح بالدخول والتعديل بعد التحقق الفعلي من السر والحماية ضد المحاولات المتكررة.
- `/#programs`, `/#hotspot`, `/#videos`: عرض المحتوى المنشور.

## ملاحظات مهمة

- لا تعتمد النشر لمجرد ظهور `configured:true`؛ اختبر تسجيل الدخول وإضافة مشروع مسودة ونشره.
- العروض المرئية تتصل بقاعدة بيانات فارغة جديدة. لا تُنقل بيانات المشروع السابق تلقائيا.
- لا تستخدم روابط worker القديم عند التحقق من النسخة الجديدة.
- الصور المخزنة في D1 مناسبة لأحجام صغيرة فقط؛ للصور الكبيرة أو ملفات البرامج استخدم تخزين روابط خارجية.
- لفصل التجربة عن الإنتاج، افتح طلب Pull Request أولا، ولا تدمجه في `main` إلا بعد نجاح `Site Core` و`Site Release`. يتحقق النشر الإنتاجي بعد الدمج ويجب مراجعته كذلك.
