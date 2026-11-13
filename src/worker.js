/* Sharyoof Portal v2 — independent Cloudflare Worker, no legacy secrets. */
const ENCODER = new TextEncoder();
const MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const TYPES = new Set(['program', 'hotspot', 'video']);
const MAX_IMAGE = 700_000;
const RESPONSE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
};
const json = (value, status=200, headers={}) => new Response(JSON.stringify(value),{status,headers:{...RESPONSE_HEADERS,...headers}});
const error = (status, text) => json({error:text}, status);
const asB64 = bytes => btoa(String.fromCharCode(...bytes));
const fromB64 = s => Uint8Array.from(atob(s), ch=>ch.charCodeAt(0));
const b64url = bytes => asB64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64url = s => fromB64(s.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-s.length%4)%4));
const equal = (a,b) => {let difference=a.length ^ b.length; for(let i=0;i<Math.max(a.length,b.length);i++)difference |= (a[i]||0) ^ (b[i]||0);return difference===0;};
const digest = async data => new Uint8Array(await crypto.subtle.digest('SHA-256',ENCODER.encode(data)));

export async function passwordMatches(input, secret) {
 if(typeof input!=='string'||typeof secret!=='string'||!secret)return false;
 if(input.length>256)return false;
 return equal(await digest(input),await digest(secret));
}
function signingSecret(env) { return 'sharyoof-portal-v2/session/v1\0'+env.ADMIN_PASSWORD; }
async function sign(env, data){
 const key=await crypto.subtle.importKey('raw',ENCODER.encode(signingSecret(env)),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return new Uint8Array(await crypto.subtle.sign('HMAC',key,ENCODER.encode(data)));
}
async function createSession(env){
 const payload = {user:'admin',exp:Math.floor(Date.now()/1000)+28800,csrf:crypto.randomUUID()};
 const body = b64url(ENCODER.encode(JSON.stringify(payload)));
 return body+'.'+b64url(await sign(env,body));
}
async function session(req,env){
 if(!env.ADMIN_PASSWORD)return null;
 const found=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('sharyoof_v2_session='));
 if(!found)return null;
 const parts=found.slice('sharyoof_v2_session='.length).split('.');
 if(parts.length!==2||parts[0].length>1000||parts[1].length>100)return null;
 try{
  if(!equal(unb64url(parts[1]),await sign(env,parts[0])))return null;
  const value=JSON.parse(new TextDecoder().decode(unb64url(parts[0])));
  if(value.user!=='admin'||!Number.isInteger(value.exp)||value.exp<=Date.now()/1000||typeof value.csrf!=='string')return null;
  return value;
 } catch {return null;}
}
function validHttps(value){
 if(value==='')return true;
 if(typeof value!=='string'||value.length>2048)return false;
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}
}
export function validateItem(value){
 if(!value||typeof value!=='object'||!TYPES.has(value.type))return 'نوع العنصر غير صالح';
 if(typeof value.title!=='string'||value.title.trim().length<2||value.title.length>150)return 'عنوان العنصر غير صالح';
 if(typeof value.summary!=='string'||value.summary.length>3000)return 'الوصف غير صالح';
 if(value.slug && (typeof value.slug!=='string'||!/^[-a-z0-9]{2,90}$/.test(value.slug)))return 'المعرف يجب أن يكون إنجليزيا';
 if(typeof value.cover!=='string'||(value.cover!==''&&!/^\/api\/media\/[a-f0-9-]{36}$/.test(value.cover)&&!validHttps(value.cover)))return 'رابط الصورة غير صالح';
 if(!value.payload||typeof value.payload!=='object'||Array.isArray(value.payload)||JSON.stringify(value.payload).length>12000)return 'بيانات العنصر غير صالحة';
 for(const [key,entry] of Object.entries(value.payload)) {
  if(typeof entry!=='string'||entry.length>3000)return 'بيانات الحقول غير صالحة';
  if(['x86p','x86i','x64p','x64i','preview','zip','youtube'].includes(key)&&!validHttps(entry))return 'رابط تنزيل أو معاينة غير صالح';
  if(key==='gallery'&&entry.split('\n').filter(Boolean).some(link=>!/^\/api\/media\/[a-f0-9-]{36}$/.test(link.trim())&&!validHttps(link.trim())))return 'رابط في معرض الصور غير صالح';
 }
 return '';
}
function normalize(row) {return {...row,published:!!row.published,payload:JSON.parse(row.payload||'{}')};}
function secureOrigin(req){const source=req.headers.get('origin');return !source||source===new URL(req.url).origin;}
async function parseJson(req){if(Number(req.headers.get('content-length')||0)>24000)throw Error('too_big');const value=await req.json();if(!value||typeof value!=='object'||Array.isArray(value))throw Error('bad_json');return value;}
function goodImage(mime,bytes){
 if(mime==='image/png')return bytes.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
 if(mime==='image/jpeg')return bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(mime==='image/gif')return bytes.length>=6&&String.fromCharCode(...bytes.slice(0,6)).match(/^GIF8[79]a$/)!==null;
 if(mime==='image/webp')return bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 return false;
}
const seal = cookie => `sharyoof_v2_session=${cookie}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800`;
const erase = 'sharyoof_v2_session=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0';

