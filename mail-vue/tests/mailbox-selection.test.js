import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as vue from 'vue';
import { createPinia } from 'pinia';
import { createPersistedState } from 'pinia-plugin-persistedstate';
import { babelParse, compileScript, parse } from 'vue/compiler-sfc';
import { useAccountStore } from '../src/store/account.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const initSource = read('../src/init/init.js');
const initNode = babelParse(initSource, { sourceType: 'module' }).program.body
    .find(node => node.type === 'ExportNamedDeclaration' && node.declaration?.id?.name === 'init').declaration;
const createInit = new Function('useUserStore', 'useSettingStore', 'useAccountStore', 'loginUserInfo',
    'permsToRouter', 'router', 'websiteConfig', 'i18n', 'document', 'localStorage', 'navigator',
    initSource.slice(initNode.start, initNode.end) + '\nreturn init;');

const primary = { accountId: 1, userId: 10, email: 'primary@example.test', name: 'Primary', allReceive: 0 };
const secondary = { accountId: 2, userId: 10, email: 'secondary@example.test', name: 'Secondary', allReceive: 0 };

async function startPage(selectedAccount, manyEmail = 0, savedId = 2) {
    const account = { currentAccountId: savedId, currentAccount: {} };
    const settings = { lang: 'en' };
    const userStore = {};
    const user = { userId: 10, account: primary, currentAccount: selectedAccount, permKeys: ['*'] };
    const requestedIds = [];
    const init = createInit(() => userStore, () => settings, () => account, async id => {
        requestedIds.push(id);
        return user;
    }, () => [], { addRoute() {} }, async () => ({ manyEmail, title: 'Cloud Mail', domainList: ['example.test'] }),
    { global: { locale: { value: 'en' } } }, {}, { getItem: () => 'synthetic-test-session' }, { language: 'en-US' });
    await init();
    return { account, userStore, requestedIds };
}

test('a full page reload restores the validated mailbox before the inbox mounts', async () => {
    const { account, userStore, requestedIds } = await startPage(secondary);
    assert.deepEqual(requestedIds, [2]);
    assert.equal(account.currentAccountId, 2);
    assert.equal(account.currentAccount, secondary);
    assert.equal(userStore.user.account, primary);
});

test('deleted mailboxes and old servers fall back to the primary mailbox', async () => {
    for (const restored of [primary, undefined]) {
        const { account } = await startPage(restored);
        assert.equal(account.currentAccountId, 1);
        assert.equal(account.currentAccount, primary);
    }
});

test('single-mailbox mode does not restore a secondary mailbox', async () => {
    const { account } = await startPage(secondary, 1);
    assert.equal(account.currentAccountId, 1);
    assert.equal(account.currentAccount, primary);
});

test('only the selected mailbox ID is persisted and rehydrated', async () => {
    const values = new Map();
    const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
    const makeStore = () => {
        const pinia = createPinia().use(createPersistedState({ storage }));
        vue.createApp({}).use(pinia);
        return useAccountStore(pinia);
    };
    const original = makeStore();
    original.currentAccountId = 2;
    original.currentAccount = secondary;
    original.$persist();
    assert.deepEqual(JSON.parse(values.get('account')), { currentAccountId: 2 });
    const restored = makeStore();
    assert.equal(restored.currentAccountId, 2);
    assert.deepEqual(restored.currentAccount, {});
});

const accountSfc = parse(read('../src/layout/account/index.vue')).descriptor;
const script = compileScript(accountSfc, { id: 'account-selection-test', genDefaultAs: 'component' }).content;
const imports = babelParse(script, { sourceType: 'module' }).program.body.filter(node => node.type === 'ImportDeclaration');
let setupSource = script;
for (const node of [...imports].reverse()) setupSource = setupSource.slice(0, node.start) + setupSource.slice(node.end);
const bindings = imports.flatMap(node => node.specifiers.map(specifier => ({
    local: specifier.local.name, imported: specifier.imported?.name ?? 'default',
})));
const createAccountComponent = new Function(...bindings.map(binding => binding.local), 'window',
    'ElMessage', 'ElMessageBox', setupSource + '\nreturn component;');
const renderer = vue.createRenderer({
    createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {},
    parentNode: () => null, nextSibling: () => null,
});

async function settle() {
    for (let i = 0; i < 8; i++) await vue.nextTick();
}

function mountSwitcher(t, selected = secondary) {
    const accountState = vue.reactive({ currentAccountId: selected?.accountId ?? 0, currentAccount: selected ?? {} });
    const pages = [[primary, secondary]];
    const requests = [];
    const deleted = [];
    const mocks = {
        useAccountStore: () => accountState,
        useSettingStore: () => vue.reactive({ domainList: ['example.test'], settings: {} }),
        useUserStore: () => vue.reactive({ user: { userId: 10, account: primary } }),
        useUiStore: () => vue.reactive({ accountShow: false }),
        useEmailStore: () => ({}),
        useI18n: () => ({ t: value => value }),
        useMediaQuery: () => vue.ref(false),
        hasPerm: () => true,
        sleep: async () => {},
        accountList: async (...args) => {
            requests.push(args);
            return pages.shift() ?? [];
        },
        accountDelete: async id => deleted.push(id),
        AccountAllReceiveEnum: { DISABLED: 0, ENABLED: 1 },
    };
    const component = createAccountComponent(
        ...bindings.map(binding => vue[binding.imported] ?? mocks[binding.local] ?? {}),
        {}, () => {}, { confirm: async () => {} },
    );
    component.render = () => null;
    const app = renderer.createApp(component);
    const vm = app.mount({});
    t.after(() => app.unmount());
    const state = vm.$.setupState;
    state.scrollbarRef = { setScrollTop() {} };
    return { state, accountState, pages, requests, deleted };
}

