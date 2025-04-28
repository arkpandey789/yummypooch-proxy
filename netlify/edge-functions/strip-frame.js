export default async (request, context) => {
  // Rewrite incoming URL to Shopify
  const upstreamUrl = new URL(
    request.url.replace(context.site.url, "https://www.yummypooch.com")
  );
  const res = await fetch(upstreamUrl, request);

  // Clone and scrub headers
  const headers = new Headers(res.headers);
  headers.delete("x-frame-options");
  // Overwrite CSP to allow any framing
  headers.set("content-security-policy", "frame-ancestors *");

  // Return the modified response
  return new Response(res.body, { status: res.status, headers });
};

export const config = { path: "/*" };
