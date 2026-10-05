import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const sellers = sqliteTable("sellers", {
  id: text("id").primaryKey(), externalId: text("external_id").notNull(),
  displayName: text("display_name").notNull().default(""), whatsapp: text("whatsapp").notNull().default(""),
  email: text("email").notNull().default(""), authProvider: text("auth_provider").notNull().default("chatgpt"),
  role: text("role").notNull().default("user"), accountStatus: text("account_status").notNull().default("active"),
  ecocashPhone: text("ecocash_phone").notNull().default(""),
  createdAt: integer("created_at").notNull(),
}, t => [uniqueIndex("idx_sellers_external_id").on(t.externalId)]);
export const sessions = sqliteTable("sessions", {
  hash: text("hash").primaryKey(), sellerId: text("seller_id").notNull().references(() => sellers.id), expiresAt: integer("expires_at").notNull(),
}, t => [index("idx_sessions_seller").on(t.sellerId)]);
export const authCodes = sqliteTable("auth_codes", {
  hash: text("hash").primaryKey(), sellerId: text("seller_id").notNull().references(() => sellers.id),
  challenge: text("challenge").notNull(), state: text("state").notNull(), expiresAt: integer("expires_at").notNull(),
});
export const images = sqliteTable("images", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull().references(() => sellers.id),
  contentType: text("content_type").notNull(), byteSize: integer("byte_size").notNull(), createdAt: integer("created_at").notNull(),
}, t => [index("idx_images_owner").on(t.ownerId)]);
export const listings = sqliteTable("listings", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull().references(() => sellers.id),
  title: text("title").notNull(), description: text("description").notNull(), category: text("category").notNull(),
  location: text("location").notNull(), condition: text("condition").notNull(), currency: text("currency").notNull(),
  priceMinor: integer("price_minor").notNull(), imageId: text("image_id").references(() => images.id),
  status: text("status").notNull().default("active"), createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
}, t => [index("idx_listings_status_created").on(t.status,t.createdAt), index("idx_listings_owner_created").on(t.ownerId,t.createdAt), index("idx_listings_image").on(t.imageId)]);
export const rateLimits = sqliteTable("rate_limits", { key: text("key").primaryKey(), count: integer("count").notNull(), windowEnds: integer("window_ends").notNull() });
export const googleAuthRequests = sqliteTable("google_auth_requests", {
  stateHash: text("state_hash").primaryKey(), browserHash: text("browser_hash").notNull(),
  nonce: text("nonce").notNull(), googleVerifier: text("google_verifier").notNull(),
  challenge: text("challenge").notNull(), appState: text("app_state").notNull(), expiresAt: integer("expires_at").notNull(),
});
export const adminActions = sqliteTable("admin_actions", {
  id: text("id").primaryKey(), adminId: text("admin_id").notNull().references(() => sellers.id),
  action: text("action").notNull(), targetId: text("target_id").notNull(), details: text("details").notNull(), createdAt: integer("created_at").notNull(),
}, t => [index("idx_admin_actions_created").on(t.createdAt)]);
export const favorites = sqliteTable("favorites", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull().references(() => sellers.id), listingId: text("listing_id").notNull().references(() => listings.id), createdAt: integer("created_at").notNull(),
}, t => [uniqueIndex("idx_favorites_account_listing").on(t.accountId,t.listingId)]);
export const liveChecks = sqliteTable("live_checks", {
  id: text("id").primaryKey(), listingId: text("listing_id").notNull().references(() => listings.id),
  buyerId: text("buyer_id").notNull().references(() => sellers.id), sellerId: text("seller_id").notNull().references(() => sellers.id),
  status: text("status").notNull().default("requested"), offer: text("offer"), answer: text("answer"),
  buyerCandidates: text("buyer_candidates").notNull().default("[]"), sellerCandidates: text("seller_candidates").notNull().default("[]"),
  createdAt: integer("created_at").notNull(), expiresAt: integer("expires_at").notNull(), inspectedAt: integer("inspected_at"),
}, t => [index("idx_live_checks_buyer").on(t.buyerId,t.createdAt),index("idx_live_checks_seller").on(t.sellerId,t.createdAt)]);
export const liveTickets = sqliteTable("live_tickets", {
  hash: text("hash").primaryKey(), accountId: text("account_id").notNull().references(() => sellers.id),
  checkId: text("check_id").notNull().references(() => liveChecks.id), parentSessionHash: text("parent_session_hash").notNull(), expiresAt: integer("expires_at").notNull(),
});
export const liveSessions = sqliteTable("live_sessions", {
  hash: text("hash").primaryKey(), accountId: text("account_id").notNull().references(() => sellers.id),
  checkId: text("check_id").notNull().references(() => liveChecks.id), parentSessionHash: text("parent_session_hash").notNull(), expiresAt: integer("expires_at").notNull(),
});
export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(), clientRequestId: text("client_request_id").notNull(), liveCheckId: text("live_check_id").notNull().references(() => liveChecks.id),
  listingId: text("listing_id").notNull().references(() => listings.id), buyerId: text("buyer_id").notNull().references(() => sellers.id), sellerId: text("seller_id").notNull().references(() => sellers.id),
  title: text("title").notNull(), priceMinor: integer("price_minor").notNull(), currency: text("currency").notNull(), payeePhone: text("payee_phone").notNull(),
  buyerName: text("buyer_name").notNull(), sellerName: text("seller_name").notNull(), paymentState: text("payment_state").notNull().default("awaiting_payment"),
  paymentReference: text("payment_reference").notNull().default(""), confirmedAt: integer("confirmed_at"), createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
}, t => [uniqueIndex("idx_orders_request").on(t.buyerId,t.clientRequestId),uniqueIndex("idx_orders_check").on(t.buyerId,t.liveCheckId),uniqueIndex("idx_orders_confirmed_reference").on(t.payeePhone,t.paymentReference).where(sql`payment_state='seller_confirmed'`),index("idx_orders_seller").on(t.sellerId,t.createdAt)]);
