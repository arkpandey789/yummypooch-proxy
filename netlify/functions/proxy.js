import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { builder } from "@netlify/functions";

const app = express();
app.use(cors());

app.get("*", async (req, res) => {
  try {
    // Build target Shopify URL
    const path = req.originalUrl || "/";
    const targetUrl = `https://www.yummypooch.com${path}`;

    // Fetch Shopify page
    const shopifyRes = await fetch(targetUrl, {
      headers: { "User-Agent": req.headers["user-agent"] || "" }
    });
    let html = await shopifyRes.text();

    // Rewrite all absolute Shopify links to relative
    html = html.replace(/https:\/\/www\.yummypooch\.com/g, "");

    // Force allow embedding
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Frame-Options", "ALLOWALL");

    return res.send(html);
  } catch (err) {
    return res.status(500).send(`Proxy error: ${err.toString()}`);
  }
});

// Expose the Express app as a Netlify Function
export const handler = builder(app);
