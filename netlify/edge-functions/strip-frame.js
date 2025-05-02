export default async (request, context) => {
  // Build Shopify URL from incoming path + query
  const url = new URL(request.url);
  const upstream = new URL(`https://www.yummypooch.com${url.pathname}${url.search}`);

  // Proxy the request—including method, headers, body—to Shopify
  const shopRes = await fetch(upstream.toString(), request);

  // Clone & scrub response headers
  const headers = new Headers(shopRes.headers);
  headers.delete("x-frame-options");
  headers.set("content-security-policy", "frame-ancestors *");

  // Return the *raw* body stream so the HTML/CSS/JS is byte-for-byte identical
  return new Response(shopRes.body, {
    status: shopRes.status,
    headers,
  });
};

export const config = { path: "/*" };