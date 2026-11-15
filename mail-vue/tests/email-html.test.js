import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, isSafeEmailUrl } from '../src/utils/email-html.js';

test('allows only absolute web and mail links', () => {
    for (const value of ['https://example.test/mail', 'http://example.test', 'mailto:reader@example.test']) {
        assert.equal(isSafeEmailUrl(value), true, value);
    }
    for (const value of ['javascript:alert(1)', 'java\nscript:alert(1)', '\u0000javascript:alert(1)', 'data:text/html,test', 'file:///C:/secret', '//example.test', '/relative', '#section']) {
        assert.equal(isSafeEmailUrl(value), false, value);
    }
});

test('allows raster images but rejects active data and mailto images', () => {
    for (const value of ['https://example.test/logo.png', 'data:image/png;base64,iVBOR', 'data:image/jpeg;base64,test']) {
        assert.equal(isSafeEmailUrl(value, 'image'), true, value);
    }
    for (const value of ['data:image/svg+xml,<svg/>', 'data:text/html,<script/>', 'mailto:reader@example.test', 'javascript:alert(1)', 'blob:https://example.test/id']) {
        assert.equal(isSafeEmailUrl(value, 'image'), false, value);
    }
});

test('escapes plain text before inserting it into a reply or forward', () => {
    assert.equal(escapeHtml('<img onerror="alert(1)">&\''), '&lt;img onerror=&quot;alert(1)&quot;&gt;&amp;&#39;');
    assert.equal(escapeHtml('Normal message'), 'Normal message');
    assert.equal(escapeHtml(), '');
    assert.equal(escapeHtml(null), '');
});
