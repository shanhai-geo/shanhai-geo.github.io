/**
 * 山海GEO生态 - Node.js API网关（国内合规版）
 * 
 * 合规声明：
 * 1. 本服务仅提供SEO优化指导，不保证特定搜索排名结果
 * 2. 用户需确保内容合法合规，承担发布内容全部责任
 * 3. 服务有效期以订单确认时间为准，到期自动终止
 * 4. 密钥仅限本人使用，禁止转让、出借或用于非法用途
 * 5. 退款需在付款后7日内申请，需提供充分理由
 * 6. 山海GEO保留对本服务的最终解释权
 */

const http = require('http');
const url = require('url');

const db = { orders: new Map(), keys: new Map() };
const CONFIG = { port: process.env.PORT || 3000, keyPrefix: 'shk_', keyLength: 32, nodePrefix: 'GEO-', defaultExpire: 365 * 24 * 60 * 60 * 1000 };

function generateKey() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let key = CONFIG.keyPrefix;
    for (let i = 0; i < CONFIG.keyLength; i++) key += chars.charAt(Math.floor(Math.random() * chars.length));
    return key;
}

function generateNodeId() {
    const num = (n) => String(Math.floor(Math.random() * n)).padStart(4, '0');
    return CONFIG.nodePrefix + num(10000) + '-' + num(10000);
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(new Error('JSON解析失败')); } });
        req.on('error', reject);
    });
}

function jsonResponse(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end(JSON.stringify(data));
}

const routes = {
    '/api/activate': async (req, res, body) => {
        const { plan, price, orderNo, email } = body;
        if (!plan || !price || !orderNo) return jsonResponse(res, 400, { success: false, message: '缺少必要参数' });
        const key = generateKey();
        const nodeId = generateNodeId();
        const expire = Date.now() + CONFIG.defaultExpire;
        const order = { key, nodeId, plan, price: parseInt(price), orderNo, email: email || '', expire, createdAt: Date.now(), status: 'activated' };
        db.orders.set(orderNo, order);
        db.keys.set(key, order);
        console.log(`[${new Date().toISOString()}] 密钥激活: ${orderNo}`);
        return jsonResponse(res, 200, { success: true, key, nodeId, expire, message: '激活成功' });
    },
    '/api/verify': async (req, res, body) => {
        const { key } = body;
        if (!key) return jsonResponse(res, 400, { success: false, message: '缺少密钥' });
        const order = db.keys.get(key);
        if (!order) return jsonResponse(res, 404, { success: false, message: '密钥不存在' });
        if (order.expire < Date.now()) return jsonResponse(res, 403, { success: false, message: '密钥已过期' });
        return jsonResponse(res, 200, { success: true, valid: true, plan: order.plan, expire: order.expire, nodeId: order.nodeId });
    },
    '/api/renew': async (req, res, body) => {
        const { key } = body;
        if (!key) return jsonResponse(res, 400, { success: false, message: '缺少密钥' });
        const order = db.keys.get(key);
        if (!order) return jsonResponse(res, 404, { success: false, message: '密钥不存在' });
        const newExpire = Math.max(order.expire, Date.now()) + CONFIG.defaultExpire;
        order.expire = newExpire;
        order.renewedAt = Date.now();
        return jsonResponse(res, 200, { success: true, expire: newExpire, message: '续费成功' });
    },
    '/api/health': async (req, res) => jsonResponse(res, 200, { success: true, status: 'ok', timestamp: Date.now(), orders: db.orders.size }),
    '/api/notify': async (req, res, body) => { console.log(`[${new Date().toISOString()}] 通知:`, body); return jsonResponse(res, 200, { success: true, message: '通知已发送' }); }
};

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    if (req.method === 'OPTIONS') { res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }); return res.end(); }
    const handler = routes[pathname];
    if (!handler) return jsonResponse(res, 404, { success: false, message: '接口不存在' });
    try { const body = await parseBody(req); await handler(req, res, body); } catch (error) { console.error('处理错误:', error); jsonResponse(res, 500, { success: false, message: '服务器错误' }); }
});

server.listen(CONFIG.port, () => {
    console.log(`山海GEO API网关已启动，端口: ${CONFIG.port}`);
    console.log('可用接口: POST /api/activate, /api/verify, /api/renew, /api/notify, GET /api/health');
});

module.exports = server;
