import fetch from "node-fetch";

export const handler = async (event) => {
  try {
    // reconstruct path + query
    const rawPath = event.path.replace(/^\/\.netlify\/functions\/proxy/, "") || "/";
    const query   = event.rawQuery ? "?" + event.rawQuery : "";
    const upstreamUrl = `https://www.yummypooch.com${rawPath}${query}`;

    // fetch from Shopify
    const shopRes = await fetch(upstreamUrl, {
      method:  event.httpMethod,
      headers: { ...event.headers, host: "www.yummypooch.com" },
      body:    ["GET","HEAD"].includes(event.httpMethod) ? undefined : event.body,
      redirect:"manual",
    });

    // copy and scrub headers
    const respHeaders = {};
    shopRes.headers.forEach((v,k) => {
      const key = k.toLowerCase();
      if (!["content-length","content-encoding","transfer-encoding","connection",
            "x-frame-options","content-security-policy"].includes(key)) {
        respHeaders[k] = v;
      }
    });
    // inject permissive framing
    respHeaders["X-Frame-Options"]         = "ALLOWALL";
    respHeaders["Content-Security-Policy"] = "frame-ancestors *";

    const contentType = shopRes.headers.get("content-type") || "";

    if (contentType.includes("text/html")) {
      let html = await shopRes.text();

      // rewrite absolute Shopify URLs → relative
      html = html
        .replace(/https:\/\/www\.yummypooch\.com\//g, "/")
        .replace(/(href|src|action)=["']https:\/\/www\.yummypooch\.com/g, '$1="');

      // prefix all relative links/forms/assets
      html = html.replace(/(href|src|action)=["']\//g,
        '$1="/.netlify/functions/proxy/');

      // inject client-side proxy script before </body>
      const injector = `<script>
(function(){
  document.addEventListener('DOMContentLoaded', ()=>{
    document.querySelectorAll('form').forEach(f=>{
      if(!f.dataset.proxied){
        f.dataset.proxied = "1";
        let a = f.getAttribute('action')||'/';
        if(a.startsWith('/')) f.action = '/.netlify/functions/proxy' + a;
      }
    });
    const _fetch = window.fetch;
    window.fetch = (u, opts) => {
      if(typeof u==='string' && u.startsWith('/'))
        u = '/.netlify/functions/proxy' + u;
      return _fetch(u, opts);
    };
    const _open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(m, u, ...a){
      if(typeof u==='string' && u.startsWith('/'))
        u = '/.netlify/functions/proxy' + u;
      return _open.call(this, m, u, ...a);
    };
  });
})();
</script></body>`;
      html = html.replace(/<\/body>/i, injector);

      return {
        statusCode: shopRes.status,
        headers: respHeaders,
        body: html,
      };
    } else {
      // binary (images, CSS, JSON, etc.)
      const buf = await shopRes.arrayBuffer();
      return {
        statusCode: shopRes.status,
        headers: respHeaders,
        body: Buffer.from(buf).toString("base64"),
        isBase64Encoded: true,
      };
    }
  } catch (err) {
    return { statusCode: 500, body: `Proxy error: ${err.message}` };
  }
};


