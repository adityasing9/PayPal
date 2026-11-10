import { EventEmitter } from 'node:events';

/**
 * Dispatches an in-memory HTTP request to an Express application without requiring network sockets.
 * Works seamlessly within sandboxed environments where TCP socket binding is restricted.
 *
 * @param {import('express').Express} app
 * @param {{
 *   method?: string,
 *   url: string,
 *   headers?: Record<string, string>,
 *   cookies?: Record<string, string>,
 *   body?: any
 * }} options
 * @returns {Promise<{ status: number, headers: Record<string, string>, body: any }>}
 */
export function dispatchRequest(app, { method = 'GET', url, headers = {}, cookies = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter();
    const parsedUrl = new URL(url, 'http://localhost');
    req.method = method.toUpperCase();
    req.url = url;
    req.originalUrl = url;
    req.headers = { ...headers };
    req.cookies = { ...cookies };
    req.query = Object.fromEntries(parsedUrl.searchParams);
    req.params = {};
    req.connection = { remoteAddress: '127.0.0.1' };
    req.socket = { remoteAddress: '127.0.0.1' };

    // Format headers
    for (const [k, v] of Object.entries(headers)) {
      req.headers[k.toLowerCase()] = v;
    }

    if (cookies && Object.keys(cookies).length > 0) {
      req.headers['cookie'] = Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
    }

    if (body !== null && typeof body === 'object') {
      req.body = body;
      req.rawBody = Buffer.from(JSON.stringify(body));
      req.headers['content-type'] = req.headers['content-type'] || 'application/json';
    }

    const resHeaders = {};
    let statusCode = 200;
    let responseBody = '';

    const res = new EventEmitter();
    res.statusCode = 200;
    res.setHeader = (name, val) => {
      resHeaders[name.toLowerCase()] = val;
    };
    res.getHeader = (name) => resHeaders[name.toLowerCase()];
    res.removeHeader = (name) => {
      delete resHeaders[name.toLowerCase()];
    };
    res.hasHeader = (name) => Object.prototype.hasOwnProperty.call(resHeaders, name.toLowerCase());
    res.status = (code) => {
      statusCode = code;
      res.statusCode = code;
      return res;
    };
    res.cookie = (name, val, options = {}) => {
      resHeaders['set-cookie'] = `${name}=${val}; Path=${options.path || '/'}`;
      return res;
    };
    res.clearCookie = (name) => {
      resHeaders['set-cookie'] = `${name}=; Max-Age=0`;
      return res;
    };
    res.json = (data) => {
      resHeaders['content-type'] = 'application/json; charset=utf-8';
      responseBody = data;
      res.emit('finish');
      resolve({ status: statusCode, headers: resHeaders, body: responseBody });
      return res;
    };
    res.send = (data) => {
      responseBody = data;
      res.emit('finish');
      resolve({ status: statusCode, headers: resHeaders, body: responseBody });
      return res;
    };
    res.end = (data) => {
      if (data) responseBody = data;
      res.emit('finish');
      resolve({ status: statusCode, headers: resHeaders, body: responseBody });
    };

    try {
      app.handle(req, res, (err) => {
        if (err) reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}
