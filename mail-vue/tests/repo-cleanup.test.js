import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parse, babelParse } from 'vue/compiler-sfc';

test('all configured editor plugins and runtime assets remain available', () => {
    const source = readFileSync(new URL('../src/components/tiny-editor/index.vue', import.meta.url), 'utf8');
    const { descriptor } = parse(source);
    const program = babelParse(descriptor.scriptSetup.content, { sourceType: 'module' }).program;
    const initEditor = program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'initEditor');
    const config = initEditor.body.body.find(node => node.type === 'ReturnStatement').argument.arguments[0];
    const plugins = config.properties.find(property => property.key.name === 'plugins').value.value.split(/\s+/);
    const assets = [
        'tinymce.min.js',
        'icons/default/icons.min.js',
        'models/dom/model.min.js',
        'themes/silver/theme.min.js',
        'langs/zh_CN.js',
        'skins/ui/oxide/skin.min.css',
        'skins/ui/oxide/content.min.css',
        'skins/ui/oxide-dark/skin.min.css',
        'skins/ui/oxide-dark/content.min.css',
        'skins/content/default/content.min.css',
        'skins/content/dark/content.min.css',
        'css/index.css',
        'plugins/emoticons/js/emojis.min.js',
        ...plugins.map(plugin => `plugins/${plugin}/plugin.min.js`),
    ];
    for (const asset of assets) {
        assert.ok(existsSync(new URL(`../public/tinymce/${asset}`, import.meta.url)), asset);
    }
});

test('worker test deployment is explicitly named and unused dependencies are absent', () => {
    const frontend = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const worker = JSON.parse(readFileSync(new URL('../../mail-worker/package.json', import.meta.url), 'utf8'));
    assert.equal(worker.scripts['deploy:test'], 'wrangler deploy --config wrangler-test.toml');
    assert.equal(worker.scripts.test, undefined);
    assert.equal(frontend.dependencies.path, undefined);
    assert.equal(worker.dependencies['@cloudflare/vite-plugin'], undefined);
    assert.equal(worker.devDependencies.vitest, undefined);
    assert.equal(worker.devDependencies['@cloudflare/vitest-pool-workers'], undefined);
});
