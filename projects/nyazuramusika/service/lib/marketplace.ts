import { beginGoogleLogin, finishGoogleLogin, googleConfigured, googleReturnPage, GoogleAuthError, type GoogleIdentity, type GoogleSettings } from "./google-auth";
export type MarketEnv = GoogleSettings & { DB: D1Database; BUCKET: R2Bucket; TURN_KEY_ID?: string; TURN_API_TOKEN?: string };
export const ROLES = ["user", "seller", "admin"];
export const CATEGORIES = ["Produce", "Electronics", "Clothing", "Home & furniture", "Farm supplies", "Vehicles & parts", "Other"];
export const CURRENCIES = ["USD", "ZiG", "ZAR"];
const CONDITIONS = ["New", "Used", "Not applicable"];
const DAY = 86_400_000;
const encoder = new TextEncoder();
class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export function rawDb(env: MarketEnv): D1Database {
  if (!env.DB) throw new ApiError(503, "The marketplace is temporarily unavailable. Please try again.");
  return env.DB;
}
export function base64url(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
function randomToken(): string { return base64url(crypto.getRandomValues(new Uint8Array(32))); }
export async function hash(value: string): Promise<string> { return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(value)))); }
export function validateConnect(challenge: string,state: string): boolean { return /^[A-Za-z0-9_-]{43}$/.test(challenge)&&/^[A-Za-z0-9_-]{20,64}$/.test(state); }

