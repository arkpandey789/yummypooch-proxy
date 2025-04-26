
import fetch from 'node-fetch';

export async function handler(event) {
  try {
    // Grab the requested path from the query string (?path=...)
    const path = event.queryStringParameters && event.queryStringParameters.path ? event.queryStringParameters.path : '/';
    // Build the Shopify URL
    const targetUrl = `https://www.yummypooch.com${path}`;
    const response = await fetch(targetUrl, {
      headers: {
        // Pass through user agent so Shopify serves proper mobile/desktop version
        'User-Agent': event.headers['user-agent'] || ''
      }
    });
    const html = await response.text();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Allow embedding inside your Adalo WebView
        'X-Frame-Options': 'ALLOWALL'
      },
      body: html
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: 'Proxy error: ' + err.toString()
    };
  }
}
