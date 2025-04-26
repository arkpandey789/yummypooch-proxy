import express from "express";
import cors from "cors";
import { builder } from "@netlify/functions";

const app = express();
app.use(cors());

// helper: strip the Netlify prefix so we don't loop
const stripPrefix = (url) =>
  url.replace(/^\/\.netlify\/functions\/proxy/, "");

app.get("*", async (req, res) => {
  try {
    const path = stripPrefix(req.originalUrl) || "/";
    const shopifyUrl = `https://www.yummypooch.com${path}`;

    // native fetch (Node 18+) – no node-fetch needed
    const shopRes = await fetch(shopifyUrl, {
      headers: { "user-agent": req.headers["user-agent"] || "" }
    });

    let html = await shopRes.text();

    // rewrite absolute links so they stay on the proxy domain
    html = html.replace(/https:\/\/www\.yummypooch\.com/g, "");

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Frame-Options", "ALLOWALL");
    res.status(200).send(html);
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).send("Internal proxy error");
  }
});

// export for Netlify
export const handler = builder(app);
