/**
 * Opaque-Box E2E HTTP Client Wrapper
 * Supports structured requests, automatic JSON handling, latency measurement,
 * and authorization shortcuts across QuickCart and Appsolve endpoints.
 */

class HttpClient {
  constructor(options = {}) {
    this.quickcartBaseUrl = options.quickcartBaseUrl || process.env.QUICKCART_URL || 'http://localhost:4000';
    this.appsolveBaseUrl = options.appsolveBaseUrl || process.env.APPSOLVE_URL || 'http://localhost:3001';
    this.defaultTimeoutMs = options.timeoutMs || 10000;
    this.bridgeSecret = options.bridgeSecret || process.env.QUICKCART_BRIDGE_SECRET || 'quickcart-sre-secret-token';
  }

  setQuickcartUrl(url) {
    this.quickcartBaseUrl = url.replace(/\/$/, '');
  }

  setAppsolveUrl(url) {
    this.appsolveBaseUrl = url.replace(/\/$/, '');
  }

  resolveUrl(path, target = 'quickcart') {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    const base = target === 'appsolve' ? this.appsolveBaseUrl : this.quickcartBaseUrl;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${cleanPath}`;
  }

  async request(method, path, options = {}) {
    const target = options.target || (path.includes('/telemetry/signals') || path.includes('/api/v1/services') || path.includes('/api/v1/status') || path.includes('/api/v1/incidents') ? 'appsolve' : 'quickcart');
    const url = this.resolveUrl(path, target);

    const headers = {
      'Accept': 'application/json',
      ...(options.headers || {})
    };

    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
    }

    if (options.bridgeToken) {
      headers['Authorization'] = `Bearer ${options.bridgeToken}`;
      headers['X-Appsolve-Bridge-Token'] = options.bridgeToken;
    }

    let body = options.body;
    if (body !== undefined && typeof body !== 'string' && !(body instanceof Buffer)) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      body = JSON.stringify(body);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || this.defaultTimeoutMs);
    const start = Date.now();

    try {
      const response = await fetch(url, {
        method: method.toUpperCase(),
        headers,
        body,
        signal: controller.signal
      });

      const durationMs = Date.now() - start;
      clearTimeout(timeout);

      const contentType = response.headers.get('content-type') || '';
      let responseBody;
      if (contentType.includes('application/json')) {
        try {
          responseBody = await response.json();
        } catch (e) {
          responseBody = await response.text();
        }
      } else {
        responseBody = await response.text();
      }

      return {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: response.headers,
        body: responseBody,
        durationMs,
        url
      };
    } catch (err) {
      clearTimeout(timeout);
      const durationMs = Date.now() - start;
      if (err.name === 'AbortError') {
        const timeoutErr = new Error(`HTTP request timed out after ${options.timeoutMs || this.defaultTimeoutMs}ms: ${method} ${url}`);
        timeoutErr.code = 'ETIMEDOUT';
        timeoutErr.durationMs = durationMs;
        throw timeoutErr;
      }
      err.durationMs = durationMs;
      err.url = url;
      throw err;
    }
  }

  async get(path, options = {}) {
    return this.request('GET', path, options);
  }

  async post(path, body, options = {}) {
    return this.request('POST', path, { ...options, body });
  }

  async patch(path, body, options = {}) {
    return this.request('PATCH', path, { ...options, body });
  }

  async put(path, body, options = {}) {
    return this.request('PUT', path, { ...options, body });
  }

  async delete(path, options = {}) {
    return this.request('DELETE', path, options);
  }

  // QuickCart bridge helper
  async bridgeExec(command, params = {}, options = {}) {
    const bridgeToken = options.bridgeToken !== undefined ? options.bridgeToken : this.bridgeSecret;
    const body = { command, params, ...options.extraBody };
    const headers = options.headers || {};
    if (bridgeToken) {
      headers['Authorization'] = `Bearer ${bridgeToken}`;
      headers['X-Appsolve-Bridge-Token'] = bridgeToken;
    }
    return this.post('/api/bridge/v1/exec', body, {
      ...options,
      headers,
      target: 'quickcart'
    });
  }

  // Appsolve telemetry signal helper
  async sendTelemetry(signal, options = {}) {
    return this.post('/api/v1/telemetry/signals', signal, {
      ...options,
      target: 'appsolve'
    });
  }
}

const defaultClient = new HttpClient();

module.exports = {
  HttpClient,
  client: defaultClient
};
