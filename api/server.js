/**
 * 山海云枢 API 网关 - 通用 Node.js 服务
 * 兼容: 阿里云FC / 腾讯云SCF / 百度云CFC / Docker / 裸机
 * 合规: 数据不出境 · 输入过滤 · 日志脱敏 · CORS锁定
 */

const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════
// 配置层 - 所有敏感信息走环境变量，零硬编码
// ═══════════════════════════════════════════════════════════
const CONFIG = {
  engines: [
    {
      name: 'zhipu',
      label: '智谱GLM',
      baseUrl: process.env.ZHIPU_API_BASE || 'https://open.bigmodel.cn',
      apiKey: process.env.ZHIPU_API_KEY || '',
      model: process.env.ZHIPU_MODEL || 'glm-4-flash',
      weight: 3,
      timeout: 30000,
    },
    {
      name: 'siliconflow',
      label: '硅基流动',
      baseUrl: process.env.SILICONFLOW_API_BASE || 'https://api.siliconflow.cn',
      apiKey: process.env.SILICONFLOW_API_KEY || '',
      model: process.env.SILICONFLOW_MODEL || 'Qwen/Qwen2.5-7B-Instruct',
      weight: 2,
      timeout: 30000,
    },
    {
      name: 'volcengine',
      label: '火山引擎',
      baseUrl: process.env.VOLCENGINE_API_BASE || 'https://ark.cn-beijing.volces.com',
      apiKey: process.env.VOLCENGINE_API_KEY || '',
      model: process.env.VOLCENGINE_MODEL || 'doubao-lite-4k',
      weight: 1,
      timeout: 30000,
    },
  ],
  adminKey: process.env.ADMIN_KEY || '',
  maxBodySize: 1024 * 1024,
  rateLimitPerMin: 30,
  rateLimitWindow: 60000,
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').filter(Boolean),
  auditLog: process.env.AUDIT_LOG !== 'false',
  dataRegion: process.env.DATA_REGION || 'cn-north',
};

// ═══════════════════════════════════════════════════════════
// 安全层
// ═══════════════════════════════════════════════════════════
const DANGEROUS_PATTERNS = [
  /SELECT\s+.*\s+FROM/i,
  /INSERT\s+INTO/i,
  /DROP\s+TABLE/i,
  /DELETE\s+FROM/i,
  /UNION\s+SELECT/i,
  /<script[\s>]/i,
  /javascript:/i,
  /on\w+\s*=/i,
];

function sanitizeInput(text) {
  if (typeof text !== 'string') return '';
  if (text.length > 8000) text = text.substring(0, 8000);
  for (const p of DANGEROUS_PATTERNS) {
    if (p.test(text)) return null;
  }
  return text;
}

function sanitizeOutput(text) {
  if (typeof text !== 'string') return text;
  text = text.replace(/\d{17}[\dXx]/g, '[已脱敏]');
  text = text.replace(/1[3-9]\d{9}/g, '[已脱敏]');
  text = text.replace(/\d{16,19}/g, '[已脱敏]');
  return text;
}

function audit(action, detail, clientId) {
  if (!CONFIG.auditLog) return;
  console.log('[AUDIT]', JSON.stringify({
    ts: new Date().toISOString(), action, client: clientId || 'anon',
    detail: String(detail).substring(0, 200), region: CONFIG.dataRegion,
  }));
}

// ═══════════════════════════════════════════════════════════
// 限流
// ═══════════════════════════════════════════════════════════
const rateMap = new Map();
function checkRate(clientId) {
  const now = Date.now(), key = clientId || 'default';
  if (!rateMap.has(key)) { rateMap.set(key, { c: 1, t: now + CONFIG.rateLimitWindow }); return true; }
  const r = rateMap.get(key);
  if (now > r.t) { r.c = 1; r.t = now + CONFIG.rateLimitWindow; return true; }
  if (r.c >= CONFIG.rateLimitPerMin) return false;
  r.c++; return true;
}
setInterval(() => { const now = Date.now(); for (const [k, r] of rateMap) if (now > r.t + 60000) rateMap.delete(k); }, 60000);