async function api(req,env,path){
 const method=req.method;
 if(path==='/api/health' && method==='GET')return json({ok:true,db:!!env.DB,configured:typeof env.ADMIN_PASSWORD==='string'&&env.ADMIN_PASSWORD.length>=12});
 if(!env.DB)return error(503,'قاعدة بيانات البوابة الجديدة غير مهيأة');
 if(path==='/api/site'&&method==='GET'){
  const [site,items]=await Promise.all([
   env.DB.prepare('SELECT title,tagline,contact FROM site_settings WHERE id=1').first(),
   env.DB.prepare('SELECT * FROM items WHERE published=1 ORDER BY updated_at DESC LIMIT 250').all()
  ]);
  return json({site:site||{title:'بوابة شريوف',tagline:'',contact:''},items:(items.results||[]).map(normalize)});
 }
 if(path==='/api/auth/login'&&method==='POST'){
  if(!secureOrigin(req))return error(403,'مصدر الطلب غير مسموح');
  if(typeof env.ADMIN_PASSWORD!=='string'||env.ADMIN_PASSWORD.length<12)return error(503,'أضف سر ADMIN_PASSWORD أولا في إعدادات Worker');
  const ip=(req.headers.get('cf-connecting-ip')||'local').slice(0,64);
  const now=Math.floor(Date.now()/1000);
  const attempt=await env.DB.prepare('SELECT failures,window_start FROM login_attempts WHERE ip=?').bind(ip).first();
  if(attempt&&now-attempt.window_start<900&&attempt.failures>=5)return error(429,'محاولات كثيرة. أعد المحاولة بعد 15 دقيقة');
  let values;try{values=await parseJson(req);}catch{return error(400,'البيانات المدخلة غير صالحة');}
  const matched=values.username==='admin'&&await passwordMatches(values.password,env.ADMIN_PASSWORD);
  if(!matched){
   await env.DB.prepare('INSERT INTO login_attempts(ip,failures,window_start) VALUES (?,1,?) ON CONFLICT(ip) DO UPDATE SET failures=CASE WHEN ?-window_start>=900 THEN 1 ELSE failures+1 END,window_start=CASE WHEN ?-window_start>=900 THEN ? ELSE window_start END').bind(ip,now,now,now,now).run();
   return error(401,'اسم المستخدم أو كلمة المرور غير صحيحة');
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE ip=?').bind(ip).run();
  const token=await createSession(env);
  return json({ok:true},200,{'set-cookie':seal(token)});
 }
 if(path==='/api/auth/logout'&&method==='POST')return json({ok:true},200,{'set-cookie':erase});
 const media=path.match(/^\/api\/media\/([a-f0-9-]{36})$/);
 if(media&&method==='GET'){
  const file=await env.DB.prepare('SELECT mime,data FROM images WHERE id=?').bind(media[1]).first();
  if(!file)return error(404,'الصورة غير موجودة');
  return new Response(new Uint8Array(file.data),{headers:{'content-type':file.mime,'cache-control':'public, max-age=86400','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"}});
 }
 if(!path.startsWith('/api/admin/'))return error(404,'المسار غير موجود');
 const current=await session(req,env);
 if(!current)return error(401,'يلزم تسجيل الدخول إلى الإدارة');
 if(path==='/api/admin/session'&&method==='GET')return json({authenticated:true,csrf:current.csrf});
 if(method!=='GET'&&(!secureOrigin(req)||req.headers.get('x-csrf-token')!==current.csrf))return error(403,'تعذر تأكيد الجلسة. أعد تسجيل الدخول');
 if(path==='/api/admin/items'&&method==='GET'){
  const list=await env.DB.prepare('SELECT * FROM items ORDER BY updated_at DESC LIMIT 500').all();
  return json({items:(list.results||[]).map(normalize)});
 }
 if(path==='/api/admin/items'&&method==='POST'){
  let value;try{value=await parseJson(req)}catch{return error(400,'بيانات العنصر غير صالحة')}
  const invalid=validateItem(value);if(invalid)return error(400,invalid);
  const id=crypto.randomUUID();const slug=value.slug||'item-'+id.slice(0,12);
  try{
   await env.DB.prepare('INSERT INTO items (id,type,slug,title,summary,cover,payload,published) VALUES (?,?,?,?,?,?,?,?)').bind(id,value.type,slug,value.title.trim(),value.summary,value.cover,JSON.stringify(value.payload),value.published?1:0).run();
   return json({id},201);
  }catch{return error(409,'معرف العنصر مستخدم من قبل')}
 }
 const target=path.match(/^\/api\/admin\/items\/([a-f0-9-]{36})$/);
 if(target&&method==='PUT'){
  let value;try{value=await parseJson(req)}catch{return error(400,'بيانات العنصر غير صالحة')}
  const invalid=validateItem(value);if(invalid)return error(400,invalid);
  try{
   const result=await env.DB.prepare('UPDATE items SET type=?,slug=?,title=?,summary=?,cover=?,payload=?,published=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(value.type,value.slug||target[1],value.title.trim(),value.summary,value.cover,JSON.stringify(value.payload),value.published?1:0,target[1]).run();
   return result.meta.changes?json({ok:true}):error(404,'العنصر غير موجود');
  }catch{return error(409,'معرف العنصر مستخدم من قبل')}
 }
 if(target&&method==='DELETE'){
  const result=await env.DB.prepare('DELETE FROM items WHERE id=?').bind(target[1]).run();
  return result.meta.changes?json({ok:true}):error(404,'العنصر غير موجود');
 }
 if(path==='/api/admin/settings'&&method==='PUT'){
  let val;try{val=await parseJson(req)}catch{return error(400,'الإعدادات غير صالحة')}
  const site={title:String(val.title||'بوابة شريوف').slice(0,100),tagline:String(val.tagline||'').slice(0,190),contact:String(val.contact||'').slice(0,2048)};
  if(!validHttps(site.contact))return error(400,'رابط التواصل يجب أن يبدأ بـ HTTPS');
  await env.DB.prepare('UPDATE site_settings SET title=?,tagline=?,contact=? WHERE id=1').bind(site.title,site.tagline,site.contact).run();
  return json({ok:true});
 }
 if(path==='/api/admin/images'&&method==='POST'){
  if(!String(req.headers.get('content-type')||'').includes('multipart/form-data'))return error(415,'اختر صورة للرفع');
  if(Number(req.headers.get('content-length')||0)>MAX_IMAGE+12000)return error(413,'الصورة تتجاوز 700 كيلوبايت');
  const form=await req.formData();const file=form.get('file');
  if(!(file instanceof File)||!MIME[file.type]||!file.size||file.size>MAX_IMAGE)return error(413,'اختر صورة PNG أو JPG أو WebP أو GIF بحجم أقل من 700 كيلوبايت');
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(!goodImage(file.type,bytes))return error(415,'محتوى الصورة غير صالح');
  const id=crypto.randomUUID();
  await env.DB.prepare('INSERT INTO images(id,mime,data) VALUES (?,?,?)').bind(id,file.type,bytes).run();
  return json({url:'/api/media/'+id,id},201);
 }
 return error(404,'المسار غير موجود');
}
export default {async fetch(req,env){
 try{
  const path=new URL(req.url).pathname;
  if(path.startsWith('/api/'))return await api(req,env,path);
  if(!env.ASSETS)return error(503,'أصول الموقع غير متوفرة');
  const response=await env.ASSETS.fetch(req);
  const headers=new Headers(response.headers);
  headers.set('x-content-type-options','nosniff');
  headers.set('referrer-policy','strict-origin-when-cross-origin');
  headers.set('x-frame-options','DENY');
  return new Response(response.body,{status:response.status,headers});
 }catch(e){console.error('Worker request error',String(e?.message||e));return error(500,'حدث خطأ داخلي في البوابة');}
}};
