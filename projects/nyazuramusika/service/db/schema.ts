import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
export const sellers = sqliteTable("sellers", {
  id: text("id").primaryKey(), externalId: text("external_id").notNull(),
  displayName: text("display_name").notNull().default(""), whatsapp: text("whatsapp").notNull().default(""),
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