// ═══════════════════════════════════════════════════════════
// 密钥存储
// ═══════════════════════════════════════════════════════════
const KEYS_FILE = process.env.KEYS_FILE || path.join(__dirname, '.activated_keys.json');
let activatedKeys = {};
try { if (fs.existsSync(KEYS_FILE)) activatedKeys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8')); } catch(e) {}
if (process.env.ACTIVATED_KEYS) {
  process.env.ACTIVATED_KEYS.split(',').forEach(k => {
    const key = k.trim();
    if (key) activatedKeys[key] = { activatedAt: new Date().toISOString(), source: 'env' };
  });
}
function saveKeys() { try { fs.writeFileSync(KEYS_FILE, JSON.stringify(activatedKeys, null, 2)); } catch(e) {} }

// ═══════════════════════════════════════════════════════════
// LLM 调用
// ═══════════════════════════════════════════════════════════
function httpsReq(targetUrl, headers, body, timeout) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const req = https.request({
      hostname: parsed.hostname, port: parsed.port || 443,
      path: parsed.pathname + parsed.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers }, timeout,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(d)); } catch(e) { resolve(d); }
        } else reject(new Error(`HTTP ${res.statusCode}: ${d.substring(0,200)}`));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

async function callEngine(engine, messages) {
  const body = JSON.stringify({ model: engine.model, messages, temperature: 0.7, max_tokens: 2048 });
  const headers = { 'Authorization': `Bearer ${engine.apiKey}` };
  const endpoints = {
    zhipu: `${engine.baseUrl}/api/paas/v4/chat/completions`,
    siliconflow: `${engine.baseUrl}/v1/chat/completions`,
    volcengine: `${engine.baseUrl}/api/v3/chat/completions`,
  };
  return httpsReq(endpoints[engine.name], headers, body, engine.timeout);
}

async function routeCall(messages) {
  const sorted = CONFIG.engines.filter(e => e.apiKey).sort((a,b) => b.weight - a.weight);
  if (!sorted.length) throw new Error('No LLM engine configured');
  const errors = [];
  for (const engine of sorted) {
    try {
      const r = await callEngine(engine, messages);
      return { text: r.choices?.[0]?.message?.content || '[No response]', engine: engine.label };
    } catch(e) {
      errors.push(`${engine.label}: ${e.message}`);
      audit('engine_fail', `${engine.name}: ${e.message}`);
    }
  }
  throw new Error(`All engines failed: ${errors.join('; ')}`);
}

// ═══════════════════════════════════════════════════════════
// 路由处理
// ═══════════════════════════════════════════════════════════
async function handleChat(body, cid) {
  const { messages, key, nodeId } = body;
  if (process.env.REQUIRE_KEY === 'true') {
    if (!key || !activatedKeys[key]) return { status: 403, body: { error: '需要有效激活密钥' } };
  }
  if (!messages?.length) return { status: 400, body: { error: '缺少messages' } };
  for (const m of messages) {
    if (m.content) {
      const safe = sanitizeInput(m.content);
      if (safe === null) { audit('blocked', 'dangerous input', cid); return { status: 400, body: { error: '输入不安全' } }; }
      m.content = safe;
    }
  }
  if (messages[0]?.role !== 'system') {
    messages.unshift({ role: 'system', content: '你是山海云枢AI助理。基于公开信息提供准确专业的回答。涉及商业合作引导联系官方。不做投资或财务承诺。' });
  }
  try {
    const r = await routeCall(messages);
    r.text = sanitizeOutput(r.text);
    audit('chat_ok', `engine=${r.engine}`, cid);
    return { status: 200, body: { reply: r.text, engine: r.engine } };
  } catch(e) {
    audit('chat_fail', e.message, cid);
    return { status: 503, body: { error: 'AI服务暂不可用' } };
  }
}

async function handleActivate(body) {
  if (!CONFIG.adminKey || body.adminKey !== CONFIG.adminKey) return { status: 401, body: { error: '管理员认证失败' } };
  const { count = 1, prefix = 'SH' } = body;
  const newKeys = [];
  for (let i = 0; i < Math.min(count, 100); i++) {
    const key = `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2,8).toUpperCase()}`;
    activatedKeys[key] = { activatedAt: new Date().toISOString(), source: 'admin' };
    newKeys.push(key);
  }
  saveKeys();
  audit('keys_gen', `count=${newKeys.length}`);
  return { status: 200, body: { keys: newKeys, total: Object.keys(activatedKeys).length } };
}

async function handleVerifyKey(q) {
  if (!q.key) return { status: 400, body: { error: '缺少key' } };
  const info = activatedKeys[q.key];
  return { status: 200, body: { valid: !!info, activatedAt: info?.activatedAt } };
}

