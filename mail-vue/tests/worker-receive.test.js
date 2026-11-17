import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync, constants, database, receiveHandler, workerObject } from './worker-harness.js';

const sqlTest = (name, fn) => test(name, { skip: !DatabaseSync && 'Node SQLite is unavailable' }, fn);
const addAccount = fixture => fixture.sqlite.prepare("INSERT INTO account(account_id,email,user_id) VALUES(1,'Mixed@example.test',10)").run();
const addMail = (fixture, id, status = 6, deleted = 1) => fixture.sqlite.prepare(
    'INSERT INTO email(email_id,account_id,user_id,type,status,is_del) VALUES(?,1,10,0,?,?)',
).run(id, status, deleted);
const poll = (fixture, deliveryId, extra = {}) => fixture.emailService.latest(fixture.c,
    { deliveryId, emailId: 0, accountId: 1, allReceive: 0, ...extra }, 10);

sqlTest('delivery initialization backfills completed mail once and leaves incomplete attachments hidden', async t => {
    const fixture = database(t);
    addAccount(fixture);
    addMail(fixture, 1, 0, 0);
    addMail(fixture, 2);
    await Promise.all([fixture.delivery.ensure(fixture.c), fixture.delivery.ensure(fixture.c)]);
    await fixture.delivery.ensure(fixture.c);
    assert.deepEqual(fixture.sqlite.prepare('SELECT email_id FROM email_delivery').all().map(row => row.email_id), [1]);
    assert.equal(fixture.queries.length, 2);
    await fixture.emailService.completeReceiveAll(fixture.c);
    assert.equal(fixture.sqlite.prepare('SELECT status FROM email WHERE email_id=2').get().status, 6);
});

sqlTest('twenty-message batches drain all 25 deliveries without skipping the oldest five', async t => {
    const fixture = database(t);
    addAccount(fixture);
    for (let id = 1; id <= 25; id++) {
        addMail(fixture, id);
        await fixture.emailService.completeReceive(fixture.c, 0, id);
    }
    const first = await poll(fixture, 0);
    assert.equal(first.length, 20);
    assert.deepEqual(first.map(row => row.emailId), Array.from({ length: 20 }, (_, i) => i + 1));
    const second = await poll(fixture, first.at(-1).deliveryId);
    assert.deepEqual(second.map(row => row.emailId), [21, 22, 23, 24, 25]);
    assert.deepEqual(await poll(fixture, second.at(-1).deliveryId), []);
});

sqlTest('an older email completed after a newer email is delivered after the existing cursor', async t => {
    const fixture = database(t);
    addAccount(fixture);
    addMail(fixture, 1);
    addMail(fixture, 2);
    await fixture.emailService.completeReceive(fixture.c, 0, 2);
    const first = await poll(fixture, 0);
    assert.deepEqual(first.map(row => row.emailId), [2]);
    await fixture.emailService.completeReceive(fixture.c, 0, 1);
    const second = await poll(fixture, first[0].deliveryId);
    assert.deepEqual(second.map(row => row.emailId), [1]);
    assert.ok(second[0].deliveryId > first[0].deliveryId);
});

