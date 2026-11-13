import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {passwordMatches, validateItem} from '../src/worker.js';
import worker from '../src/worker.js';

const schema=readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8');
const PASSWORD='a-Test-Password_2026!';
const url='https://sharyoof-v2.example';
function env(){
 const db=new DatabaseSync(':memory:');db.exec(schema);
 const binding={prepare(sql){const statement=db.prepare(sql);let args=[];
  const query={bind(...values){args=values;return query;},first(){return statement.get(...args)},all(){return {results:statement.all(...args)};},run(){const result=statement.run(...args);return {meta:{changes:result.changes}}}};
  return query;}};
 return {DB:binding,ADMIN_PASSWORD:PASSWORD,ASSETS:{fetch:async()=>new Response('index html')}};
}
function call(e,path,method='GET',body,opts={}){
 const headers={...opts.headers};
 if(body!==undefined&&!opts.multipart)headers['content-type']='application/json';
 return worker.fetch(new Request(url+path,{method,headers,body:body===undefined?undefined:opts.multipart?body:JSON.stringify(body)}),e);
}
const item={type:'program',title:'برنامج شريوف',summary:'أربع نسخ مختلفة',slug:'sharyoof-test',cover:'',payload:{version:'1.0',x86p:'https://example.com/p.exe',x86i:'https://example.com/i.exe',x64p:'https://example.com/p64.exe',x64i:'https://example.com/i64.exe',notes:''},published:false};

test('Password matching and valid product links are checked without hardcoding credentials',async()=>{
 assert.equal(await passwordMatches(PASSWORD,PASSWORD),true);
 assert.equal(await passwordMatches('not-correct',PASSWORD),false);
 assert.equal(validateItem(item),'');
 assert.notEqual(validateItem({...item,payload:{...item.payload,x64p:'javascript:alert(1)'}}),'');
 assert.notEqual(validateItem({...item,cover:'data:text/html,test'}),'');
});
test('Independent portal health and initial site are available',async()=>{
 const e=env();const health=await (await call(e,'/api/health')).json();
 assert.deepEqual(health,{ok:true,db:true,configured:true});
 const home=await (await call(e,'/api/site')).json();
 assert.equal(home.items.length,0);assert.equal(home.site.title,'بوابة شريوف');
 delete e.ADMIN_PASSWORD;
 assert.equal((await (await call(e,'/api/health')).json()).configured,false);
 assert.equal((await call(e,'/api/auth/login','POST',{username:'admin',password:PASSWORD})).status,503);
});
test('Login, signed session, CSRF, CRUD, public filtering and logout',async()=>{
 const e=env();
 assert.equal((await call(e,'/api/admin/session')).status,401);
 assert.equal((await call(e,'/api/auth/login','POST',{username:'admin',password:'wrong'})).status,401);
 const login=await call(e,'/api/auth/login','POST',{username:'admin',password:PASSWORD});assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 assert.match(cookie,/sharyoof_v2_session=/);
 const head={cookie};
 const session=await (await call(e,'/api/admin/session','GET',undefined,{headers:head})).json();
 assert.equal(session.authenticated,true);assert.ok(session.csrf);
 assert.equal((await call(e,'/api/admin/items','POST',item,{headers:head})).status,403);
 const secure={cookie,'x-csrf-token':session.csrf};
 assert.equal((await call(e,'/api/admin/items','POST',item,{headers:{...secure,origin:'https://malicious.example'}})).status,403);
 const created=await call(e,'/api/admin/items','POST',item,{headers:secure});assert.equal(created.status,201);
 const id=(await created.json()).id;
 assert.equal((await (await call(e,'/api/site')).json()).items.length,0);
 assert.equal((await call(e,'/api/admin/items/'+id,'PUT',{...item,published:true},{headers:secure})).status,200);
 assert.equal((await (await call(e,'/api/site')).json()).items.length,1);
 assert.equal((await call(e,'/api/admin/settings','PUT',{title:'بوابة شريوف الجديدة',tagline:'جاهزة',contact:'https://example.com'},{headers:secure})).status,200);
 assert.equal((await (await call(e,'/api/site')).json()).site.title,'بوابة شريوف الجديدة');
 assert.equal((await call(e,'/api/admin/items/'+id,'DELETE',undefined,{headers:secure})).status,200);
 assert.equal((await (await call(e,'/api/site')).json()).items.length,0);
 assert.equal((await call(e,'/api/auth/logout','POST')).status,200);
});
test('Five failed attempts trigger 15-minute lockout without bypass',async()=>{
 const e=env();for(let i=0;i<5;i++)assert.equal((await call(e,'/api/auth/login','POST',{username:'admin',password:'bad'})).status,401);
 assert.equal((await call(e,'/api/auth/login','POST',{username:'admin',password:PASSWORD})).status,429);
});
test('Image magic bytes are checked before D1 storage',async()=>{
 const e=env();const login=await call(e,'/api/auth/login','POST',{username:'admin',password:PASSWORD});const cookie=login.headers.get('set-cookie').split(';')[0];
 const auth=await (await call(e,'/api/admin/session','GET',undefined,{headers:{cookie}})).json();
 const form=new FormData();form.append('file',new File(['not a real image'],'fake.png',{type:'image/png'}));
 const response=await call(e,'/api/admin/images','POST',form,{multipart:true,headers:{cookie,'x-csrf-token':auth.csrf}});
 assert.equal(response.status,415);
});
test('Valid small image uploads to separate D1 and serves with safe image headers',async()=>{
 const e=env();
 const login=await call(e,'/api/auth/login','POST',{username:'admin',password:PASSWORD});
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const current=await (await call(e,'/api/admin/session','GET',undefined,{headers:{cookie}})).json();
 const bytes=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,73,69,78,68]);
 const form=new FormData();form.append('file',new File([bytes],'image.png',{type:'image/png'}));
 const res=await call(e,'/api/admin/images','POST',form,{multipart:true,headers:{cookie,'x-csrf-token':current.csrf}});
 assert.equal(res.status,201);
 const upload=await res.json();
 assert.match(upload.url,/^\/api\/media\/[a-f0-9-]{36}$/);
 const img=await call(e,upload.url);
 assert.equal(img.status,200);
 assert.equal(img.headers.get('content-type'),'image/png');
 assert.deepEqual(new Uint8Array(await img.arrayBuffer()),bytes);
 assert.equal(validateItem({...item,payload:{...item.payload,gallery:upload.url}}),'');
 assert.notEqual(validateItem({...item,payload:{...item.payload,gallery:'javascript:evil()'}}),'');
});
