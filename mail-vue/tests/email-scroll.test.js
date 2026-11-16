import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as vue from 'vue';
import { parse, compileScript, compileTemplate, babelParse } from 'vue/compiler-sfc';

const source = readFileSync(new URL('../src/components/email-scroll/index.vue', import.meta.url), 'utf8');
const { descriptor } = parse(source);
const script = compileScript(descriptor, { id: 'email-scroll-test', genDefaultAs: 'component' }).content;
const imports = babelParse(script, { sourceType: 'module' }).program.body.filter(node => node.type === 'ImportDeclaration');
// Run the actual SFC setup with Vue's renderer, substituting browser and store dependencies.
let setupSource = script;
for (const node of [...imports].reverse()) {
    setupSource = setupSource.slice(0, node.start) + setupSource.slice(node.end);
}
const bindings = imports.flatMap(node => node.specifiers.map(specifier => ({
    local: specifier.local.name,
    imported: specifier.imported?.name ?? 'default',
})));
const createComponent = new Function(...bindings.map(binding => binding.local), 'DOMRect', 'window', 'requestAnimationFrame', 'navigator', 'ElMessage', 'console', setupSource + '\nreturn component;');

const header = descriptor.template.ast.children[0].children.find(node =>
    node.type === 1 && node.props.some(prop => prop.name === 'class' && prop.value?.content === 'mailbox-header'));
const compiledHeader = compileTemplate({ source: header.loc.source, filename: 'email-scroll.vue', id: 'mailbox-header-test' }).code;
const headerImports = babelParse(compiledHeader, { sourceType: 'module' }).program.body.filter(node => node.type === 'ImportDeclaration');
let headerSource = compiledHeader;
for (const node of [...headerImports].reverse()) {
    headerSource = headerSource.slice(0, node.start) + headerSource.slice(node.end);
}
headerSource = headerSource.replace('export function render', 'function render');
const headerBindings = headerImports.flatMap(node => node.specifiers);
const renderHeader = new Function(...headerBindings.map(binding => binding.local.name), headerSource + '\nreturn render;')(
    ...headerBindings.map(binding => binding.imported.name === 'resolveComponent' ? name => name : vue[binding.imported.name]),
);

function findNode(node, className) {
    if (node?.props?.class?.split(' ').includes(className)) return node;
    for (const child of Array.isArray(node?.children) ? node.children : []) {
        const match = findNode(child, className);
        if (match) return match;
    }
}

function mailboxHeader(state) {
    return renderHeader({ ...state, showAccountIcon: true, $t: value => value }, []);
}

const renderer = vue.createRenderer({
    createElement: () => ({}),
    createText: () => ({}),
    createComment: () => ({}),
    insert() {},
    remove() {},
    setText() {},
    setElementText() {},
    parentNode: () => null,
    nextSibling: () => null,
    patchProp() {},
});

function mountList(t, type = 'email', options = {}) {
    const requests = [];
    const accountState = vue.reactive({ currentAccount: options.account });
    const uiState = vue.reactive({ accountShow: false });
    const copiedTexts = [];
    const messages = [];
    const copyErrors = [];
    const arrivedState = vue.reactive({ bottom: false });
    const scrollMeasure = { bottom: false, calls: 0 };
    const timers = { pause: 0, resume: 0 };
    const mocks = {
        useEmailStore: () => vue.reactive({}),
        useAccountStore: () => accountState,
        useUiStore: () => uiState,
        useSettingStore: () => vue.reactive({ settings: { manyEmail: options.manyEmail ?? 0 } }),
        hasPerm: () => true,
        fromNow: value => String(value),
        useI18n: () => ({ t: value => value }),
        EmailUnreadEnum: { READ: 1, UNREAD: 0 },
        useScroll: () => ({
            arrivedState,
            measure: () => {
                scrollMeasure.calls++;
                arrivedState.bottom = scrollMeasure.bottom;
            },
        }),
        useMediaQuery: () => vue.ref(false),
        useEventListener() {},
        useResizeObserver() {},
        useIntervalFn: () => ({
            pause: () => timers.pause++,
            resume: () => timers.resume++,
        }),
        emailHtmlToText: value => value,
    };
    const component = createComponent(
        ...bindings.map(binding => vue[binding.imported] ?? mocks[binding.local] ?? {}),
        { fromRect: value => value }, {}, callback => callback(),
        { clipboard: { writeText: async text => {
            if (options.clipboardError) throw options.clipboardError;
            copiedTexts.push(text);
        } } },
        message => messages.push(message), { error: (...args) => copyErrors.push(args) },
    );
    component.render = () => null;
    const app = renderer.createApp(component, {
        type,
        getEmailList(emailId, size, signal) {
            let resolve, reject;
            const result = new Promise((res, rej) => { resolve = res; reject = rej; });
            requests.push({ emailId, size, signal, resolve, reject });
            return result;
        },
    });
    const vm = app.mount({});
    let mounted = true;
    const unmount = () => {
        if (!mounted) return;
        mounted = false;
        app.unmount();
    };
    t.after(unmount);
    return { api: vm.$.exposed, state: vm.$.setupState, instance: vm.$, requests, arrivedState, scrollMeasure, timers, unmount, accountState, uiState, copiedTexts, messages, copyErrors };
}

