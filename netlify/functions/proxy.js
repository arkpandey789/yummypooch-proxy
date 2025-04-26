import express from "express";
import cors from "cors";
import { builder } from "@netlify/functions";

const app = express();
app.use(cors());

// helper: strip the Netlify prefix so we don't loop
const stripPrefix = (url) => {
  // Handle both with and without query parameters
  const baseUrl = url.split('?')[0];
  const queryParams = url.includes('?') ? url.substring(url.indexOf('?')) : '';
  const cleanPath = baseUrl.replace(/^\/\.netlify\/functions\/proxy\/?/, "");
  return cleanPath + queryParams;
};

app.all("*", async (req, res) => {
  try {
    const path = stripPrefix(req.originalUrl) || "/";
    const shopifyUrl = `https://www.yummypooch.com${path.startsWith('/') ? path : '/' + path}`;
    
    console.log(`Proxying request to: ${shopifyUrl}`);

    // Copy all headers from the original request
    const headers = { ...req.headers };
    
    // Remove host header to avoid conflicts
    delete headers.host;
    
    // Use the same HTTP method as the original request
    const shopRes = await fetch(shopifyUrl, {
      method: req.method,
      headers: headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
      redirect: 'follow'
    });

    // Copy status code from Shopify response
    res.status(shopRes.status);
    
    // Copy headers from Shopify response
    for (const [key, value] of shopRes.headers.entries()) {
      // Skip certain headers that might cause issues
      if (!['content-length', 'content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    }

    // Override specific headers for proper framing
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    res.setHeader("X-Frame-Options", "ALLOWALL");

    // Handle different content types appropriately
    const contentType = shopRes.headers.get('content-type') || '';
    
    if (contentType.includes('text/html')) {
      let html = await shopRes.text();
      
      // Rewrite absolute links to relative links
      html = html.replace(/https:\/\/www\.yummypooch\.com\//g, "/");
      html = html.replace(/href="https:\/\/www\.yummypooch\.com/g, 'href="');
      html = html.replace(/action="https:\/\/www\.yummypooch\.com/g, 'action="');
      html = html.replace(/src="https:\/\/www\.yummypooch\.com/g, 'src="');
      
      // Ensure all relative URLs start with the function path
      html = html.replace(/href="\//g, 'href="/.netlify/functions/proxy/');
      html = html.replace(/action="\//g, 'action="/.netlify/functions/proxy/');
      html = html.replace(/src="\//g, 'src="/.netlify/functions/proxy/');
      
      // Fix any form submissions
      html = html.replace(/<form([^>]*)>/g, '<form$1 data-proxy-adjusted="true">');
      
      // Inject a small script to handle form submissions and ajaxs calls
      html = html.replace('</body>', `
        <script>
          document.addEventListener('DOMContentLoaded', function() {
            // Handle form submissions
            document.querySelectorAll('form:not([data-proxy-handled])').forEach(form => {
              form.setAttribute('data-proxy-handled', 'true');
              form.addEventListener('submit', function(e) {
                const action = this.getAttribute('action');
                if (action && !action.includes('/.netlify/functions/proxy')) {
                  this.setAttribute('action', '/.netlify/functions/proxy' + (action.startsWith('/') ? action : '/' + action));
                }
              });
            });
            
            // Override fetch and XMLHttpRequest to proxy requests
            const originalFetch = window.fetch;
            window.fetch = function(url, options) {
              if (url && typeof url === 'string' && url.startsWith('/') && !url.startsWith('/.netlify/functions/proxy')) {
                url = '/.netlify/functions/proxy' + url;
              }
              return originalFetch(url, options);
            };
            
            const originalOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url, ...rest) {
              if (url && typeof url === 'string' && url.startsWith('/') && !url.startsWith('/.netlify/functions/proxy')) {
                url = '/.netlify/functions/proxy' + url;
              }
              return originalOpen.call(this, method, url, ...rest);
            };
          });
        </script>
      </body>`);
      
      res.send(html);
    } else {
      // For non-HTML responses, just pipe through the response body
      const buffer = await shopRes.arrayBuffer();
      res.send(Buffer.from(buffer));
    }
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).send(`Internal proxy error: ${err.message}`);
  }
});

// Export for Netlify
export const handler = builder(app);
