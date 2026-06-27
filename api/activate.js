/**
 * 山海云枢 API网关 - 298产品Key激活
 * Vercel Serverless Function
 * 
 * 功能：
 * - POST: 激活密钥（提交付款凭证后获得）
 * - GET: 验证密钥状态
 * - PUT: 生成新密钥（管理员）
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

// 生成唯一节点ID
function generateNodeId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'GEO-';
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
  id += '-';
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// 生成API访问密钥
function generateApiKey(nodeId) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'shk_';
  for (let i = 0; i < 32; i++) key += chars[Math.floor(Math.random() * chars.length)];
  return key;
}

// 获取已激活的keys（从Vercel KV或环境变量）
async function getActivatedKeys() {
  // 优先使用Vercel KV（如果配置了）
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const { kv } = await import('@vercel/kv');
      const keys = await kv.get('activated_keys');
      return keys || [];
    } catch (e) {
      console.warn('KV读取失败，回退到环境变量:', e.message);
    }
  }
  // 回退到环境变量
  const envKeys = process.env.ACTIVATED_KEYS || '';
  return envKeys.split(',').filter(k => k.trim()).map(k => ({ key: k, activated: true }));
}

// 保存激活的keys
async function saveActivatedKeys(keys) {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const { kv } = await import('@vercel/kv');
      await kv.set('activated_keys', keys);
      return true;
    } catch (e) {
      console.warn('KV写入失败:', e.message);
    }
  }
  return false; // 环境变量无法运行时写入，需要手动在Vercel控制台添加
}

export default async function handler(req, res) {
  // CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      .end('');
  }

  // GET: 验证密钥状态
  if (req.method === 'GET') {
    const { key } = req.query;
    if (!key) return res.status(400).json({ error: '缺少key参数' });

    const keys = await getActivatedKeys();
    const found = keys.find(k => k.key === key || k === key);
    
    if (found) {
      return res.status(200).json({
        valid: true,
        nodeId: found.nodeId || 'unknown',
        plan: found.plan || 'standard',
        activatedAt: found.activatedAt || 'unknown',
        gateway: '山海云枢'
      });
    }
    return res.status(200).json({ valid: false, gateway: '山海云枢' });
  }

  // POST: 激活密钥
  if (req.method === 'POST') {
    const { name, phone, industry, company, plan, paymentProof } = req.body || {};

    if (!name || !phone || !plan) {
      return res.status(400).json({ error: '缺少必填参数: name, phone, plan' });
    }

    // 验证手机号
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ error: '手机号格式不正确' });
    }

    // 验证套餐
    const validPlans = ['298', '998', '4998'];
    if (!validPlans.includes(plan)) {
      return res.status(400).json({ error: '无效套餐，可选: 298/998/4998' });
    }

    // 生成密钥
    const nodeId = generateNodeId();
    const apiKey = generateApiKey(nodeId);

    // 构建激活记录
    const record = {
      key: apiKey,
      nodeId: nodeId,
      name: name,
      phone: phone,
      industry: industry || '未指定',
      company: company || '',
      plan: plan,
      activatedAt: new Date().toISOString(),
      status: 'active'
    };

    // 保存
    const keys = await getActivatedKeys();
    keys.push(record);
    const saved = await saveActivatedKeys(keys);

    // 返回激活信息
    const responseData = {
      success: true,
      nodeId: nodeId,
      apiKey: apiKey,
      plan: plan,
      name: name,
      activatedAt: record.activatedAt,
      config: {
        gateway: 'https://shanhai-geo.vercel.app/api/chat',
        nodeId: nodeId,
        key: apiKey
      },
      persisted: saved,
      message: saved 
        ? '激活成功，密钥已保存' 
        : '激活成功，请手动将以下密钥添加到Vercel环境变量 ACTIVATED_KEYS 中'
    };

    console.log(`[激活] 新节点: ${nodeId}, 套餐: ${plan}, 用户: ${name}`);
    return res.status(200).json(responseData);
  }

  // PUT: 管理员批量生成密钥
  if (req.method === 'PUT') {
    const { adminKey, count } = req.body || {};
    
    // 简单管理员验证
    if (adminKey !== process.env.ADMIN_KEY) {
      return res.status(403).json({ error: '管理员密钥无效' });
    }

    const num = Math.min(parseInt(count) || 5, 50);
    const generated = [];
    for (let i = 0; i < num; i++) {
      generated.push({
        nodeId: generateNodeId(),
        apiKey: generateApiKey('batch'),
        createdAt: new Date().toISOString(),
        status: 'pending'
      });
    }

    return res.status(200).json({
      success: true,
      count: generated.length,
      keys: generated,
      gateway: '山海云枢'
    });
  }

  return res.status(405).json({ error: '不支持的请求方法' });
}
