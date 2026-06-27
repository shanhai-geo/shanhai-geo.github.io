/**
 * 山海云枢 API网关 - LLM对话代理
 * Vercel Serverless Function
 * 
 * 功能：
 * - 前端无需暴露API密钥
 * - 多引擎自动路由（主路→备路1→备路2）
 * - 请求频率限制
 * - 密钥验证（298产品Key）
 */

// 引擎配置（密钥从Vercel环境变量读取）
const ENGINES = [
  {
    name: '智谱GLM',
    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    keyEnv: 'ZHIPU_API_KEY',
    model: 'glm-4-flash',
    priority: 1
  },
  {
    name: '硅基流动',
    url: 'https://api.siliconflow.cn/v1/chat/completions',
    keyEnv: 'SILICONFLOW_API_KEY',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    priority: 2
  },
  {
    name: '火山引擎',
    url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    keyEnv: 'VOLCENGINE_API_KEY',
    model: 'doubao-lite-4k',
    priority: 3
  }
];

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Node-ID, X-Key',
  'Content-Type': 'application/json'
};

// 简单的内存级限流（每个Serverless实例独立，重启后重置）
const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1分钟
const RATE_LIMIT_MAX = 30; // 每分钟30次

function checkRateLimit(clientId) {
  const now = Date.now();
  let record = rateLimits.get(clientId);
  if (!record || now - record.start > RATE_LIMIT_WINDOW) {
    record = { start: now, count: 0 };
    rateLimits.set(clientId, record);
  }
  record.count++;
  return record.count <= RATE_LIMIT_MAX;
}

// 验证298产品Key（从环境变量读取已激活的keys）
function validateKey(key) {
  if (!key) return false;
  const activatedKeys = process.env.ACTIVATED_KEYS || '';
  const keyList = activatedKeys.split(',').filter(k => k.trim());
  return keyList.includes(key.trim());
}

// 尝试调用引擎
async function tryEngine(engine, messages, modelOverride) {
  const apiKey = process.env[engine.keyEnv];
  if (!apiKey) return { error: `${engine.name} 未配置密钥`, engine: engine.name };

  try {
    const response = await fetch(engine.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelOverride || engine.model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 2048,
        stream: false
      }),
      signal: AbortSignal.timeout(30000) // 30秒超时
    });

    if (!response.ok) {
      const errText = await response.text();
      return { error: `${engine.name} 返回 ${response.status}: ${errText}`, engine: engine.name };
    }

    const data = await response.json();
    return { data, engine: engine.name };
  } catch (err) {
    return { error: `${engine.name} 调用失败: ${err.message}`, engine: engine.name };
  }
}

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Node-ID, X-Key')
      .end('');
  }

  // 健康检查
  if (req.method === 'GET') {
    const engines = ENGINES.map(e => ({
      name: e.name,
      model: e.model,
      configured: !!process.env[e.keyEnv],
      priority: e.priority
    }));
    return res.status(200).json({
      status: 'online',
      service: '山海云枢 API网关',
      version: '1.0.0',
      engines: engines,
      timestamp: new Date().toISOString()
    });
  }

  // 只接受POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '仅支持POST请求' });
  }

  try {
    const { messages, model, stream, nodeId, key } = req.body || {};

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: '缺少messages参数' });
    }

    // 限流检查
    const clientId = nodeId || key || req.headers['x-forwarded-for'] || 'unknown';
    if (!checkRateLimit(clientId)) {
      return res.status(429).json({ error: '请求过于频繁，请稍后重试' });
    }

    // Key验证（如果设置了ACTIVATED_KEYS则强制验证）
    const requireKey = process.env.REQUIRE_KEY === 'true';
    if (requireKey && !validateKey(key)) {
      return res.status(403).json({ error: '无效的激活密钥，请先开通GEO服务' });
    }

    // 按优先级尝试引擎
    const sorted = [...ENGINES].sort((a, b) => a.priority - b.priority);
    let lastError = '';

    for (const engine of sorted) {
      const result = await tryEngine(engine, messages, model);
      if (result.data) {
        // 成功，返回数据
        return res.status(200).json({
          ...result.data,
          _meta: {
            engine: result.engine,
            gateway: '山海云枢',
            timestamp: new Date().toISOString()
          }
        });
      }
      lastError = result.error;
      console.warn(`[路由] ${engine.name} 失败，切换下一引擎: ${result.error}`);
    }

    // 所有引擎都失败
    return res.status(503).json({
      error: '所有引擎暂时不可用',
      detail: lastError,
      gateway: '山海云枢'
    });

  } catch (err) {
    console.error('[API网关错误]', err);
    return res.status(500).json({ error: '服务器内部错误', detail: err.message });
  }
}
