import express from "express";
import cors from "cors";
import { builder } from "@netlify/functions";

const app = express();
app.use(cors());

// helper: strip the Netlify prefix so we don't loop
const stripPrefix = (url) =>
  url.replace(/^\/\.netlify\/functions\/proxy/, "");

// The base path for our proxy function
const proxyPath = "/.netlify/functions/proxy";

app.all("*", async (req, res) => { // Use app.all to handle POST etc. if needed later
  try {
    const path = stripPrefix(req.originalUrl) || "/";
    const shopifyUrl = `https://www.yummypooch.com${path}`;

    console.log(`Proxying request for: ${path} to ${shopifyUrl}`);

    // Forward essential headers (add more if needed)
    const headersToSend = {
        "user-agent": req.headers["user-agent"] || "",
        "accept": req.headers["accept"] || "*/*",
        "accept-language": req.headers["accept-language"] || "en-US,en;q=0.9",
        // Forwarding cookies might be necessary for cart/session but can be complex
        // "cookie": req.headers["cookie"] || "",
        // Add other headers Shopify might expect if you encounter issues
    };

    const shopRes = await fetch(shopifyUrl, {
      method: req.method, // Forward the original request method
      headers: headersToSend,
      // Forward body for POST requests etc. (Needs body parsing middleware if used)
      // body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
      redirect: 'manual' // Important: Handle redirects manually if needed
    });

    // --- Handle potential redirects from Shopify ---
    if (shopRes.status >= 300 && shopRes.status < 400 && shopRes.headers.has('location')) {
        let location = shopRes.headers.get('location');
        console.log(`Shopify redirected (${shopRes.status}) to: ${location}`);
        // Rewrite the redirect location to point back to the proxy
        if (location.startsWith('https://www.yummypooch.com')) {
            location = location.replace('https://www.yummypooch.com', proxyPath);
        } else if (location.startsWith('/')) {
            // Handle relative redirects
            location = proxyPath + location;
        }
        // Else: it's an external redirect, let it go as is? Or block? For now, let it go.

        console.log(`Rewritten redirect location: ${location}`);
        res.redirect(shopRes.status, location);
        return; // Stop processing
    }
    // --- End redirect handling ---


    // Forward headers from Shopify response back to the client
    // Be careful which headers you forward, avoid security-sensitive ones like set-cookie initially unless needed
    res.setHeader("Content-Type", shopRes.headers.get("Content-Type") || "text/html; charset=utf-8");
    res.setHeader("X-Frame-Options", "ALLOWALL"); // Keep this for Adalo webview
    // You might need to forward other headers like cache-control etc.
    // res.setHeader('Cache-Control', shopRes.headers.get('Cache-Control') || 'no-cache');


    // Handle non-HTML content types (CSS, JS, Images) - Don't rewrite links in these
    const contentType = shopRes.headers.get("Content-Type") || "";
    if (!contentType.includes("text/html")) {
        // For non-HTML, just stream the response body directly
         // Node fetch response body is a ReadableStream
        const bodyStream = shopRes.body;
        if (bodyStream) {
             res.status(shopRes.status);
             bodyStream.pipe(res); // Pipe the stream directly to the response
        } else {
            res.sendStatus(shopRes.status);
        }
        return; // Stop processing
    }


    // --- Process HTML ---
    let html = await shopRes.text();

    // Rewrite absolute links
    html = html.replace(/https:\/\/www\.yummypooch\.com/g, proxyPath);

    // Rewrite root-relative links (href="/...", src="/...")
    // Use a more specific regex to avoid issues with script src etc if possible
     html = html.replace(/(href="|action=")\/(?!\/)/g, `<span class="math-inline">1</span>{proxyPath}/`); // Only for href and form actions
     html = html.replace(/(src=")\/(?!\/)/g, `<span class="math-inline">1</span>{proxyPath}/`); // Handle src separately if needed, be careful with JS/CSS paths

    // You might need more sophisticated rewriting for JavaScript-based navigation or assets loaded via JS

    res.status(shopRes.status).send(html); // Send Shopify's status code

  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).send("Internal proxy error");
  }
});

export const handler = builder(app);
