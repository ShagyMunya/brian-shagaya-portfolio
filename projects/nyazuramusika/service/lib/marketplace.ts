export type MarketEnv = { DB: D1Database; BUCKET: R2Bucket };
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

// Only the server page calls this after dispatch-owned ChatGPT sign-in.
// There is no anonymous HTTP endpoint for creating or impersonating an account.
export async function issueAuthCode(env: MarketEnv,externalId: string,challenge: string,state: string): Promise<string> {
  if (!externalId || !validateConnect(challenge,state)) throw new ApiError(400,"Start sign-in from the Android app.");
  const db=rawDb(env),now=Date.now();
  await db.prepare("INSERT INTO sellers (id,external_id,created_at) VALUES (?,?,?) ON CONFLICT(external_id) DO NOTHING").bind(crypto.randomUUID(),externalId,now).run();
  const seller=await db.prepare("SELECT id FROM sellers WHERE external_id=?").bind(externalId).first<{id:string}>();
  if (!seller) throw new ApiError(503,"Unable to complete sign-in. Please try again.");
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
type Seller={id:string;display_name:string;whatsapp:string};
async function signedIn(request: Request,db: D1Database): Promise<Seller> {
  const token=request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if(!token)throw new ApiError(401,"Sign in to manage your listings.");
  const seller=await db.prepare(`SELECT sellers.id,sellers.display_name,sellers.whatsapp FROM sessions JOIN sellers ON sellers.id=sessions.seller_id
    WHERE sessions.hash=? AND sessions.expires_at>?`).bind(await hash(token),Date.now()).first<Seller>();
  if(!seller)throw new ApiError(401,"Your session has expired. Please sign in again.");return seller;
}
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
      if(row?.count!==1||!env.BUCKET)throw new ApiError(503,"Marketplace storage is not ready.");return json({service:"NyazuraMusika",status:"ready"});
    }
    if(path==="/api/categories"&&method==="GET")return json({categories:CATEGORIES,currencies:CURRENCIES});
    if(path==="/api/auth/exchange"&&method==="POST") {
      await rate(db,`exchange:${await hash(request.headers.get("cf-connecting-ip")||"unknown")}`,40,900_000);
      const data=await body(request),code=required(data.code,"Sign-in code",43,43),verifier=required(data.verifier,"Verifier",43,128),state=required(data.state,"Sign-in state",20,64);
      const row=await db.prepare("DELETE FROM auth_codes WHERE hash=? AND challenge=? AND state=? AND expires_at>? RETURNING seller_id").bind(await hash(code),await hash(verifier),state,Date.now()).first<{seller_id:string}>();
      if(!row)throw new ApiError(401,"The sign-in link expired. Start sign-in again from the app.");
      const token=randomToken(),expiry=Date.now()+30*DAY;
      await db.prepare("INSERT INTO sessions (hash,seller_id,expires_at) VALUES (?,?,?)").bind(await hash(token),row.seller_id,expiry).run();
      const seller=await db.prepare("SELECT id,display_name,whatsapp FROM sellers WHERE id=?").bind(row.seller_id).first();return json({token,expires_at:expiry,seller});
    }
    if(path==="/api/listings"&&method==="GET") {
      const where=["l.status='active'"],values:(number|string)[]=[];
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
      const meta=await db.prepare(`SELECT i.id,i.content_type FROM images i WHERE i.id=? AND EXISTS (SELECT 1 FROM listings l WHERE l.image_id=i.id AND l.status IN ('active','sold'))`).bind(imageMatch[1]).first<{id:string;content_type:string}>();
      if(!meta||!env.BUCKET)throw new ApiError(404,"Photo not found.");const object=await env.BUCKET.get(meta.id);if(!object)throw new ApiError(404,"Photo not found.");
      return new Response(object.body,{headers:{"Content-Type":meta.content_type,"Cache-Control":"public, max-age=300","X-Content-Type-Options":"nosniff"}});
    }
    const listingMatch=path.match(/^\/api\/listings\/([a-f0-9-]{36})$/);
    if(listingMatch&&method==="GET") {
      const row=await db.prepare(`SELECT ${columns} FROM listings l JOIN sellers s ON s.id=l.owner_id WHERE l.id=? AND l.status IN ('active','sold')`).bind(listingMatch[1]).first<Record<string,unknown>>();
      if(!row)throw new ApiError(404,"This listing is no longer available.");return json({listing:listingOutput(row)});
    }
    const seller=await signedIn(request,db);
    if(path==="/api/me"&&method==="GET")return json({seller});
    if(path==="/api/me"&&method==="PUT") {
      const data=await body(request),name=required(data.display_name,"Seller name",2,60),phone=normalizePhone(data.whatsapp);
      await db.prepare("UPDATE sellers SET display_name=?,whatsapp=? WHERE id=?").bind(name,phone,seller.id).run();return json({seller:{id:seller.id,display_name:name,whatsapp:phone}});
    }
    if(path==="/api/auth/logout"&&method==="POST") { await db.prepare("DELETE FROM sessions WHERE hash=?").bind(await hash(request.headers.get("authorization")!.slice(7))).run();return json({signed_out:true}); }
    if(path==="/api/my-listings"&&method==="GET") {
      const rows=await db.prepare(`SELECT ${columns} FROM listings l JOIN sellers s ON s.id=l.owner_id WHERE l.owner_id=? AND l.status!='removed' ORDER BY l.created_at DESC LIMIT 200`).bind(seller.id).all<Record<string,unknown>>();return json({listings:rows.results.map(listingOutput)});
    }
    if(path==="/api/images"&&method==="POST") {
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
      if(!seller.display_name||!seller.whatsapp)throw new ApiError(400,"Save your seller name and WhatsApp number first.");await rate(db,`listing-write:${seller.id}`,60,3_600_000);
      const data=await listingData(await body(request),db,seller.id),id=crypto.randomUUID(),now=Date.now();
      const created=await db.prepare(`INSERT INTO listings (id,owner_id,title,description,category,location,condition,currency,price_minor,image_id,status,created_at,updated_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM listings WHERE owner_id=? AND status='active')<100 RETURNING id`)
        .bind(id,seller.id,data.title,data.description,data.category,data.location,data.condition,data.currency,data.price,data.imageId,data.status,now,now,seller.id).first();
      if(!created)throw new ApiError(400,"You can have up to 100 active listings. Remove or mark older goods as sold first.");return json({id},201);
    }
    if(listingMatch&&(method==="PUT"||method==="DELETE")) {
      if(!await db.prepare("SELECT id FROM listings WHERE id=? AND owner_id=? AND status!='removed'").bind(listingMatch[1],seller.id).first())throw new ApiError(404,"This listing is not available in your account.");
      await rate(db,`listing-write:${seller.id}`,60,3_600_000);
      if(method==="DELETE"){await db.prepare("UPDATE listings SET status='removed',updated_at=? WHERE id=? AND owner_id=?").bind(Date.now(),listingMatch[1],seller.id).run();return json({removed:true});}
      const data=await listingData(await body(request),db,seller.id);
      await db.prepare(`UPDATE listings SET title=?,description=?,category=?,location=?,condition=?,currency=?,price_minor=?,image_id=?,status=?,updated_at=? WHERE id=? AND owner_id=?`)
        .bind(data.title,data.description,data.category,data.location,data.condition,data.currency,data.price,data.imageId,data.status,Date.now(),listingMatch[1],seller.id).run();return json({id:listingMatch[1]});
    }
    throw new ApiError(404,"This action is not available.");
  }catch(error){if(error instanceof ApiError)return json({error:error.message},error.status);console.error("Marketplace request failed",error instanceof Error?error.message:"Storage error");return json({error:"The marketplace is temporarily unavailable. Your changes were not confirmed. Please try again."},503);}
}