test('loading and refreshing the mailbox list preserve the selected mailbox and its metadata', async t => {
    const { state, accountState, pages } = mountSwitcher(t);
    await settle();
    assert.equal(accountState.currentAccountId, 2);
    assert.equal(accountState.currentAccount.email, secondary.email);
    pages.push([primary, { ...secondary, name: 'Updated name' }]);
    state.refresh();
    await settle();
    assert.equal(accountState.currentAccountId, 2);
    assert.equal(accountState.currentAccount.name, 'Updated name');
});

test('a mailbox outside the first page is not replaced by its first item', async t => {
    const selected = { ...secondary, accountId: 40 };
    const { accountState } = mountSwitcher(t, selected);
    await settle();
    assert.equal(accountState.currentAccountId, 40);
    assert.equal(accountState.currentAccount.email, secondary.email);
});

test('an initial selection sets both the mailbox ID and displayed address', async t => {
    const { accountState } = mountSwitcher(t, null);
    await settle();
    assert.equal(accountState.currentAccountId, 1);
    assert.equal(accountState.currentAccount.email, primary.email);
});

test('deleting the selected mailbox falls back to the primary mailbox', async t => {
    const { state, accountState, deleted } = mountSwitcher(t);
    await settle();
    state.remove(state.accounts.find(item => item.accountId === 2));
    await settle();
    assert.deepEqual(deleted, [2]);
    assert.equal(accountState.currentAccountId, 1);
    assert.equal(accountState.currentAccount.email, primary.email);
});

const serviceSource = read('../../mail-worker/src/service/user-service.js');
const serviceNode = babelParse(serviceSource, { sourceType: 'module' }).program.body
    .find(node => node.type === 'VariableDeclaration' && node.declarations[0].id.name === 'userService')
    .declarations[0].init.properties.find(node => node.key.name === 'loginUserInfo');
const createLoginService = new Function('userService', 'accountService', 'roleService', 'permService', 'constant',
    'BizError', 't', 'return ({' + serviceSource.slice(serviceNode.start, serviceNode.end) + '}).loginUserInfo;');

async function restoreServerMailbox(savedId, selected, perms = ['account:query']) {
    const lookups = [];
    const login = createLoginService({ selectById: async () => ({ userId: 10, email: primary.email, type: 1 }) },
        { selectByEmailIncludeDel: async () => primary, selectById: async (c, id) => {
            lookups.push(id);
            return selected;
        } }, { selectById: async () => ({}) }, { userPermKeys: async () => perms },
        { ADMIN_ROLE: {} }, Error, value => value);
    const user = await login({ env: { admin: 'admin@example.test' } }, 10, savedId);
    return { user, lookups };
}

test('server restores only an active mailbox belonging to the signed-in user', async () => {
    const { user, lookups } = await restoreServerMailbox('2', secondary);
    assert.deepEqual(lookups, [2]);
    assert.equal(user.currentAccount, secondary);
    assert.equal(user.account, primary);
    for (const invalid of [undefined, { ...secondary, userId: 11 }]) {
        const { user } = await restoreServerMailbox('2', invalid);
        assert.equal(user.currentAccount, primary);
    }
});

test('invalid IDs and missing mailbox permissions never trigger a secondary lookup', async () => {
    for (const savedId of [undefined, '', 'bad', '0', '-1', '1.5', '9007199254740992']) {
        const { user, lookups } = await restoreServerMailbox(savedId, secondary);
        assert.equal(user.currentAccount, primary);
        assert.deepEqual(lookups, []);
    }
    const { user, lookups } = await restoreServerMailbox('2', secondary, []);
    assert.equal(user.currentAccount, primary);
    assert.deepEqual(lookups, []);
});

test('the inbox queries the displayed mailbox and tags its polling cursor with the same ID', async () => {
    const source = parse(read('../src/views/email/index.vue')).descriptor.scriptSetup.content;
    const node = babelParse(source, { sourceType: 'module' }).program.body
        .find(node => node.type === 'FunctionDeclaration' && node.id.name === 'getEmailList');
    const accountStore = { currentAccountId: 2, currentAccount: secondary };
    const calls = [];
    const response = { list: [], latestEmail: { emailId: 8 } };
    const getList = new Function('accountStore', 'params', 'emailList',
        source.slice(node.start, node.end) + '\nreturn getEmailList;')(
        accountStore, { timeSort: 0 }, async (...args) => {
            calls.push(args);
            return response;
        },
    );
    const signal = new AbortController().signal;
    const result = await getList(0, 50, signal);
    assert.deepEqual(calls[0], [2, 0, 0, 0, 50, 0, signal]);
    assert.equal(result.latestEmail.reqAccountId, 2);
    assert.equal(result.latestEmail.allReceive, 0);
    accountStore.currentAccountId = 1;
    accountStore.currentAccount = primary;
    await getList(0, 50, signal);
    assert.equal(calls[1][0], 1);
    assert.equal(result.latestEmail.reqAccountId, 1);
});