test('mailbox copy uses the current full address without toggling the switcher', async t => {
    const firstEmail = 'first-long-mailbox-address@example.test';
    const { state, accountState, uiState, copiedTexts, messages } = mountList(t, 'email', { account: { email: firstEmail } });
    const header = mailboxHeader(state);
    const identity = findNode(header, 'mailbox-identity');
    const copy = findNode(header, 'mailbox-copy');
    const switcher = findNode(header, 'mailbox-switcher');
    assert.ok(identity.children.includes(copy));
    assert.ok(identity.children.includes(switcher));
    assert.equal(findNode(switcher, 'mailbox-copy'), undefined);
    assert.equal(copy.props.disabled, false);
    assert.equal(copy.props['aria-label'], `copy: ${firstEmail}`);
    assert.equal(copy.props.title, 'copy');
    await copy.props.onClick();
    assert.deepEqual(copiedTexts, [firstEmail]);
    assert.equal(uiState.accountShow, false);
    assert.equal(messages[0].type, 'success');
    switcher.props.onClick();
    assert.equal(uiState.accountShow, true);
    accountState.currentAccount = { email: 'second@example.test' };
    await findNode(mailboxHeader(state), 'mailbox-copy').props.onClick();
    assert.deepEqual(copiedTexts, [firstEmail, 'second@example.test']);
    assert.equal(uiState.accountShow, true);
});

test('mailbox copy is disabled when there is no address and never copies the placeholder', async t => {
    const { state, copiedTexts, messages } = mountList(t);
    const copy = findNode(mailboxHeader(state), 'mailbox-copy');
    assert.equal(state.currentMailboxLabel, 'emailAccount');
    assert.equal(copy.props.disabled, true);
    await copy.props.onClick();
    assert.deepEqual(copiedTexts, []);
    assert.deepEqual(messages, []);
});

test('mailbox copy works when switching is unavailable and reports clipboard failures', async t => {
    const error = new Error('Clipboard access denied');
    const { state, uiState, messages, copyErrors } = mountList(t, 'email', {
        account: { email: 'only@example.test' }, manyEmail: 1, clipboardError: error,
    });
    const header = mailboxHeader(state);
    assert.equal(findNode(header, 'mailbox-switcher'), undefined);
    assert.ok(findNode(header, 'mailbox-current'));
    await findNode(header, 'mailbox-copy').props.onClick();
    assert.equal(uiState.accountShow, false);
    assert.deepEqual(messages, [{ message: 'copyFailMsg', type: 'error', plain: true }]);
    assert.equal(copyErrors[0][1], error);
});

test('the shared clipboard action still copies verification codes', async t => {
    const { state, copiedTexts, messages } = mountList(t);
    await state.copyText('012345');
    assert.deepEqual(copiedTexts, ['012345']);
    assert.equal(messages[0].message, 'copySuccessMsg');
});

const message = emailId => ({ emailId, text: `Message ${emailId}`, createTime: 1 });
async function complete(request, ids, total = ids.length) {
    request.resolve({ list: ids.map(message), total, latestEmail: ids.length ? message(ids[0]) : null });
    await vue.nextTick();
    await vue.nextTick();
}

