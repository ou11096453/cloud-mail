import { readFileSync } from 'node:fs';
import { babelParse } from 'vue/compiler-sfc';

export const { DatabaseSync } = await import('node:sqlite').catch(() => ({}));
export const readWorker = path => readFileSync(new URL(`../../mail-worker/src/${path}`, import.meta.url), 'utf8');
const program = source => babelParse(source, { sourceType: 'module' }).program.body;

export function workerObject(path, name, dependencies = {}) {
    const source = readWorker(path);
    const object = program(source).find(node => node.type === 'VariableDeclaration' &&
        node.declarations[0].id.name === name).declarations[0].init;
    return new Function(...Object.keys(dependencies), `return (${source.slice(object.start, object.end)});`)(
        ...Object.values(dependencies),
    );
}

export function receiveHandler(dependencies) {
    const source = readWorker('email/email.js');
    const functions = program(source).map(node => node.type === 'ExportNamedDeclaration' ? node.declaration : node)
        .filter(node => node?.type === 'FunctionDeclaration').map(node => source.slice(node.start, node.end)).join('\n');
    return new Function(...Object.keys(dependencies), functions + '\nreturn email;')(...Object.values(dependencies));
}

const constantSource = readWorker('const/entity-const.js');
export const constants = new Function(program(constantSource).filter(node => node.type === 'ExportNamedDeclaration')
    .map(node => constantSource.slice(node.declaration.start, node.declaration.end)).join('\n') +
    '\nreturn {emailConst, settingConst, isDel};')();

function table(path) {
    const source = readWorker(path);
    const declaration = program(source).find(node => node.type === 'ExportNamedDeclaration' &&
        node.declaration?.declarations?.[0]?.init?.callee?.name === 'sqliteTable').declaration.declarations[0].init;
    const name = declaration.arguments[0].value;
    const columns = declaration.arguments[1].properties.map(property => {
        let call = property.value;
        while (call.callee.type === 'MemberExpression') call = call.callee.object;
        return [property.key.name, {
            sql: `${name}.${call.arguments[0].value}`, params: [],
            name: call.arguments[0].value, integer: call.callee.name === 'integer',
        }];
    });
    const result = Object.fromEntries(columns);
    Object.defineProperty(result, 'tableName', { value: name });
    return result;
}

const scalar = value => value?.sql ? value : { sql: '?', params: [value] };
const compare = operator => (a, b) => {
    a = scalar(a); b = scalar(b);
    return { sql: `${a.sql} ${operator} ${b.sql}`, params: [...a.params, ...b.params] };
};
const combine = operator => (...items) => ({
    sql: `(${items.map(item => item.sql).join(` ${operator} `)})`, params: items.flatMap(item => item.params),
});
export const expressions = {
    eq: compare('='), gt: compare('>'), lt: compare('<'), and: combine('AND'), or: combine('OR'),
    asc: column => `${column.sql} ASC`, desc: column => `${column.sql} DESC`,
    sql: (parts, ...values) => ({
        sql: parts.reduce((text, part, i) => text + part + (i < values.length ? scalar(values[i]).sql : ''), ''),
        params: values.flatMap(value => scalar(value).params),
    }),
    count: () => ({ sql: 'COUNT(*)', params: [] }),
};