// Called only after server-side Google signature, audience, expiry and nonce verification.
// Client-supplied email, role and identity headers never create an account.
export async function issueAuthCode(env: MarketEnv,identity: GoogleIdentity,challenge: string,state: string): Promise<string> {
  if (!identity.sub || !validateConnect(challenge,state)) throw new ApiError(400,"Start sign-in from the Android app.");
  const db=rawDb(env),now=Date.now();
  const externalId=`google:${identity.sub}`;
  const adminEmails=(env.ADMIN_GOOGLE_EMAILS||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
  const initialRole=identity.authoritativeEmail&&adminEmails.includes(identity.email)?"admin":"user";
  await db.prepare("INSERT INTO sellers (id,external_id,display_name,email,auth_provider,role,account_status,created_at) VALUES (?,?,?,?, 'google',?, 'active',?) ON CONFLICT(external_id) DO NOTHING")
    .bind(crypto.randomUUID(),externalId,identity.name,identity.email,initialRole,now).run();
  const seller=await db.prepare("SELECT id,account_status FROM sellers WHERE external_id=? AND auth_provider='google'").bind(externalId).first<{id:string;account_status:string}>();
  if (!seller) throw new ApiError(503,"Unable to complete sign-in. Please try again.");
  if(seller.account_status!=="active")throw new ApiError(403,"Your account is suspended. Contact the app owner.");
  await db.prepare("UPDATE sellers SET email=? WHERE id=?").bind(identity.email,seller.id).run();
  const code=randomToken();
  await db.batch([
    db.prepare("DELETE FROM auth_codes WHERE expires_at<?").bind(now), db.prepare("DELETE FROM sessions WHERE expires_at<?").bind(now),
    db.prepare("INSERT INTO auth_codes (hash,seller_id,challenge,state,expires_at) VALUES (?,?,?,?,?)").bind(await hash(code),seller.id,challenge,state,now+120_000),
  ]);
  return code;
}
function json(data: unknown,status=200): Response { return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}}); }
async function readLimited(request: Request,limit: number): Promise<Uint8Array> {
  if (Number(request.headers.get("content-length")||0)>limit) throw new ApiError(413,"The request is too large.");
  if (!request.body) return new Uint8Array();
  const reader=request.body.getReader(),parts: Uint8Array[]= [];let length=0;
  try { while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();throw new ApiError(413,"The request is too large.");}parts.push(value);} }
  finally { reader.releaseLock(); }
  const result=new Uint8Array(length);let offset=0;for(const part of parts){result.set(part,offset);offset+=part.byteLength;}return result;
}
async function body(request: Request): Promise<Record<string,unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ApiError(415,"Send JSON content.");
  let result;try{result=JSON.parse(new TextDecoder().decode(await readLimited(request,16_384)));}catch(error){if(error instanceof ApiError)throw error;throw new ApiError(400,"The request could not be read.");}
  if(!result||typeof result!=="object"||Array.isArray(result))throw new ApiError(400,"Send a JSON object.");return result;
}
function rejectWalletSecrets(data: Record<string,unknown>): void {
  if(Object.keys(data).some(key=>/^(pin|wallet_pin|ecocash_pin|otp|password)$/i.test(key)))throw new ApiError(400,"Enter your wallet PIN only in EcoCash. NyazuraMusika does not accept wallet credentials.");
}
function ecocashPhone(value: unknown): string {const phone=normalizePhone(value);if(!/^\+2637[78][0-9]{7}$/.test(phone))throw new ApiError(400,"Enter an EcoCash receiving number starting with +26377 or +26378.");return phone;}
function required(value: unknown,label: string,min: number,max: number): string {
  const result=typeof value==="string"?value.trim():"";
  if(result.length<min||result.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result))throw new ApiError(400,`${label} must contain ${min}–${max} characters.`);return result;
}
export function normalizePhone(value: unknown): string {
  const raw=typeof value==="string"?value.trim().replace(/[\s()-]/g,""):"",phone=raw.startsWith("+")?raw:`+${raw}`;
  if(!/^\+[1-9][0-9]{7,14}$/.test(phone))throw new ApiError(400,"Enter a WhatsApp number with its country code, such as +263771234567.");return phone;
}
function choice(value: unknown,allowed: string[],label: string): string { if(typeof value!=="string"||!allowed.includes(value))throw new ApiError(400,`Choose a valid ${label}.`);return value; }
async function rate(db: D1Database,key: string,max: number,duration: number): Promise<void> {
  const now=Date.now();
  const row=await db.prepare(`INSERT INTO rate_limits (key,count,window_ends) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET
    count=CASE WHEN window_ends<=? THEN 1 ELSE count+1 END,window_ends=CASE WHEN window_ends<=? THEN ? ELSE window_ends END RETURNING count`)
    .bind(key,now+duration,now,now,now+duration).first<{count:number}>();
  if(!row||row.count>max)throw new ApiError(429,"Too many requests. Please wait a few minutes and try again.");
}
type Seller={id:string;display_name:string;whatsapp:string;email:string;auth_provider:string;role:string;account_status:string;ecocash_phone:string};
const accountColumns="id,display_name,whatsapp,email,auth_provider,role,account_status,ecocash_phone";
async function signedIn(request: Request,db: D1Database): Promise<Seller> {
  const token=request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if(!token){
    const room=new URL(request.url).pathname.match(/^\/api\/live-checks\/([a-f0-9-]{36})\/(state|signals|ice|end)$/)?.[1];
    const cookie=request.headers.get("cookie")?.split(";").map(x=>x.trim()).find(x=>x.startsWith("__Host-nyazura-live="))?.slice(20);
    if(room&&cookie&&/^[A-Za-z0-9_-]{43}$/.test(cookie)){
      if(request.method!=="GET"&&request.headers.get("origin")!==new URL(request.url).origin)throw new ApiError(403,"Open the live check from the app.");
      const account=await db.prepare(`SELECT ${accountColumns.split(",").map(c=>"s."+c).join(",")} FROM live_sessions v JOIN sellers s ON s.id=v.account_id JOIN sessions p ON p.hash=v.parent_session_hash AND p.seller_id=v.account_id
        WHERE v.hash=? AND v.check_id=? AND v.expires_at>? AND p.expires_at>? AND s.auth_provider='google' AND s.account_status='active'`)
        .bind(await hash(cookie),room,Date.now(),Date.now()).first<Seller>();
      if(account)return account;
    }
    throw new ApiError(401,"Sign in with Google to use NyazuraMusika.");
  }
  const seller=await db.prepare(`SELECT ${accountColumns.split(",").map(c=>"sellers."+c).join(",")} FROM sessions JOIN sellers ON sellers.id=sessions.seller_id
    WHERE sessions.hash=? AND sessions.expires_at>? AND sellers.auth_provider='google'`).bind(await hash(token),Date.now()).first<Seller>();
  if(!seller)throw new ApiError(401,"Your session has expired. Please sign in with Google again.");
  if(seller.account_status!=="active")throw new ApiError(403,"Your account is suspended. Contact the app owner.");
  return seller;
}
function sellerAccess(account: Seller) { if(account.role!=="seller"&&account.role!=="admin")throw new ApiError(403,"Register as a seller before posting or managing goods."); }
function adminAccess(account: Seller) { if(account.role!=="admin")throw new ApiError(403,"Only an admin can perform this action."); }
const columns=`l.id,l.owner_id,l.title,l.description,l.category,l.location,l.condition,l.currency,l.price_minor,l.image_id,l.status,l.created_at,l.updated_at,s.display_name AS seller_name,s.whatsapp`;
function listingOutput(row: Record<string,unknown>): Record<string,unknown> { return {...row,image_path:row.image_id?`/api/images/${row.image_id}`:null}; }
function pageNumber(value: string|null,fallback: number,min: number,max: number): number { if(!value)return fallback;const number=Number(value);if(!Number.isInteger(number)||number<min||number>max)throw new ApiError(400,"Invalid page size or offset.");return number; }
async function listingData(input: Record<string,unknown>,db: D1Database,ownerId: string) {
  const price=input.price_minor;if(typeof price!=="number"||!Number.isSafeInteger(price)||price<=0||price>1_000_000_000)throw new ApiError(400,"Enter a positive price with at most two decimal places.");
  const imageId=input.image_id==null||input.image_id===""?null:required(input.image_id,"Photo ID",36,36);
  if(imageId&&!await db.prepare("SELECT id FROM images WHERE id=? AND owner_id=?").bind(imageId,ownerId).first())throw new ApiError(400,"Choose one of your own uploaded photos.");
  return {title:required(input.title,"Title",3,100),description:required(input.description,"Description",10,2000),category:choice(input.category,CATEGORIES,"category"),
    location:required(input.location,"Area",2,80),condition:choice(input.condition,CONDITIONS,"condition"),currency:choice(input.currency,CURRENCIES,"currency"),price,imageId,status:choice(input.status??"active",["active","sold"],"status")};
}