async function handleDiag(body, cid) {
  const { url: u } = body;
  if (!u || !/^https?:\/\//i.test(u)) return { status: 400, body: { error: '需要合法URL' } };
  const messages = [
    { role: 'system', content: '你是GEO优化顾问。对网站进行5维度GEO评分: 结构化数据完整性/多引擎适配度/语义层丰富度/AI可读性/生态互联度(各0-100)。给总分+分析+3条建议。' },
    { role: 'user', content: `诊断: ${u}` }
  ];
  try {
    const r = await routeCall(messages);
    r.text = sanitizeOutput(r.text);
    audit('diag_ok', u.substring(0,50), cid);
    return { status: 200, body: { report: r.text, engine: r.engine } };
  } catch(e) { return { status: 503, body: { error: '诊断服务暂不可用' } }; }
}

async function handleStatus() {
  const es = CONFIG.engines.map(e => ({ name: e.label, configured: !!e.apiKey, weight: e.weight }));
  return { status: 200, body: {
    version: '2.0.0-cn', name: '山海云枢API网关',
    status: es.some(e => e.configured) ? 'operational' : 'degraded',
    engines: es, activeKeys: Object.keys(activatedKeys).length,
    uptime: process.uptime(), region: CONFIG.dataRegion, ts: new Date().toISOString(),
  }};
}

// ═══════════════════════════════════════════════════════════
// HTTP Server
// ═══════════════════════════════════════════════════════════
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '', size = 0;
    req.on('data', c => { size += c.length; if (size > CONFIG.maxBodySize) { reject(new Error('body too large')); return; } body += c; });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch(e) { reject(new Error('Invalid JSON')); } });
  });
}

function sendJson(res, code, data) {
  const j = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(j), 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });
  res.end(j);
}

function setCors(req, res) {
  const o = req.headers.origin;
  if (!CONFIG.corsOrigins.length || CONFIG.corsOrigins.includes('*') || CONFIG.corsOrigins.includes(o)) {
    res.setHeader('Access-Control-Allow-Origin', o || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Node-ID, X-Key');
  res.setHeader('Access-Control-Max-Age', '86400');
}

const server = http.createServer(async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const parsed = url.parse(req.url, true);
  const p = parsed.pathname, q = parsed.query;
  const cid = req.headers['x-node-id'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (!checkRate(cid)) return sendJson(res, 429, { error: '请求频率超限' });

  try {
    if (p === '/api/chat' && req.method === 'POST') { const r = await handleChat(await parseBody(req), cid); return sendJson(res, r.status, r.body); }
    if (p === '/api/activate' && req.method === 'POST') { const r = await handleActivate(await parseBody(req)); return sendJson(res, r.status, r.body); }
    if (p === '/api/activate' && req.method === 'GET') { const r = await handleVerifyKey(q); return sendJson(res, r.status, r.body); }
    if (p === '/api/diag' && req.method === 'POST') { const r = await handleDiag(await parseBody(req), cid); return sendJson(res, r.status, r.body); }
    if (p === '/api/status' && req.method === 'GET') { const r = await handleStatus(); return sendJson(res, r.status, r.body); }
    if (p === '/health') return sendJson(res, 200, { ok: true });
    if (p === '/' || p === '/index.html') { res.writeHead(302, { Location: '/shanhai-geo/' }); return res.end(); }
    sendJson(res, 404, { error: 'Not found' });
  } catch(e) {
    if (e.message === 'body too large') return sendJson(res, 413, { error: '请求体过大' });
    if (e.message === 'Invalid JSON') return sendJson(res, 400, { error: '无效JSON' });
    audit('error', e.message, cid);
    sendJson(res, 500, { error: '服务器内部错误' });
  }
});

const PORT = process.env.PORT || 9000;
server.listen(PORT, () => {
  console.log(`[山海云枢] 启动 端口=${PORT} 区域=${CONFIG.dataRegion}`);
  console.log(`[山海云枢] 引擎: ${CONFIG.engines.filter(e=>e.apiKey).map(e=>e.label).join(', ') || '无'}`);
});

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });

// 云函数兼容导出
module.exports = server;
module.exports.fcHandler = (req, resp) => server.emit('request', req, resp);
module.exports.scfHandler = async (event) => {
  return new Promise(resolve => {
    const req = { method: event.httpMethod, url: event.path + (event.queryString||''), headers: event.headers||{}, on: (e,cb) => { if(e==='data'&&event.body) cb(event.body); if(e==='end') cb(); }, socket: { remoteAddress: event.requestContext?.sourceIp||'0.0.0.0' } };
    const res = { _h:{}, _c:200, _b:'', writeHead(c,h){this._c=c;Object.assign(this._h,h||{});}, setHeader(k,v){this._h[k]=v;}, end(b){resolve({isBase64Encoded:false,statusCode:this._c,headers:this._h,body:b||''});} };
    server.emit('request', req, res);
  });
};
