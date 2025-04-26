import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get('*', async (req, res) => {
  const shopifyURL = `https://www.yummypooch.com${req.originalUrl}`;
  try {
    const response = await fetch(shopifyURL, {
      headers: { 'User-Agent': req.headers['user-agent'] }
    });
    let html = await response.text();

    // ↓ REWRITE absolute links to go through your proxy:
    html = html.replace(/https:\/\/www\.yummypooch\.com/g, '');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // remove frame-blocking header if needed
    res.setHeader('X-Frame-Options', 'ALLOWALL');

    res.send(html);
  } catch (err) {
    res.status(500).send('Proxy error: ' + err.toString());
  }
});

app.listen(PORT, () => {
  console.log(`Proxy running on port ${PORT}`);
});