test('refresh starts immediately and ignores a late response even if its transport ignores abort', async t => {
    const { api, state, requests } = mountList(t);
    api.refreshList();
    assert.equal(requests.length, 2);
    assert.equal(requests[0].signal.aborted, true);
    await complete(requests[0], [99]);
    assert.equal(state.loading, true);
    assert.equal(api.emailList.length, 0);
    await complete(requests[1], [2]);
    assert.deepEqual(api.emailList.map(item => item.emailId), [2]);
    assert.equal(state.loading, false);
    assert.equal(state.loadError, false);
});

test('canceled failures do not reset loading or show an error for the current request', async t => {
    const { api, state, requests } = mountList(t);
    api.refreshList();
    api.refreshList();
    assert.equal(requests.length, 3);
    requests[0].reject(new Error('canceled'));
    requests[1].reject(new Error('canceled'));
    await vue.nextTick();
    assert.equal(state.loading, true);
    assert.equal(state.loadError, false);
    await complete(requests[2], [3]);
    assert.deepEqual(api.emailList.map(item => item.emailId), [3]);
});

test('pagination is locked while loading and refresh can supersede it', async t => {
    const { api, state, requests } = mountList(t);
    await complete(requests[0], Array.from({ length: 50 }, (_, i) => 100 - i), 100);
    state.loadData();
    state.loadData();
    assert.equal(requests.length, 2);
    assert.equal(requests[1].emailId, 51);
    assert.equal(state.followLoading, true);
    api.refreshList();
    assert.equal(requests.length, 3);
    assert.equal(requests[1].signal.aborted, true);
    assert.equal(requests[2].emailId, 0);
    await complete(requests[2], [5]);
    await complete(requests[1], [50]);
    assert.deepEqual(api.emailList.map(item => item.emailId), [5]);
});

test('a failed request can be retried and exhausted lists can be refreshed', async t => {
    const { api, state, requests } = mountList(t);
    requests[0].reject(new Error('offline'));
    await vue.nextTick();
    await vue.nextTick();
    assert.equal(state.loadError, true);
    assert.equal(state.loading, false);
    api.refreshList();
    await complete(requests[1], []);
    assert.equal(state.loadError, false);
    assert.equal(api.noLoading.value, true);
    api.refreshList();
    await complete(requests[2], [6]);
    assert.equal(api.emailList[0].emailId, 6);
});

test('refresh remeasures the top position instead of paginating from the old bottom state', async t => {
    const { api, requests, arrivedState, scrollMeasure } = mountList(t);
    const ids = Array.from({ length: 50 }, (_, i) => 100 - i);
    await complete(requests[0], ids, 100);
    arrivedState.bottom = true;
    api.refreshList();
    await complete(requests[1], ids, 100);
    assert.equal(arrivedState.bottom, false);
    assert.equal(scrollMeasure.calls, 2);
    assert.equal(requests.length, 2);
});

test('bulk removal handles duplicate and absent IDs and mark-read updates only matching rows', async t => {
    const { api, state, requests } = mountList(t);
    await complete(requests[0], [1, 2, 3], 10);
    api.emailList.forEach(item => { item.checked = true; item.unread = 0; });
    state.localRead([2, 2, 99]);
    assert.equal(api.emailList[1].unread, 1);
    assert.equal(api.emailList[1].checked, false);
    assert.equal(api.emailList[0].unread, 0);
    api.deleteEmail([1, 1, 99]);
    assert.deepEqual(api.emailList.map(item => item.emailId), [2, 3]);
    assert.equal(api.total.value, 9);
});

test('unmount aborts pending work, and cached views pause and resume their time updates', async t => {
    const { instance, requests, timers, unmount } = mountList(t, 'draft');
    instance.da.forEach(hook => hook());
    assert.equal(timers.pause, 1);
    instance.a.forEach(hook => hook());
    assert.equal(timers.resume, 1);
    unmount();
    assert.equal(requests[0].signal.aborted, true);
    await complete(requests[0], [8]);
    assert.equal(instance.exposed.emailList.length, 0);
});
