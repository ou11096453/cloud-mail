export function isSafeEmailUrl(value, kind = 'link') {
    try {
        const url = new URL(value.trim());
        if (['http:', 'https:'].includes(url.protocol)) return true;
        if (kind === 'link') return url.protocol === 'mailto:';
        return /^data:image\/(?:png|jpeg|gif|webp|bmp);/i.test(value.trim());
    } catch {
        return false;
    }
}

export function parseEmailHtml(html = '') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, iframe, object, embed, base, meta, link, form, input, button, textarea, select, svg, math').forEach(node => node.remove());
    doc.querySelectorAll('*').forEach(node => {
        for (const attribute of [...node.attributes]) {
            const name = attribute.name.toLowerCase();
            if (name.startsWith('on') || ['srcdoc', 'srcset', 'action', 'formaction', 'autofocus', 'id', 'name'].includes(name)) {
                node.removeAttribute(attribute.name);
            }
        }
        if (node.hasAttribute('href')) {
            const href = node.getAttribute('href').trim();
            if (!isSafeEmailUrl(href)) node.removeAttribute('href');
        }
        if (node.hasAttribute('src')) {
            const src = node.getAttribute('src').trim();
            if (node.tagName !== 'IMG' || !isSafeEmailUrl(src, 'image')) {
                node.removeAttribute('src');
            }
        }
        if (node.tagName === 'A') {
            node.setAttribute('target', '_blank');
            node.setAttribute('rel', 'noopener noreferrer');
        }
    });
    return doc;
}

export function emailFrameDocument(html) {
    const doc = parseEmailHtml(html);
    const csp = doc.createElement('meta');
    csp.httpEquiv = 'Content-Security-Policy';
    csp.content = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src https: http: data:; base-uri 'none'; form-action 'none'";
    doc.head.prepend(csp);
    const style = doc.createElement('style');
    style.textContent = `
        html { color-scheme: light; background: #fff; overflow-x: auto; height: auto !important; }
        body { margin: 0; padding: 8px; box-sizing: border-box; min-width: 0;
            height: auto !important; min-height: 0 !important; max-height: none !important;
            font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            color: #13181d; overflow-wrap: anywhere; }
        img { max-width: 100%; height: auto; }
        pre { white-space: pre-wrap; overflow-wrap: anywhere; }
        a { color: #0e70df; }
    `;
    doc.head.append(style);
    return '<!doctype html>' + doc.documentElement.outerHTML;
}

export function emailHtmlToText(html) {
    const doc = parseEmailHtml(html);
    doc.querySelectorAll('style, title').forEach(node => node.remove());
    return doc.body.textContent || '';
}

export function escapeHtml(text = '') {
    return String(text ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}
