import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as vue from 'vue';
import { parse, babelParse, compileTemplate } from 'vue/compiler-sfc';

const source = readFileSync(new URL('../src/components/tiny-editor/index.vue', import.meta.url), 'utf8');
const { descriptor } = parse(source);
const script = descriptor.scriptSetup.content;
const functions = babelParse(script, { sourceType: 'module' }).program.body.filter(node => node.type === 'FunctionDeclaration');

test('Escape from the editor toolbar does not reach the compose dialog', () => {
    const compiled = compileTemplate({ source: descriptor.template.content, filename: 'tiny-editor.vue', id: 'editor-keyboard-test' }).code;
    const imports = babelParse(compiled, { sourceType: 'module' }).program.body.filter(node => node.type === 'ImportDeclaration');
    let body = compiled;
    for (const node of [...imports].reverse()) body = body.slice(0, node.start) + body.slice(node.end);
    body = body.replace('export function render', 'function render');
    const bindings = imports.flatMap(node => node.specifiers);
    const render = new Function(...bindings.map(binding => binding.local.name), body + '\nreturn render;')(
        ...bindings.map(binding => binding.imported.name === 'resolveComponent' ? name => name : vue[binding.imported.name]),
    );
    const root = render({ showLoading: false, failed: false, editorId: 'test', allowEditorUiFocus() {}, $t: value => value }, []);
    let stopped = 0;
    root.props.onKeydown({ key: 'Enter', stopPropagation: () => stopped++ });
    assert.equal(stopped, 0);
    root.props.onKeydown({ key: 'Escape', stopPropagation: () => stopped++ });
    assert.equal(stopped, 1);
});

test('editor portals use the next shared overlay level on every opening', () => {
    const sinks = [{ style: {}, addEventListener() {} }, { style: {}, addEventListener() {} }];
    let level = 2010;
    const node = functions.find(node => node.id.name === 'raiseEditorUi');
    const raise = new Function('document', 'nextZIndex', 'stopEditorUiEscape', script.slice(node.start, node.end) + '\nreturn raiseEditorUi;')(
        { querySelectorAll: selector => {
            assert.equal(selector, '.tox-tinymce-aux');
            return sinks;
        } },
        () => ++level,
        () => {},
    );
    raise();
    assert.deepEqual(sinks.map(sink => sink.style.zIndex), ['2011', '2011']);
    raise();
    assert.deepEqual(sinks.map(sink => sink.style.zIndex), ['2012', '2012']);
});

test('Escape closes the editor dialog without reaching the outer compose dialog', () => {
    const node = functions.find(node => node.id.name === 'stopEditorUiEscape');
    let closed = 0;
    let stopped = 0;
    const stopEscape = new Function('editor', script.slice(node.start, node.end) + '\nreturn stopEditorUiEscape;')({
        value: { windowManager: { close: () => closed++ } },
    });
    stopEscape({ key: 'Enter', stopPropagation: () => stopped++ });
    assert.equal(closed, 0);
    assert.equal(stopped, 0);
    stopEscape({ key: 'Escape', stopPropagation: () => stopped++ });
    assert.equal(closed, 1);
    assert.equal(stopped, 1);
});

test('only focus moving into editor portals bypasses the compose focus trap', () => {
    const node = functions.find(node => node.id.name === 'allowEditorUiFocus');
    const allowFocus = new Function(script.slice(node.start, node.end) + '\nreturn allowEditorUiFocus;')();
    let stopped = 0;
    allowFocus({ relatedTarget: null, stopPropagation: () => stopped++ });
    allowFocus({ relatedTarget: { closest: () => null }, stopPropagation: () => stopped++ });
    assert.equal(stopped, 0);
    allowFocus({ relatedTarget: { closest: selector => {
        assert.equal(selector, '.tox-tinymce-aux');
        return {};
    } }, stopPropagation: () => stopped++ });
    assert.equal(stopped, 1);
});
