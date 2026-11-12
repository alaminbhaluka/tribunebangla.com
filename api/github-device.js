const CLIENT_ID = 'Ov23li7AwN8CsaUeZiY9';
const DEVICE_ENDPOINT = 'https://github.com/login/device/code';
const TOKEN_ENDPOINT = 'https://github.com/login/oauth/access_token';
const ALLOWED_ORIGINS = new Set(['https://tribunebangla.com', 'https://www.tribunebangla.com']);

function respond(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return respond(res, 405, { error: 'method_not_allowed' });
  }

  const origin = req.headers.origin;
  if (!ALLOWED_ORIGINS.has(origin)) return respond(res, 403, { error: 'origin_not_allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (error) {
      return respond(res, 400, { error: 'invalid_json' });
    }
  }
  if (!body || typeof body !== 'object') return respond(res, 400, { error: 'invalid_request' });

  const params = new URLSearchParams({ client_id: CLIENT_ID });
  let endpoint;
  if (body.action === 'device') {
    endpoint = DEVICE_ENDPOINT;
    params.set('scope', 'public_repo');
  } else if (body.action === 'poll' && typeof body.device_code === 'string' && body.device_code.length <= 512) {
    endpoint = TOKEN_ENDPOINT;
    params.set('device_code', body.device_code);
    params.set('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');
  } else {
    return respond(res, 400, { error: 'invalid_request' });
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Tribune-Bangla-CMS'
      },
      body: params
    });
    const result = await response.json();
    if (!response.ok) return respond(res, 502, { error: 'github_auth_unavailable' });
    return respond(res, 200, result);
  } catch (error) {
    console.error('GitHub device authorization request failed:', error);
    return respond(res, 502, { error: 'github_auth_unavailable' });
  }
};
