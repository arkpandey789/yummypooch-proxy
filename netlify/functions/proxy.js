import { handler as serverlessHandler } from '@netlify/functions';

export const handler = async (event, context) => {
  try {
    // Get path from event
    const path = event.path.replace('/.netlify/functions/proxy', '') || '/';
    const shopifyUrl = `https://www.yummypooch.com${path.startsWith('/') ? path : '/' + path}`;
    
    console.log(`Proxying request to: ${shopifyUrl}`);
    
    // Forward query parameters
    const queryString = event.rawQuery ? `?${event.rawQuery}` : '';
    const fullUrl = `${shopifyUrl}${queryString}`;
    
    // Prepare headers
    const headers = { ...event.headers };
    delete headers.host;
    delete headers['x-forwarded-host'];
    
    // Make the request to Shopify
    const response = await fetch(fullUrl, {
      method: event.httpMethod,
      headers: headers,
      body: event.body ? event.body : undefined
    });
    
    // Read the response body
    const responseBody = await response.text();
    
    // Process HTML responses only
    let processedBody = responseBody;
    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('text/html')) {
      // Basic URL rewriting - just enough to make navigation work
      processedBody = responseBody.replace(/href="https:\/\/www\.yummypooch\.com\//g, 'href="/.netlify/functions/proxy/');
      processedBody = processedBody.replace(/action="https:\/\/www\.yummypooch\.com\//g, 'action="/.netlify/functions/proxy/');
    }
    
    // Prepare response headers
    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      if (!['content-length', 'content-encoding', 'transfer-encoding'].includes(key.toLowerCase())) {
        responseHeaders[key] = value;
      }
    });
    
    // Add essential headers for iframe embedding
    responseHeaders['Content-Type'] = contentType;
    responseHeaders['X-Frame-Options'] = 'ALLOWALL';
    responseHeaders['Access-Control-Allow-Origin'] = '*';
    
    return {
      statusCode: response.status,
      body: processedBody,
      headers: responseHeaders
    };
  } catch (error) {
    console.error('Proxy error:', error);
    return {
      statusCode: 500,
      body: `Proxy error: ${error.message}`,
      headers: {
        'Content-Type': 'text/plain'
      }
    };
  }
};
