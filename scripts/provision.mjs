/**
 * Idempotent provisioning for the NEW portal only.
 * Makes sharyoof-portal-v2-db if absent; never addresses legacy sharyoof database.
 * Uses the Cloudflare API token only in memory and writes no secrets to files.
 */
import fs from 'node:fs';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const databaseName = 'sharyoof-portal-v2-db';
const placeholder = '00000000-0000-0000-0000-000000000000';
if (!account || !token) {
  console.error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN in GitHub Actions secrets.');
  process.exit(1);
}
if (!/^[a-f\d]{32}$/i.test(account)) {
  console.error('CLOUDFLARE_ACCOUNT_ID must be 32 hex characters.');
  process.exit(1);
}
const apiBase = `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database`;
async function cloudflare(url, options={}) {
  const response=await fetch(url,{...options,headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...(options.headers||{})}});
  const body=await response.json().catch(()=>({}));
  if(!response.ok || body.success!==true){
    const details=(body.errors||[]).map(e=>e.message).join('; ')||`HTTP ${response.status}`;
    throw new Error(`Cloudflare D1 API failed: ${details}`);
  }
  return body;
}
let found;
for(let page=1;page<=30;page++) {
 const result=await cloudflare(`${apiBase}?page=${page}&per_page=100`);
 const entries=Array.isArray(result.result)?result.result:[];
 found=entries.find(v=>v.name===databaseName);
 if(found||entries.length<100)break;
}
if(!found){
 console.log(`Creating independent D1 database: ${databaseName}`);
 const result=await cloudflare(apiBase,{method:'POST',body:JSON.stringify({name:databaseName,primary_location_hint:'apac'})});
 found=result.result;
}
if(!/^[a-f\d-]{36}$/i.test(found?.uuid||''))throw Error('Cloudflare did not return a usable D1 database UUID');
const original=fs.readFileSync('wrangler.toml','utf8');
if(!original.includes(placeholder)||!original.includes('name = "sharyoof-v2"')||!original.includes(`database_name = "${databaseName}"`))throw Error('Unexpected config; refuse to modify another Worker');
fs.writeFileSync('wrangler.generated.toml',original.replace(placeholder,found.uuid));
console.log(`Production Worker: sharyoof-v2; database: ${databaseName}; config ready.`);