export function database(t) {
    const sqlite = new DatabaseSync(':memory:');
    t.after(() => sqlite.close());
    sqlite.exec('PRAGMA foreign_keys = ON');
    const email = table('entity/email.js');
    const account = table('entity/account.js');
    const star = table('entity/star.js');
    const att = table('entity/att.js');
    const emailDelivery = table('entity/email-delivery.js');
    for (const model of [email, account, star, att]) {
        const columns = Object.values(model).map((column, index) => `${column.name} ${
            index === 0 ? 'INTEGER PRIMARY KEY AUTOINCREMENT' :
                column.integer ? 'INTEGER DEFAULT 0' : "TEXT DEFAULT ''"
        }`);
        sqlite.exec(`CREATE TABLE ${model.tableName} (${columns.join(',')})`);
    }
    sqlite.exec('CREATE UNIQUE INDEX account_email_nocase ON account(email COLLATE NOCASE)');
    const queries = [];
    let failBatchAt = -1;
    const db = {
        prepare(sql) {
            const statement = (params = []) => ({
                sql, params,
                bind: (...values) => statement(values),
                first: async () => sqlite.prepare(sql).get(...params),
                run: async () => sqlite.prepare(sql).run(...params),
                all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
            });
            return statement();
        },
        async batch(statements) {
            sqlite.exec('BEGIN');
            try {
                const results = statements.map((statement, i) => {
                    queries.push(statement.sql);
                    if (i === failBatchAt) throw new Error('Synthetic D1 batch failure');
                    return sqlite.prepare(statement.sql).run(...statement.params);
                });
                sqlite.exec('COMMIT');
                return results;
            } catch (error) {
                sqlite.exec('ROLLBACK');
                throw error;
            }
        },
    };
    const projection = model => Object.entries(model).map(([key, column]) => `${column.sql} AS ${key}`).join(',');
    const mapRow = (model, row) => row && Object.fromEntries(Object.entries(model).map(([key, col]) => [key, row[col.name]]));
    const orm = () => ({
        select(fields) {
            let from, condition, order = [], limit, joins = [];
            const query = {
                from(model) { from = model; fields ??= model; return query; },
                leftJoin(model, on) { joins.push([model, on]); return query; },
                where(value) { condition = value; return query; },
                orderBy(...values) { order = values; return query; },
                limit(value) { limit = value; return query; },
                async all() {
                    let sql = `SELECT ${projection(fields)} FROM ${from.tableName}`;
                    const params = [];
                    for (const [model, on] of joins) { sql += ` LEFT JOIN ${model.tableName} ON ${on.sql}`; params.push(...on.params); }
                    if (condition) { sql += ` WHERE ${condition.sql}`; params.push(...condition.params); }
                    if (order.length) sql += ` ORDER BY ${order.join(',')}`;
                    if (limit !== undefined) { sql += ' LIMIT ?'; params.push(limit); }
                    return sqlite.prepare(sql).all(...params);
                },
                get() { return query.all().then(rows => rows[0]); },
                then(resolve, reject) { return query.all().then(resolve, reject); },
            };
            return query;
        },
        insert(model) {
            let rows;
            const query = {
                values(values) { rows = Array.isArray(values) ? values : [values]; return query; },
                returning() { return query; },
                async run() {
                    return rows.map(row => {
                        const entries = Object.entries(row).filter(([key]) => model[key]);
                        const sql = `INSERT INTO ${model.tableName} (${entries.map(([key]) => model[key].name).join(',')})
                            VALUES (${entries.map(() => '?').join(',')}) RETURNING *`;
                        return mapRow(model, sqlite.prepare(sql).get(...entries.map(([, value]) => value)));
                    });
                },
                get() { return query.run().then(rows => rows[0]); },
            };
            return query;
        },
        update(model) {
            let values, condition;
            const query = {
                set(value) { values = value; return query; },
                where(value) { condition = value; return query; },
                async run() {
                    const entries = Object.entries(values);
                    return sqlite.prepare(`UPDATE ${model.tableName} SET ${entries.map(([key]) => `${model[key].name} = ?`).join(',')}
                        WHERE ${condition.sql}`).run(...entries.map(([, value]) => value), ...condition.params);
                },
            };
            return query;
        },
    });
    const delivery = workerObject('service/email-delivery-service.js', 'emailDeliveryService', { initialization: new WeakMap() });
    const services = {
        orm, email, account, star, att, emailDelivery, emailDeliveryService: delivery,
        ...constants, ...expressions,
        accountService: { selectById: async () => ({ allReceive: 0 }) },
        settingService: { query: async () => ({ noRecipient: 1 }) },
        roleService: {
            selectByUserIds: async () => [{ userId: 10, banEmail: '', availDomain: '' }],
            hasAvailDomainPerm: () => true, isBanEmail: () => false,
        },
        emailUtils: { getName: value => value.split('@')[0] },
    };
    const emailService = workerObject('service/email-service.js', 'emailService', services);
    emailService.emailAddAtt = async () => {};
    return { sqlite, db, c: { env: { db, admin: 'sender@example.test' } }, orm, att, delivery, emailService, queries,
        failBatch: index => { failBatchAt = index; } };
}
