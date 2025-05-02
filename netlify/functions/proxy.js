// ESM syntax (package.json has "type": "module")
import fetch from 'node-fetch';

export async function handler(event) {
  try {
    // Reconstruct path + query
    const rawPath = event.path.replace(/^\/\.netlify\/functions\/proxy/, '') || '/';
    const query   = event.rawQuery ? '?' + event.rawQuery : '';
    const upstreamUrl = `https://www.yummypooch.com${rawPath}${query}`;

    // Forward request to Shopify
    const shopRes = await fetch(upstreamUrl, {
      method:  event.httpMethod,
      headers: { ...event.headers, host: 'www.yummypooch.com' },
      body:    ['GET','HEAD'].includes(event.httpMethod) ? undefined : event.body,
      redirect: 'manual',
    });

    // Collect and scrub headers
    const respHeaders = {};
    shopRes.headers.forEach((value, key) => {
      const k = key.toLowerCase();
      if (!['content-length','content-encoding','transfer-encoding','connection','x-frame-options','content-security-policy']
          .includes(k)) {
        respHeaders[key] = value;
      }
    });
    // Inject permissive framing
    respHeaders['X-Frame-Options'] = 'ALLOWALL';
    respHeaders['Content-Security-Policy'] = 'frame-ancestors *';

    const contentType = shopRes.headers.get('content-type') || '';

    // Handle HTML specially
    if (contentType.includes('text/html')) {
      let html = await shopRes.text();

      // Rewrite absolute Shopify URLs → relative
      html = html
        .replace(/https:\/\/www\.yummypooch\.com\//g, '/')
        .replace(/(href|src|action)=["']https:\/\/www\.yummypooch\.com/g, '$1="');

      // Prefix all relative links/forms/assets with proxy
      html = html.replace(/(href|src|action)=["']\//g,
        '$1="/.netlify/functions/proxy/');

      // Inject client-side proxy script before </body>
      const snippet = `<script>
(function(){
  document.addEventListener('DOMContentLoaded',()=>{
    // Proxy-ify forms
    document.querySelectorAll('form').forEach(f=>{
      if(!f.dataset._proxied){
        f.dataset._proxied = true;
        let act = f.getAttribute('action')||'/';
        if(act.startsWith('/')) f.action = '/.netlify/functions/proxy'+act;
      }
    });
    // Proxy-ify fetch
    const _fetch = window.fetch;
    window.fetch = (u, o) => {
      if(typeof u==='string' && u.startsWith('/')) u = '/.netlify/functions/proxy'+u;
      return _fetch(u, o);
    };
    // Proxy-ify XHR
    const _open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(m, u, ...a) {
      if(typeof u==='string' && u.startsWith('/')) u = '/.netlify/functions/proxy'+u;
      return _open.call(this, m, u, ...a);
    };
  });
})();
</script></body>`;
      html = html.replace(/<\/body>/i, snippet);

      return {
        statusCode: shopRes.status,
        headers: respHeaders,
        body: html,
      };
    }

    // For non-HTML (images, CSS, JSON), return base64
    const buf = await shopRes.arrayBuffer();
    return {
      statusCode: shopRes.status,
      headers: respHeaders,
      body: Buffer.from(buf).toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    return { statusCode: 500, body: `Proxy error: ${err.message}` };
  }
}
