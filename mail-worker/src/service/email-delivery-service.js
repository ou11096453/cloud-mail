const initialization = new WeakMap();

const emailDeliveryService = {
	async ensure(c) {
		const db = c.env.db;
		let ready = initialization.get(db);
		if (!ready) {
			ready = (async () => {
				const exists = await db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'email_delivery'").first();
				if (exists) return;
				// D1 batches are atomic, including the first-time backfill.
				await db.batch([
					db.prepare(`CREATE TABLE IF NOT EXISTS email_delivery (
						delivery_id INTEGER PRIMARY KEY AUTOINCREMENT,
						email_id INTEGER NOT NULL UNIQUE REFERENCES email(email_id) ON DELETE CASCADE
					)`),
					db.prepare(`INSERT OR IGNORE INTO email_delivery (email_id)
						SELECT email_id FROM email WHERE type = 0 AND status <> 6 ORDER BY email_id`)
				]);
			})();
			initialization.set(db, ready);
			ready.catch(() => initialization.delete(db));
		}
		await ready;
	},

	async complete(c, emailId, status) {
		await this.ensure(c);
		await c.env.db.batch([
			c.env.db.prepare('UPDATE email SET is_del = 0, status = ? WHERE email_id = ?').bind(status, emailId),
			c.env.db.prepare('INSERT OR IGNORE INTO email_delivery (email_id) VALUES (?)').bind(emailId)
		]);
	}
};

export default emailDeliveryService;
