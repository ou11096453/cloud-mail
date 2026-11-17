import { integer, sqliteTable } from 'drizzle-orm/sqlite-core';
import email from './email';

export const emailDelivery = sqliteTable('email_delivery', {
	deliveryId: integer('delivery_id').primaryKey({ autoIncrement: true }),
	emailId: integer('email_id').notNull().unique().references(() => email.emailId, { onDelete: 'cascade' })
});