export async function handleMarketRequest(request: Request,env: MarketEnv): Promise<Response> {
  try {
    const url=new URL(request.url),path=url.pathname,method=request.method,db=rawDb(env);
    if(path==="/api/health"&&method==="GET") {
      const row=await db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type='table' AND name='listings'").first<{count:number}>();
      const migrated=await db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type='table' AND name='google_auth_requests'").first<{count:number}>();
      if(row?.count!==1||migrated?.count!==1||!env.BUCKET)throw new ApiError(503,"Marketplace storage is not ready.");return json({service:"NyazuraMusika",status:"ready",google_sign_in:googleConfigured(env)});
    }
    if(path==="/api/auth/config"&&method==="GET")return json({provider:"google",configured:googleConfigured(env)});
    if(path==="/api/live-checks/open"&&method==="GET")return await openLiveCheck(request,env);
    if(path==="/api/auth/google/start"&&method==="GET") {
      await rate(db,`google-start:${await hash(request.headers.get("cf-connecting-ip")||"unknown")}`,20,900_000);
      return await beginGoogleLogin(request,env);
    }
    if(path==="/api/auth/google/callback"&&method==="GET") {
      try { const login=await finishGoogleLogin(request,env); const code=await issueAuthCode(env,login.identity,login.challenge,login.state);
        return googleReturnPage("Return to the Android app to finish connecting your Google account.",200,code,login.state);
      } catch(error) { if(error instanceof GoogleAuthError||error instanceof ApiError)return googleReturnPage(error.message,error.status);throw error; }
    }
    if(path==="/api/auth/exchange"&&method==="POST") {
      await rate(db,`exchange:${await hash(request.headers.get("cf-connecting-ip")||"unknown")}`,40,900_000);
      const data=await body(request),code=required(data.code,"Sign-in code",43,43),verifier=required(data.verifier,"Verifier",43,128),state=required(data.state,"Sign-in state",20,64);
      const row=await db.prepare("DELETE FROM auth_codes WHERE hash=? AND challenge=? AND state=? AND expires_at>? RETURNING seller_id").bind(await hash(code),await hash(verifier),state,Date.now()).first<{seller_id:string}>();
      if(!row)throw new ApiError(401,"The sign-in link expired. Start sign-in again from the app.");
      const seller=await db.prepare(`SELECT ${accountColumns} FROM sellers WHERE id=? AND auth_provider='google'`).bind(row.seller_id).first<Seller>();
      if(!seller)throw new ApiError(401,"Sign in with Google to continue.");
      if(seller.account_status!=="active")throw new ApiError(403,"Your account is suspended. Contact the app owner.");
      const token=randomToken(),expiry=Date.now()+30*DAY;
      await db.prepare("INSERT INTO sessions (hash,seller_id,expires_at) VALUES (?,?,?)").bind(await hash(token),row.seller_id,expiry).run();
      return json({token,expires_at:expiry,account:seller,seller});
    }
    const seller=await signedIn(request,db);
    if(path==="/api/categories"&&method==="GET")return json({categories:CATEGORIES,currencies:CURRENCIES});
    if(path==="/api/listings"&&method==="GET") {
      const where=["l.status='active'","s.account_status='active'","s.role IN ('seller','admin')","s.auth_provider='google'"],values:(number|string)[]=[];
      const q=(url.searchParams.get("q")||"").trim().slice(0,100),category=url.searchParams.get("category"),location=(url.searchParams.get("location")||"").trim().slice(0,80);
      if(q){where.push("(instr(lower(l.title),lower(?))>0 OR instr(lower(l.description),lower(?))>0)");values.push(q,q);}
      if(category){where.push("l.category=?");values.push(choice(category,CATEGORIES,"category"));}
      if(location){where.push("instr(lower(l.location),lower(?))>0");values.push(location);}
      const limit=pageNumber(url.searchParams.get("limit"),20,1,50),offset=pageNumber(url.searchParams.get("offset"),0,0,100_000);
      const rows=await db.prepare(`SELECT ${columns} FROM listings l JOIN sellers s ON s.id=l.owner_id WHERE ${where.join(" AND ")} ORDER BY l.created_at DESC,l.id DESC LIMIT ? OFFSET ?`).bind(...values,limit+1,offset).all<Record<string,unknown>>();
      return json({listings:rows.results.slice(0,limit).map(listingOutput),has_more:rows.results.length>limit,next_offset:offset+limit});
    }
    const imageMatch=path.match(/^\/api\/images\/([a-f0-9-]{36})$/);
    if(imageMatch&&method==="GET") {
      const meta=await db.prepare(`SELECT i.id,i.content_type FROM images i WHERE i.id=? AND EXISTS (SELECT 1 FROM listings l JOIN sellers s ON s.id=l.owner_id WHERE l.image_id=i.id AND l.status IN ('active','sold') AND s.account_status='active' AND s.role IN ('seller','admin') AND s.auth_provider='google')`).bind(imageMatch[1]).first<{id:string;content_type:string}>();
      if(!meta||!env.BUCKET)throw new ApiError(404,"Photo not found.");const object=await env.BUCKET.get(meta.id);if(!object)throw new ApiError(404,"Photo not found.");
      return new Response(object.body,{headers:{"Content-Type":meta.content_type,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
    }
    const listingMatch=path.match(/^\/api\/listings\/([a-f0-9-]{36})$/);
    if(listingMatch&&method==="GET") {
      const row=await db.prepare(`SELECT ${columns} FROM listings l JOIN sellers s ON s.id=l.owner_id WHERE l.id=? AND l.status IN ('active','sold') AND s.account_status='active' AND s.role IN ('seller','admin') AND s.auth_provider='google'`).bind(listingMatch[1]).first<Record<string,unknown>>();
      if(!row)throw new ApiError(404,"This listing is no longer available.");return json({listing:listingOutput(row)});
    }
    if(path==="/api/me"&&method==="GET")return json({account:seller,seller});
    if(path==="/api/me"&&method==="PUT") {
      const data=await body(request);
      if("role" in data||"account_status" in data||"email" in data||"auth_provider" in data)throw new ApiError(403,"Account permissions can only be changed by an admin.");
      rejectWalletSecrets(data);
      const name=required(data.display_name,"Name",2,60),phone=data.whatsapp===""&&seller.role==="user"?"":normalizePhone(data.whatsapp),wallet=data.ecocash_phone==null?seller.ecocash_phone:data.ecocash_phone===""?"":ecocashPhone(data.ecocash_phone);
      await db.prepare("UPDATE sellers SET display_name=?,whatsapp=?,ecocash_phone=? WHERE id=?").bind(name,phone,wallet,seller.id).run();
      const account={...seller,display_name:name,whatsapp:phone,ecocash_phone:wallet};return json({account,seller:account});
    }
    if(path==="/api/me/seller"&&method==="POST") {
      const data=await body(request);
      if("role" in data||"account_status" in data||"email" in data||"auth_provider" in data)throw new ApiError(403,"Choose seller registration without changing account permissions.");
      rejectWalletSecrets(data);
      const name=required(data.display_name,"Seller name",2,60),phone=normalizePhone(data.whatsapp),wallet=data.ecocash_phone==null?seller.ecocash_phone:data.ecocash_phone===""?"":ecocashPhone(data.ecocash_phone);
      await db.prepare("UPDATE sellers SET display_name=?,whatsapp=?,ecocash_phone=?,role=CASE WHEN role='user' THEN 'seller' ELSE role END WHERE id=? AND account_status='active'").bind(name,phone,wallet,seller.id).run();
      const account={...seller,display_name:name,whatsapp:phone,ecocash_phone:wallet,role:seller.role==="user"?"seller":seller.role};return json({account,seller:account});
    }
    if(path==="/api/auth/logout"&&method==="POST") { await db.prepare("DELETE FROM sessions WHERE hash=?").bind(await hash(request.headers.get("authorization")!.slice(7))).run();return json({signed_out:true}); }
    if(path==="/api/my-listings"&&method==="GET") {
      sellerAccess(seller);
      const rows=await db.prepare(`SELECT ${columns} FROM listings l JOIN sellers s ON s.id=l.owner_id WHERE l.owner_id=? AND l.status!='removed' ORDER BY l.created_at DESC LIMIT 200`).bind(seller.id).all<Record<string,unknown>>();return json({listings:rows.results.map(listingOutput)});
    }
    if(path==="/api/images"&&method==="POST") {
      sellerAccess(seller);
      if(!env.BUCKET)throw new ApiError(503,"Photo uploads are temporarily unavailable.");await rate(db,`photos:${seller.id}`,20,3_600_000);
      const contentType=request.headers.get("content-type")?.split(";")[0];if(contentType!=="image/jpeg"&&contentType!=="image/png")throw new ApiError(415,"Choose a JPEG or PNG photo.");
      const bytes=await readLimited(request,800_000);if(bytes.length<12)throw new ApiError(400,"Choose a readable photo.");
      const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255,png=bytes.slice(0,8).every((v,i)=>v===[137,80,78,71,13,10,26,10][i]);
      if(!(contentType==="image/jpeg"?jpeg:png))throw new ApiError(400,"That file is not a supported photo.");
      const id=crypto.randomUUID();await env.BUCKET.put(id,bytes,{httpMetadata:{contentType}});
      try{await db.prepare("INSERT INTO images (id,owner_id,content_type,byte_size,created_at) VALUES (?,?,?,?,?)").bind(id,seller.id,contentType,bytes.length,Date.now()).run();}catch(error){await env.BUCKET.delete(id);throw error;}
      return json({image_id:id},201);
    }
    if(path==="/api/listings"&&method==="POST") {
      sellerAccess(seller);
      if(!seller.display_name||!seller.whatsapp)throw new ApiError(400,"Save your seller name and WhatsApp number first.");await rate(db,`listing-write:${seller.id}`,60,3_600_000);
      const data=await listingData(await body(request),db,seller.id),id=crypto.randomUUID(),now=Date.now();
      const created=await db.prepare(`INSERT INTO listings (id,owner_id,title,description,category,location,condition,currency,price_minor,image_id,status,created_at,updated_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM listings WHERE owner_id=? AND status='active')<100 RETURNING id`)
        .bind(id,seller.id,data.title,data.description,data.category,data.location,data.condition,data.currency,data.price,data.imageId,data.status,now,now,seller.id).first();
      if(!created)throw new ApiError(400,"You can have up to 100 active listings. Remove or mark older goods as sold first.");return json({id},201);
    }
    if(listingMatch&&(method==="PUT"||method==="DELETE")) {
      sellerAccess(seller);
      if(!await db.prepare("SELECT id FROM listings WHERE id=? AND owner_id=? AND status!='removed'").bind(listingMatch[1],seller.id).first())throw new ApiError(404,"This listing is not available in your account.");
      await rate(db,`listing-write:${seller.id}`,60,3_600_000);
      if(method==="DELETE"){await db.prepare("UPDATE listings SET status='removed',updated_at=? WHERE id=? AND owner_id=?").bind(Date.now(),listingMatch[1],seller.id).run();return json({removed:true});}
      const data=await listingData(await body(request),db,seller.id);
      await db.prepare(`UPDATE listings SET title=?,description=?,category=?,location=?,condition=?,currency=?,price_minor=?,image_id=?,status=?,updated_at=? WHERE id=? AND owner_id=?`)
        .bind(data.title,data.description,data.category,data.location,data.condition,data.currency,data.price,data.imageId,data.status,Date.now(),listingMatch[1],seller.id).run();return json({id:listingMatch[1]});
    }
    if(path.startsWith("/api/admin/"))return await handleAdmin(request,db,seller,url);
    const extra=await handleExtras(request,env,seller,url);if(extra)return extra;
    throw new ApiError(404,"This action is not available.");
  }catch(error){if(error instanceof ApiError||error instanceof GoogleAuthError)return json({error:error.message},error.status);console.error("Marketplace request failed",error instanceof Error?error.message:"Storage error");return json({error:"The marketplace is temporarily unavailable. Your changes were not confirmed. Please try again."},503);}
}

async function handleAdmin(request: Request,db: D1Database,admin: Seller,url: URL): Promise<Response> {
  adminAccess(admin);
  const path=url.pathname,method=request.method;
  if(path==="/api/admin/overview"&&method==="GET") {
    const [accounts,goods]=await Promise.all([
      db.prepare("SELECT COUNT(*) AS total,SUM(role='user') AS users,SUM(role='seller') AS sellers,SUM(role='admin') AS admins,SUM(account_status='suspended') AS suspended FROM sellers WHERE auth_provider='google'").first(),
      db.prepare("SELECT COUNT(*) AS total,SUM(status='active') AS active,SUM(status='sold') AS sold,SUM(status='removed') AS removed FROM listings").first(),
    ]);return json({accounts,goods});
  }
  if((path==="/api/admin/accounts"||path==="/api/admin/listings")&&method==="GET") {
    const limit=pageNumber(url.searchParams.get("limit"),20,1,50),offset=pageNumber(url.searchParams.get("offset"),0,0,100_000);
    const q=(url.searchParams.get("q")||"").trim().slice(0,100);
    if(path.endsWith("accounts")) {
      const rows=await db.prepare(`SELECT ${accountColumns},created_at FROM sellers WHERE auth_provider='google' AND (instr(lower(display_name),lower(?))>0 OR instr(lower(email),lower(?))>0) ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`).bind(q,q,limit+1,offset).all();
      return json({accounts:rows.results.slice(0,limit),has_more:rows.results.length>limit,next_offset:offset+limit});
    }
    const rows=await db.prepare(`SELECT ${columns} FROM listings l JOIN sellers s ON s.id=l.owner_id WHERE instr(lower(l.title),lower(?))>0 ORDER BY l.created_at DESC,l.id DESC LIMIT ? OFFSET ?`).bind(q,limit+1,offset).all<Record<string,unknown>>();
    return json({listings:rows.results.slice(0,limit).map(listingOutput),has_more:rows.results.length>limit,next_offset:offset+limit});
  }
  const accountMatch=path.match(/^\/api\/admin\/accounts\/([a-f0-9-]{36})$/);
  if(accountMatch&&method==="PUT") {
    await rate(db,`admin-write:${admin.id}`,120,3_600_000);
    const data=await body(request),target=await db.prepare(`SELECT ${accountColumns} FROM sellers WHERE id=? AND auth_provider='google'`).bind(accountMatch[1]).first<Seller>();
    if(!target)throw new ApiError(404,"Account not found.");
    const role=choice(data.role??target.role,ROLES,"role"),status=choice(data.account_status??target.account_status,["active","suspended"],"account status");
    if(target.id===admin.id&&(role!=="admin"||status!=="active"))throw new ApiError(400,"You cannot remove or suspend your own admin access.");
    // One D1 transaction changes permissions, records the action and revokes suspended sessions.
    await db.batch([
      db.prepare("UPDATE sellers SET role=?,account_status=? WHERE id=?").bind(role,status,target.id),
      db.prepare("INSERT INTO admin_actions (id,admin_id,action,target_id,details,created_at) VALUES (?,?,?,?,?,?)")
        .bind(crypto.randomUUID(),admin.id,"account.update",target.id,JSON.stringify({before:{role:target.role,account_status:target.account_status},after:{role,account_status:status}}),Date.now()),
      db.prepare("DELETE FROM sessions WHERE seller_id=? AND ?='suspended'").bind(target.id,status),
      db.prepare("DELETE FROM auth_codes WHERE seller_id=? AND ?='suspended'").bind(target.id,status),
    ]);return json({account:{...target,role,account_status:status}});
  }
  const listingMatch=path.match(/^\/api\/admin\/listings\/([a-f0-9-]{36})$/);
  if(listingMatch&&method==="PUT") {
    await rate(db,`admin-write:${admin.id}`,120,3_600_000);
    const data=await body(request),status=choice(data.status,["active","sold","removed"],"listing status");
    const target=await db.prepare("SELECT id,status FROM listings WHERE id=?").bind(listingMatch[1]).first<{id:string;status:string}>();
    if(!target)throw new ApiError(404,"Listing not found.");
    await db.batch([
      db.prepare("UPDATE listings SET status=?,updated_at=? WHERE id=?").bind(status,Date.now(),target.id),
      db.prepare("INSERT INTO admin_actions (id,admin_id,action,target_id,details,created_at) VALUES (?,?,?,?,?,?)")
        .bind(crypto.randomUUID(),admin.id,"listing.moderate",target.id,JSON.stringify({before:target.status,after:status}),Date.now()),
    ]);return json({id:target.id,status});
  }
  throw new ApiError(404,"This admin action is not available.");
}

type LiveCheck={id:string;listing_id:string;buyer_id:string;seller_id:string;status:string;offer:string|null;answer:string|null;buyer_candidates:string;seller_candidates:string;expires_at:number};
async function liveCheck(db: D1Database,id: string,account: Seller): Promise<LiveCheck> {
  const row=await db.prepare(`SELECT c.* FROM live_checks c JOIN sellers b ON b.id=c.buyer_id JOIN sellers s ON s.id=c.seller_id WHERE c.id=? AND (c.buyer_id=? OR c.seller_id=?) AND b.account_status='active' AND s.account_status='active' AND s.role IN ('seller','admin')`)
    .bind(id,account.id,account.id).first<LiveCheck>();
  if(!row)throw new ApiError(404,"This live check is not available in your account.");return row;
}
async function visibleGoods(db: D1Database,id: string): Promise<Record<string,unknown>> {
  const row=await db.prepare(`SELECT ${columns},s.ecocash_phone FROM listings l JOIN sellers s ON s.id=l.owner_id WHERE l.id=? AND l.status='active' AND s.account_status='active' AND s.auth_provider='google' AND s.role IN ('seller','admin')`).bind(id).first<Record<string,unknown>>();
  if(!row)throw new ApiError(404,"This item is no longer available.");return row;
}
async function openLiveCheck(request: Request,env: MarketEnv): Promise<Response> {
  const ticket=new URL(request.url).searchParams.get("ticket")||"";if(!/^[A-Za-z0-9_-]{43}$/.test(ticket))throw new ApiError(401,"Open the live check from the Android app.");
  const db=rawDb(env),row=await db.prepare("DELETE FROM live_tickets WHERE hash=? AND expires_at>? RETURNING account_id,check_id,parent_session_hash")
    .bind(await hash(ticket),Date.now()).first<{account_id:string;check_id:string;parent_session_hash:string}>();
  if(!row)throw new ApiError(401,"That live-check link expired or was already used.");
  const parent=await db.prepare("SELECT s.id FROM sellers s JOIN sessions p ON p.seller_id=s.id WHERE s.id=? AND p.hash=? AND p.expires_at>? AND s.account_status='active' AND s.auth_provider='google'").bind(row.account_id,row.parent_session_hash,Date.now()).first();
  if(!parent)throw new ApiError(401,"Sign in again to join the live check.");
  const token=randomToken();await db.prepare("INSERT INTO live_sessions (hash,account_id,check_id,parent_session_hash,expires_at) VALUES (?,?,?,?,?)").bind(await hash(token),row.account_id,row.check_id,row.parent_session_hash,Date.now()+1_200_000).run();
  return new Response(null,{status:302,headers:{Location:`/live-check/${row.check_id}`,"Cache-Control":"no-store","Referrer-Policy":"no-referrer",
    "Set-Cookie":`__Host-nyazura-live=${token}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=1200`}});
}
async function handleExtras(request: Request,env: MarketEnv,account: Seller,url: URL): Promise<Response|null> {
  const db=rawDb(env),path=url.pathname,method=request.method;
  if(path==="/api/favorites"&&method==="GET"){
    const rows=await db.prepare(`SELECT ${columns} FROM favorites f JOIN listings l ON l.id=f.listing_id JOIN sellers s ON s.id=l.owner_id WHERE f.account_id=? AND l.status IN ('active','sold') AND s.account_status='active' AND s.role IN ('seller','admin') AND s.auth_provider='google' ORDER BY f.created_at DESC LIMIT 200`).bind(account.id).all<Record<string,unknown>>();
    return json({listings:rows.results.map(listingOutput)});
  }
  const favorite=path.match(/^\/api\/favorites\/([a-f0-9-]{36})$/);
  if(favorite&&(method==="POST"||method==="DELETE")){
    if(method==="DELETE"){await db.prepare("DELETE FROM favorites WHERE account_id=? AND listing_id=?").bind(account.id,favorite[1]).run();return json({saved:false});}
    await visibleGoods(db,favorite[1]);await rate(db,`favorites:${account.id}`,100,3_600_000);
    await db.prepare("INSERT INTO favorites (id,account_id,listing_id,created_at) VALUES (?,?,?,?) ON CONFLICT(account_id,listing_id) DO NOTHING").bind(crypto.randomUUID(),account.id,favorite[1],Date.now()).run();return json({saved:true});
  }
  if(path==="/api/live-checks"&&method==="GET"){
    await db.prepare("UPDATE live_checks SET offer=NULL,answer=NULL,buyer_candidates='[]',seller_candidates='[]' WHERE expires_at<? AND (offer IS NOT NULL OR answer IS NOT NULL OR buyer_candidates!='[]' OR seller_candidates!='[]')").bind(Date.now()).run();
    const rows=await db.prepare(`SELECT c.id,c.listing_id,c.buyer_id,c.seller_id,CASE WHEN c.expires_at<? AND c.status IN ('requested','accepted') THEN 'expired' ELSE c.status END AS status,c.created_at,c.expires_at,c.inspected_at,l.title,l.price_minor,l.currency,l.status AS listing_status,b.display_name AS buyer_name,s.display_name AS seller_name FROM live_checks c JOIN listings l ON l.id=c.listing_id JOIN sellers b ON b.id=c.buyer_id JOIN sellers s ON s.id=c.seller_id WHERE (c.buyer_id=? OR c.seller_id=?) AND b.account_status='active' AND s.account_status='active' ORDER BY c.created_at DESC LIMIT 100`).bind(Date.now(),account.id,account.id).all();
    return json({checks:rows.results,relay_configured:!!env.TURN_KEY_ID&&!!env.TURN_API_TOKEN});
  }
  if(path==="/api/live-checks"&&method==="POST"){
    const data=await body(request),id=required(data.listing_id,"Listing ID",36,36),item=await visibleGoods(db,id);if(item.owner_id===account.id)throw new ApiError(400,"You cannot request a live check of your own goods.");
    await rate(db,`live-request:${account.id}`,20,3_600_000);
    const existing=await db.prepare("SELECT id FROM live_checks WHERE buyer_id=? AND listing_id=? AND status IN ('requested','accepted') AND expires_at>? ORDER BY created_at DESC LIMIT 1").bind(account.id,id,Date.now()).first<{id:string}>();
    if(existing)return json({id:existing.id},200);
    const checkId=crypto.randomUUID(),now=Date.now();await db.prepare("INSERT INTO live_checks (id,listing_id,buyer_id,seller_id,status,created_at,expires_at) VALUES (?,?,?,?, 'requested',?,?)").bind(checkId,id,account.id,item.owner_id,now,now+1_800_000).run();return json({id:checkId},201);
  }
  const live=path.match(/^\/api\/live-checks\/([a-f0-9-]{36})\/(respond|ticket|state|signals|ice|complete|end)$/);
  if(live){
    const check=await liveCheck(db,live[1],account),buyer=check.buyer_id===account.id;
    if(check.expires_at<Date.now()&&check.status!=="checked")throw new ApiError(410,"This live check expired. Request a new one.");
    if(live[2]==="respond"&&method==="POST"){
      if(buyer)throw new ApiError(403,"Only the seller can accept or decline this request.");
      const data=await body(request),status=choice(data.status,["accepted","declined"],"response");
      const changed=await db.prepare("UPDATE live_checks SET status=? WHERE id=? AND status='requested' RETURNING id").bind(status,check.id).first();if(!changed)throw new ApiError(409,"This live request has already been answered.");return json({status});
    }
    if(live[2]==="complete"&&method==="POST"){
      if(!buyer)throw new ApiError(403,"Only the buyer can confirm that they inspected the goods.");
      const changed=await db.prepare("UPDATE live_checks SET status='checked',inspected_at=? WHERE id=? AND status IN ('accepted','ended') AND offer IS NOT NULL AND answer IS NOT NULL RETURNING id").bind(Date.now(),check.id).first();
      if(!changed)throw new ApiError(409,"Join the live call with the seller before confirming your inspection.");return json({status:"checked",confirmation:"buyer_reported_inspection"});
    }
    if(live[2]==="end"&&method==="POST"){
      await db.prepare("UPDATE live_checks SET status='ended' WHERE id=? AND status='accepted'").bind(check.id).run();return json({ended:true});
    }
    if(check.status!=="accepted")throw new ApiError(409,"The seller must accept the live check before you can join it.");
    if(live[2]==="ticket"&&method==="POST"){
      const parent=request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];if(!parent)throw new ApiError(401,"Join the call from the Android app.");
      await rate(db,`live-ticket:${account.id}`,30,3_600_000);
      const ticket=randomToken();await db.batch([db.prepare("DELETE FROM live_tickets WHERE expires_at<?").bind(Date.now()),db.prepare("DELETE FROM live_sessions WHERE expires_at<?").bind(Date.now()),
        db.prepare("INSERT INTO live_tickets (hash,account_id,check_id,parent_session_hash,expires_at) VALUES (?,?,?,?,?)").bind(await hash(ticket),account.id,check.id,await hash(parent),Date.now()+120_000)]);
      return json({url:`${env.MARKET_ORIGIN}/api/live-checks/open?ticket=${encodeURIComponent(ticket)}`});
    }
    if(live[2]==="state"&&method==="GET")return json({id:check.id,role:buyer?"buyer":"seller",status:check.status,offer:check.offer,answer:check.answer,candidates:JSON.parse(buyer?check.seller_candidates:check.buyer_candidates)});
    if(live[2]==="signals"&&method==="POST"){
      const data=await body(request);await rate(db,`live-signals:${check.id}:${account.id}`,120,60_000);
      if(data.type==="offer"||data.type==="answer"){
        if((data.type==="offer")!==buyer)throw new ApiError(403,"This signal belongs to the other participant.");
        const sdp=required(data.sdp,"Call description",10,12_000),column=buyer?"offer":"answer";
        const changed=await db.prepare(`UPDATE live_checks SET ${column}=? WHERE id=? AND status='accepted' AND (${column} IS NULL OR ${column}=?) RETURNING id`).bind(sdp,check.id,sdp).first();
        if(!changed)throw new ApiError(409,"This call has already started. Request a new live check if you cannot reconnect.");return json({saved:true});
      }
      if(data.type==="ice"){
        const candidate=data.candidate as Record<string,unknown>;if(!candidate||typeof candidate!=="object"||Array.isArray(candidate)||typeof candidate.candidate!=="string"||candidate.candidate.length>1500)throw new ApiError(400,"Invalid call candidate.");
        const serialized=JSON.stringify(candidate);if(serialized.length>2048)throw new ApiError(400,"Call candidate is too large.");const column=buyer?"buyer_candidates":"seller_candidates";
        const changed=await db.prepare(`UPDATE live_checks SET ${column}=json_insert(${column},'$[#]',json(?)) WHERE id=? AND status='accepted' AND json_array_length(${column})<100 RETURNING id`).bind(serialized,check.id).first();if(!changed)throw new ApiError(429,"Too many call candidates. Request a new live check.");return json({saved:true});
      }
      throw new ApiError(400,"Invalid call signal.");
    }
    if(live[2]==="ice"&&method==="GET"){
      const basic=[{urls:["stun:stun.cloudflare.com:3478"]}];if(!env.TURN_KEY_ID||!env.TURN_API_TOKEN)return json({iceServers:basic,relay_configured:false});
      if(!/^[A-Za-z0-9_-]{1,128}$/.test(env.TURN_KEY_ID))throw new ApiError(503,"The live-call connection service is not ready.");
      await rate(db,`turn:${check.id}:${account.id}`,5,1_200_000);
      const response=await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`,{method:"POST",headers:{Authorization:`Bearer ${env.TURN_API_TOKEN}`,"Content-Type":"application/json"},body:JSON.stringify({ttl:1200}),signal:AbortSignal.timeout(10_000)});
      if(!response.ok)throw new ApiError(503,"The live-call connection service could not be reached.");const data=await response.json() as {iceServers?:unknown};if(!Array.isArray(data.iceServers))throw new ApiError(503,"The live-call connection service is unavailable.");return json({iceServers:data.iceServers,relay_configured:true});
    }
  }
  if(path==="/api/orders"&&method==="GET"){
    const rows=await db.prepare("SELECT * FROM orders WHERE buyer_id=? OR seller_id=? ORDER BY created_at DESC LIMIT 100").bind(account.id,account.id).all();return json({orders:rows.results.map(row=>({...row,provider_verified:false,payment_method:"EcoCash direct transfer"}))});
  }
  if(path==="/api/orders"&&method==="POST"){
    const data=await body(request);rejectWalletSecrets(data);const check=await liveCheck(db,required(data.live_check_id,"Live check ID",36,36),account);
    if(check.buyer_id!==account.id||check.status!=="checked")throw new ApiError(409,"Confirm your live inspection before preparing the payment.");
    const requestId=required(data.client_request_id,"Purchase reference",36,36);
    const existing=await db.prepare("SELECT * FROM orders WHERE buyer_id=? AND (client_request_id=? OR live_check_id=?)").bind(account.id,requestId,check.id).first<Record<string,unknown>>();
    if(existing){if(existing.live_check_id!==check.id)throw new ApiError(409,"Use a new purchase reference for different goods.");return json({order:{...existing,provider_verified:false}},200);}
    const item=await visibleGoods(db,check.listing_id);
    if(data.expected_price_minor!==item.price_minor||data.expected_currency!==item.currency)throw new ApiError(409,"The price changed. Refresh the listing before paying.");
    if(item.currency!=="USD"&&item.currency!=="ZiG")throw new ApiError(400,"EcoCash direct transfers are available for USD or ZiG listings.");
    if(!item.ecocash_phone)throw new ApiError(409,"The seller needs to add their EcoCash receiving number first.");
    await rate(db,`orders:${account.id}`,20,3_600_000);
    const id=crypto.randomUUID(),now=Date.now();await db.prepare(`INSERT INTO orders (id,client_request_id,live_check_id,listing_id,buyer_id,seller_id,title,price_minor,currency,payee_phone,buyer_name,seller_name,payment_state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'awaiting_payment',?,?)`)
      .bind(id,requestId,check.id,check.listing_id,account.id,check.seller_id,item.title,item.price_minor,item.currency,ecocashPhone(item.ecocash_phone),account.display_name,item.seller_name,now,now).run();
    const order=await db.prepare("SELECT * FROM orders WHERE id=?").bind(id).first();return json({order:{...order,provider_verified:false}},201);
  }
  const orderMatch=path.match(/^\/api\/orders\/([a-f0-9-]{36})(?:\/(report|confirm|receipt|cancel))?$/);
  if(orderMatch){
    const order=await db.prepare("SELECT * FROM orders WHERE id=? AND (buyer_id=? OR seller_id=?)").bind(orderMatch[1],account.id,account.id).first<Record<string,unknown>>();if(!order)throw new ApiError(404,"This purchase is not available in your account.");
    const buyer=order.buyer_id===account.id;
    if(!orderMatch[2]&&method==="GET")return json({order:{...order,provider_verified:false}});
    if(orderMatch[2]==="report"&&method==="POST"){
      if(!buyer)throw new ApiError(403,"Only the buyer can submit a payment reference.");const data=await body(request);rejectWalletSecrets(data);
      const reference=required(data.payment_reference,"EcoCash transaction reference",4,80);await rate(db,`payment-report:${account.id}`,30,3_600_000);
      const changed=await db.prepare("UPDATE orders SET payment_state='buyer_reported',payment_reference=?,updated_at=? WHERE id=? AND payment_state IN ('awaiting_payment','buyer_reported') RETURNING id").bind(reference,Date.now(),order.id).first();if(!changed)throw new ApiError(409,"This purchase can no longer accept a new payment reference.");return json({payment_state:"buyer_reported",provider_verified:false});
    }
    if(orderMatch[2]==="confirm"&&method==="POST"){
      if(buyer)throw new ApiError(403,"Only the receiving seller can confirm this payment.");sellerAccess(account);
      const data=await body(request);rejectWalletSecrets(data);if(data.checked_wallet!==true)throw new ApiError(400,"Check the payment in your EcoCash wallet before confirming receipt.");
      if(order.payment_state!=="buyer_reported"||!order.payment_reference)throw new ApiError(409,"The buyer must submit an EcoCash transaction reference first.");
      const duplicate=await db.prepare("SELECT id FROM orders WHERE payee_phone=? AND payment_reference=? AND payment_state='seller_confirmed' AND id!=?").bind(order.payee_phone,order.payment_reference,order.id).first();if(duplicate)throw new ApiError(409,"This transaction reference was already confirmed for another purchase.");
      const now=Date.now();await db.batch([
        db.prepare("UPDATE orders SET payment_state='seller_confirmed',confirmed_at=?,updated_at=? WHERE id=? AND payment_state='buyer_reported'").bind(now,now,order.id),
        db.prepare("UPDATE listings SET status='sold',updated_at=? WHERE id=? AND owner_id=? AND status='active'").bind(now,order.listing_id,account.id),
      ]);return json({payment_state:"seller_confirmed",provider_verified:false});
    }
    if(orderMatch[2]==="cancel"&&method==="POST"){
      const changed=await db.prepare("UPDATE orders SET payment_state='cancelled',updated_at=? WHERE id=? AND payment_state='awaiting_payment' RETURNING id").bind(Date.now(),order.id).first();if(!changed)throw new ApiError(409,"Only an unpaid purchase can be cancelled. Resolve reported payments directly with the seller.");return json({payment_state:"cancelled"});
    }
    if(orderMatch[2]==="receipt"&&method==="GET"){
      if(order.payment_state!=="seller_confirmed")throw new ApiError(409,"The seller has not confirmed receiving the payment yet.");
      return json({receipt:{...order,receipt_number:`NM-${String(order.id).replace(/-/g,"").toUpperCase()}`,title_label:"Seller-confirmed payment record",verification:"Confirmed by the seller; not independently verified by EcoCash.",provider_verified:false,payment_method:"EcoCash direct transfer"}});
    }
  }
  return null;
}