sqlTest('a failed completion batch rolls back visibility and delivery sequence together', async t => {
    const fixture = database(t);
    addAccount(fixture);
    addMail(fixture, 1);
    await fixture.delivery.ensure(fixture.c);
    fixture.failBatch(1);
    await assert.rejects(fixture.emailService.completeReceive(fixture.c, 0, 1), /Synthetic D1/);
    const row = fixture.sqlite.prepare('SELECT is_del,status FROM email WHERE email_id=1').get();
    assert.equal(row.is_del, 1);
    assert.equal(row.status, 6);
    assert.equal(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM email_delivery').get().count, 0);
});

sqlTest('repeated completion is idempotent and deleting the last delivery does not reuse its cursor', async t => {
    const fixture = database(t);
    addAccount(fixture);
    addMail(fixture, 1);
    await fixture.emailService.completeReceive(fixture.c, 0, 1);
    await fixture.emailService.completeReceive(fixture.c, 0, 1);
    const first = await poll(fixture, 0);
    assert.equal(first.length, 1);
    fixture.sqlite.prepare('DELETE FROM email WHERE email_id=1').run();
    addMail(fixture, 2);
    await fixture.emailService.completeReceive(fixture.c, 0, 2);
    const second = await poll(fixture, first[0].deliveryId);
    assert.equal(second.length, 1);
    assert.ok(second[0].deliveryId > first[0].deliveryId);
});

sqlTest('legacy email-ID polling returns the oldest new messages instead of jumping over them', async t => {
    const fixture = database(t);
    addAccount(fixture);
    for (let id = 1; id <= 25; id++) addMail(fixture, id, 0, 0);
    const rows = await fixture.emailService.latest(fixture.c, { emailId: 0, accountId: 1, allReceive: 0 }, 10);
    assert.deepEqual(rows.map(row => row.emailId), Array.from({ length: 20 }, (_, i) => i + 1));
});

sqlTest('deleted mailboxes are excluded from polling, totals and the initial delivery cursor', async t => {
    const fixture = database(t);
    addAccount(fixture);
    addMail(fixture, 1);
    await fixture.emailService.completeReceive(fixture.c, 0, 1);
    fixture.sqlite.prepare('UPDATE account SET is_del=1').run();
    assert.deepEqual(await poll(fixture, 0, { allReceive: 1 }), []);
    const page = await fixture.emailService.list(fixture.c, { emailId: 0, accountId: 1, allReceive: 1, size: 50, timeSort: 0, type: 0 }, 10);
    assert.equal(page.total, 0);
    assert.deepEqual(page.list, []);
    assert.equal(page.latestEmail.deliveryId, 0);
});

sqlTest('internal delivery matches mixed-case addresses and publishes only completed messages', async t => {
    const fixture = database(t);
    addAccount(fixture);
    addMail(fixture, 999, 1, 0);
    fixture.sqlite.prepare('UPDATE email SET type=1,user_id=20,account_id=2 WHERE email_id=999').run();
    await fixture.emailService.HandleOnSiteEmail(fixture.c, ['mixed@example.test'], {
        emailId: 999, sendEmail: 'sender@example.test', userId: 20, accountId: 2, isDel: 0,
    }, []);
    const rows = await poll(fixture, 0);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].userId, 10);
    assert.equal(rows[0].accountId, 1);
    assert.equal(rows[0].status, 0);
});

test('attachment storage retries transient failures without duplicating metadata', async () => {
    let uploads = 0, inserts = 0;
    const service = workerObject('service/att-service.js', 'attService', {
        r2Service: { putObj: async () => { if (++uploads < 3) throw new Error('Transient storage failure'); } },
        sleep: async () => {},
        orm: () => ({ insert: () => ({ values: () => ({ run: async () => inserts++ }) }) }),
        att: {},
    });
    await service.addAtt({}, [{ key: 'test', content: new Uint8Array([65]), filename: 'test.txt', mimeType: 'text/plain' }]);
    assert.equal(uploads, 3);
    assert.equal(inserts, 1);
});

test('attachment storage stops after three failures and never saves success metadata', async () => {
    let uploads = 0, inserts = 0;
    const service = workerObject('service/att-service.js', 'attService', {
        r2Service: { putObj: async () => { uploads++; throw new Error('Storage unavailable'); } },
        sleep: async () => {},
        orm: () => ({ insert: () => { inserts++; } }),
        att: {},
    });
    await assert.rejects(service.addAtt({}, [{ key: 'test', content: new Uint8Array([65]) }]), /Storage unavailable/);
    assert.equal(uploads, 3);
    assert.equal(inserts, 0);
});

test('receive failure propagates without marking success and preserves raw UTF-8 bytes across chunks', async () => {
    let completed = 0, rawInput;
    const raw = new TextEncoder().encode('Synthetic \u4f60\u597d message');
    const handler = receiveHandler({
        ...constants,
        PostalMime: { parse: async bytes => {
            rawInput = new Uint8Array(bytes);
            return { from: { address: 'sender@example.test' }, to: [], attachments: [
                { filename: 'test.txt', content: new Uint8Array([65]), mimeType: 'text/plain' },
            ] };
        } },
        settingService: { query: async () => ({ receive: 0, noRecipient: 1 }) },
        accountService: { selectByEmailIncludeDel: async () => ({ userId: 10, accountId: 1 }) },
        userService: { selectByIdIncludeDel: async () => ({ email: 'admin@example.test' }) },
        emailService: { receive: async (c, params) => ({ ...params, emailId: 1 }),
            completeReceive: async () => { completed++; } },
        attService: { addAtt: async () => { throw new Error('Storage unavailable'); } },
        aiService: { extractCode: async () => '' },
        emailUtils: { getName: value => value.split('@')[0] },
        constant: { ATTACHMENT_PREFIX: 'attachments/' },
        fileUtils: { getBuffHash: async () => 'test', getExtFileName: () => '.txt' },
        console: { error() {} },
    });
    await assert.rejects(handler({
        to: 'Mixed@example.test',
        raw: new ReadableStream({ start(controller) {
            controller.enqueue(raw.slice(0, 12)); controller.enqueue(raw.slice(12)); controller.close();
        } }),
    }, { admin: 'admin@example.test' }, {}), /Storage unavailable/);
    assert.deepEqual(rawInput, raw);
    assert.equal(completed, 0);
});
