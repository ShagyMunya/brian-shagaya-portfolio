import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';

const requireWrangler=createRequire(await realpath(new URL('../node_modules/wrangler/package.json',import.meta.url)));
const { Miniflare }=requireWrangler('miniflare');
await mkdir(new URL('../.sites-runtime/',import.meta.url),{recursive:true});
const source=await readFile(new URL('../lib/marketplace.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
await writeFile(new URL('../.sites-runtime/marketplace-test.mjs',import.meta.url),compiled);
const { handleMarketRequest,issueAuthCode,hash }=await import('../.sites-runtime/marketplace-test.mjs');
const mf=new Miniflare({modules:true,script:"export default { fetch(){return new Response('test')} }",compatibilityDate:'2026-05-15',d1Databases:['DB'],r2Buckets:['BUCKET']});
let checks=0;
try {
  const DB=await mf.getD1Database('DB'),BUCKET=await mf.getR2Bucket('BUCKET'),env={DB,BUCKET};
  for(const file of (await readdir(new URL('../drizzle/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()) {
    const sql=await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8');
    for(const statement of sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await DB.prepare(statement).run();
  }
  async function api(path,method='GET',data,token,headers={}) {
    const init={method,headers:{...headers}};
    if(token)init.headers.authorization='Bearer '+token;
    if(data!==undefined){init.headers['content-type']='application/json';init.body=JSON.stringify(data);}
    const response=await handleMarketRequest(new Request('https://market.test/api/'+path,init),env);
    return {response,status:response.status,data:response.headers.get('content-type')?.startsWith('application/json')?await response.json():await response.arrayBuffer()};
  }
  function expect(value,target){assert.equal(value,target);checks++;}
  const verifier='v'.repeat(43),state='s'.repeat(32);
  async function account(external) {
    const code=await issueAuthCode(env,external,await hash(verifier),state);
    expect((await api('auth/exchange','POST',{code,verifier:'x'.repeat(43),state})).status,401);
    expect((await api('auth/exchange','POST',{code,verifier,state:'w'.repeat(32)})).status,401);
    const result=await api('auth/exchange','POST',{code,verifier,state});expect(result.status,200);
    expect((await api('auth/exchange','POST',{code,verifier,state})).status,401);
    return result.data;
  }
  expect((await api('health')).status,200);
  expect((await api('listings','POST',{})).status,401);
  expect((await api('me','GET',undefined,undefined,{'oai-authenticated-user-id':'attacker','oai-authenticated-user-email':'attacker@example.test'})).status,401);
  const alice=await account('test-alice'),bob=await account('test-bob');
  expect((await api('listings','POST',{},alice.token)).status,400);
  expect((await api('me','PUT',{display_name:'Alice',whatsapp:'0771234567'},alice.token)).status,400);
  expect((await api('me','PUT',{display_name:'Alice',whatsapp:'+263 77 123 4567'},alice.token)).status,200);
  expect((await api('me','PUT',{display_name:'Bob',whatsapp:'+263771234568'},bob.token)).status,200);
  const photo=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=','base64'));
  const uploaded=await handleMarketRequest(new Request('https://market.test/api/images',{method:'POST',headers:{authorization:'Bearer '+alice.token,'content-type':'image/png'},body:photo}),env);
  expect(uploaded.status,201);const image=(await uploaded.json()).image_id;
  expect((await api('images/'+image)).status,404);
  const listing={title:"Sweet corn 'special'",description:'Fresh local corn, available for collection.',category:'Produce',condition:'Not applicable',currency:'USD',price_minor:1999,location:'Nyazura',image_id:image,status:'active'};
  expect((await api('listings','POST',listing,bob.token)).status,400);
  expect((await api('listings','POST',{...listing,price_minor:1.2},alice.token)).status,400);
  expect((await api('listings','POST',{...listing,price_minor:0},alice.token)).status,400);
  expect((await api('listings','POST',{...listing,category:'invalid'},alice.token)).status,400);
  const created=await api('listings','POST',listing,alice.token);expect(created.status,201);const id=created.data.id;
  expect((await api('images/'+image)).status,200);
  const searched=await api('listings?q='+encodeURIComponent("'special'"));expect(searched.data.listings.length,1);expect(searched.data.listings[0].price_minor,1999);
  expect((await api('listings?q='+encodeURIComponent("x' OR 1=1--"))).data.listings.length,0);
  expect((await api('listings?category=Electronics')).data.listings.length,0);
  expect((await api('listings?location=Rusape')).data.listings.length,0);
  expect((await api('listings/'+id,'PUT',{...listing,title:'Stolen listing'},bob.token)).status,404);
  expect((await api('listings/'+id,'DELETE',undefined,bob.token)).status,404);
  expect((await api('my-listings','GET',undefined,bob.token)).data.listings.length,0);
  expect((await api('listings/'+id,'PUT',{...listing,status:'sold'},alice.token)).status,200);
  expect((await api('listings')).data.listings.length,0);expect((await api('listings/'+id)).data.listing.status,'sold');
  expect((await api('listings/'+id,'PUT',{...listing,status:'active'},alice.token)).status,200);
  const next=await api('listings','POST',{...listing,title:'Groundnuts',image_id:null},alice.token);expect(next.status,201);
  const page1=await api('listings?limit=1'),page2=await api('listings?limit=1&offset=1');expect(page1.data.has_more,true);assert.notEqual(page1.data.listings[0].id,page2.data.listings[0].id);checks++;
  expect((await api('listings/'+id,'DELETE',undefined,alice.token)).status,200);expect((await api('listings/'+id)).status,404);expect((await api('images/'+image)).status,404);
  expect((await api('listings/'+id,'PUT',listing,alice.token)).status,404);
  const badImage=await handleMarketRequest(new Request('https://market.test/api/images',{method:'POST',headers:{authorization:'Bearer '+alice.token,'content-type':'image/jpeg'},body:'<script>invalid image</script>'}),env);expect(badImage.status,400);
  const large=await handleMarketRequest(new Request('https://market.test/api/me',{method:'PUT',headers:{authorization:'Bearer '+alice.token,'content-type':'application/json'},body:JSON.stringify({display_name:'x'.repeat(17000),whatsapp:'+263771234567'})}),env);expect(large.status,413);
  const session=await DB.prepare('SELECT hash FROM sessions WHERE seller_id=?').bind(alice.seller.id).first();assert.notEqual(session.hash,alice.token);checks++;
  const again=await account('test-alice');expect(again.seller.id,alice.seller.id);expect(again.seller.display_name,'Alice');
  await DB.prepare("UPDATE rate_limits SET count=60 WHERE key=?").bind('listing-write:'+alice.seller.id).run();
  expect((await api('listings','POST',{...listing,image_id:null},alice.token)).status,429);
  expect((await api('auth/logout','POST',undefined,bob.token)).status,200);expect((await api('me','GET',undefined,bob.token)).status,401);
  const down=await handleMarketRequest(new Request('https://market.test/api/listings'),{DB:null,BUCKET:null});expect(down.status,503);
  console.log(JSON.stringify({checks,result:'passed',coverage:'PKCE, replay, sessions, profiles, image ownership, listing ownership, exact prices, filters, pagination, sold and removed states, body limits, rate limits, storage errors'}));
} finally { await mf.dispose(); }
