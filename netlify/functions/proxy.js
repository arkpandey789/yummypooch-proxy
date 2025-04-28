import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { builder } from "@netlify/functions";

const app = express();

// allow all origins (Adalo WebView)
app.use(cors());

// make sure we can proxy POST/PUT bodies
app.use(express.raw({ type: "*/*", limit: "10mb" }));

// helper to strip the Netlify Functions prefix
function stripPrefix(originalUrl) {
  const [base, query] = originalUrl.split("?");
  const cleanBase = base.replace(/^\/.netlify\/functions\/proxy/, "");
  return cleanBase + (query ? "?" + query : "");
}

app.all("/*", async (req, res) => {
  const path = stripPrefix(req.originalUrl) || "/";
  const target = `https://www.yummypooch.com${path.startsWith("/") ? path : "/" + path}`;

  try {
    // forward the request to Shopify
    const shopRes = await fetch(target, {
      method: req.method,
      headers: {
        ...req.headers,
        host: "www.yummypooch.com",        // ensure correct host
      },
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
      redirect: "manual",
    });

    // copy status
    res.status(shopRes.status);

    // copy response headers (including Set-Cookie)
    shopRes.headers.forEach((value, key) => {
      if (!["content-length", "content-encoding", "transfer-encoding", "connection"].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    // override frame-busting and allow embedding in Adalo
    res.setHeader("X-Frame-Options", "ALLOWALL");
    res.setHeader("Content-Security-Policy", "frame-ancestors *;");

    const contentType = shopRes.headers.get("content-type") || "";

    if (contentType.includes("text/html")) {
      let html = await shopRes.text();

      // rewrite absolute Shopify URLs → relative
      html = html.replace(/https:\/\/www\.yummypooch\.com\//g, "/");
      html = html.replace(/(href|src|action)=["']https:\/\/www\.yummypooch\.com/g, '$1="');

      // prefix all relative links/forms/assets with our function
      html = html.replace(/(href|src|action)=["']\//g, `$1="/.netlify/functions/proxy/`);

      // inject a small script before </body> that
      // • rewrites any dynamic fetch()/XHR to go through us
      // • fixes any remaining form actions
      const injector = `<script>
  document.addEventListener('DOMContentLoaded', function() {
    // proxy-ify forms
    document.querySelectorAll('form').forEach(form => {
      if (!form.dataset.proxyHandled) {
        form.dataset.proxyHandled = 'true';
        let act = form.getAttribute('action') || '/';
        if (act.startsWith('/')) {
          form.action = '/.netlify/functions/proxy' + act;
        }
      }
    });
    // proxy-ify fetch
    const _fetch = window.fetch;
    window.fetch = function(input, init) {
      if (typeof input === 'string' && input.startsWith('/')) {
        input = '/.netlify/functions/proxy' + input;
      }
      return _fetch(input, init);
    };
    // proxy-ify XHR
    const _open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
      if (typeof url === 'string' && url.startsWith('/')) {
        url = '/.netlify/functions/proxy' + url;
      }
      return _open.call(this, method, url, ...args);
    };
  });
</script>`;

      html = html.replace(/<\/body>/i, injector + "</body>");
      return res.send(html);
    }

    // non-HTML (images, CSS, JS, JSON, etc.)
    const buf = await shopRes.arrayBuffer();
    return res.send(Buffer.from(buf));
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).send("Internal proxy error");
  }
});

// Netlify Functions entrypoint
export const handler = builder(app);
