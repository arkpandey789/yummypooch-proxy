import { Handler } from "@netlify/functions";

export const handler: Handler = async (event) => {
  try {
    // figure out what path+query the user asked for
    const rawPath = event.path.replace(/^\/\.netlify\/functions\/proxy/, "") || "/";
    const query   = event.rawQuery ? "?" + event.rawQuery : "";
    const upstreamUrl = `https://www.yummypooch.com${rawPath}${query}`;

    // forward the request to Shopify
    const shopRes = await fetch(upstreamUrl, {
      method:  event.httpMethod,
      headers: { ...event.headers, host: "www.yummypooch.com" },
      body:    ["GET","HEAD"].includes(event.httpMethod) ? undefined : event.body,
      redirect:"manual",
    });

    // copy + scrub response headers
    const headers = {};
    shopRes.headers.forEach((v,k) => {
      const key = k.toLowerCase();
      if (!["content-length","content-encoding","transfer-encoding","connection"].includes(key)
          && key !== "x-frame-options"
          && key !== "content-security-policy") {
        headers[k] = v;
      }
    });
    // inject permissive framing
    headers["X-Frame-Options"]         = "ALLOWALL";
    headers["Content-Security-Policy"] = "frame-ancestors *";

    const contentType = shopRes.headers.get("content-type") || "";

    if (contentType.includes("text/html")) {
      // pull in the HTML
      let html = await shopRes.text();

      // rewrite absolute Shopify URLs → relative
      html = html
        .replace(/https:\/\/www\.yummypooch\.com\//g, "/")
        .replace(/(href|src|action)=["']https:\/\/www\.yummypooch\.com/g, "$1=\"");

      // prefix all relative links/forms/assets with our function
      html = html.replace(/(href|src|action)=["']\//g, '$1="/.netlify/functions/proxy/');

      // inject a small proxy-script before </body>
      const injector = `<script>
  document.addEventListener('DOMContentLoaded', () => {
    // proxy-ify all forms
    document.querySelectorAll('form').forEach(form => {
      if (!form.dataset._proxied) {
        form.dataset._proxied = true;
        const act = form.getAttribute('action') || '/';
        if (act.startsWith('/')) form.action = '/.netlify/functions/proxy' + act;
      }
    });
    // proxy-ify fetch()
    const _fetch = window.fetch;
    window.fetch = (url, opts) => {
      if (typeof url === 'string' && url.startsWith('/')) {
        url = '/.netlify/functions/proxy' + url;
      }
      return _fetch(url, opts);
    };
    // proxy-ify XHR
    const _open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(m,u,...) {
      if (typeof u === 'string' && u.startsWith('/')) {
        u = '/.netlify/functions/proxy' + u;
      }
      return _open.call(this, m, u, ...arguments);
    };
  });
</script></body>`;
      html = html.replace(/<\/body>/i, injector);

      return {
        statusCode: shopRes.status,
        headers,
        body: html,
      };
    } else {
      // for images, CSS, JSON, etc. – base64
      const buf = await shopRes.arrayBuffer();
      return {
        statusCode: shopRes.status,
        headers,
        body: Buffer.from(buf).toString("base64"),
        isBase64Encoded: true,
      };
    }
  } catch (err) {
    return { statusCode: 500, body: `Proxy error: ${err.message}` };
  }
};
