import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Fresh portal cannot overwrite legacy Worker or D1 database',()=>{
 const cfg=read('wrangler.toml');
 assert.match(cfg,/^name = "sharyoof-v2"$/m);
 assert.match(cfg,/^database_name = "sharyoof-portal-v2-db"$/m);
 assert.doesNotMatch(cfg,/database_name = "sharyoof-portal-db"/);
 assert.match(cfg,/^keep_vars = true$/m);
 assert.match(read('scripts/provision.mjs'),/sharyoof-portal-v2-db/);
});
test('Test-first core/release run in parallel; deployment waits for both',()=>{
 const workflow=read('.github/workflows/ci.yml');
 assert.match(workflow,/site-core:/);assert.match(workflow,/site-release:/);
 assert.match(workflow,/needs: \[site-core,site-release\]/);
 assert.match(workflow,/npm run build/);assert.match(workflow,/PORTAL_ADMIN_PASSWORD/);
 assert.match(workflow,/secret put ADMIN_PASSWORD/);
});
