/**
 * 山海GEO生态 - 密钥激活API
 * 端点：POST /api/activate
 * 
 * 合规声明：
 * 1. 本服务仅提供SEO优化指导，不保证特定搜索排名结果
 * 2. 用户需确保内容合法合规，承担发布内容全部责任
 * 3. 服务有效期以订单确认时间为准，到期自动终止
 * 4. 密钥仅限本人使用，禁止转让、出借或用于非法用途
 * 5. 退款需在付款后7日内申请，需提供充分理由
 * 6. 山海GEO保留对本服务的最终解释权
 */

const KEY_PREFIX = 'shk_';
const KEY_LENGTH = 32;
const NODE_PREFIX = 'GEO-';

function generateKey() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let key = KEY_PREFIX;
    for (let i = 0; i < KEY_LENGTH; i++) {
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
}

function generateNodeId() {
    const num = (n) => String(Math.floor(Math.random() * n)).padStart(4, '0');
    return NODE_PREFIX + num(10000) + '-' + num(10000);
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: '仅支持POST请求' });

    try {
        const { plan, price, orderNo, email } = req.body;
        if (!plan || !price || !orderNo) {
            return res.status(400).json({ success: false, message: '缺少必要参数：plan, price, orderNo' });
        }

        const key = generateKey();
        const nodeId = generateNodeId();
        const expire = Date.now() + 365 * 24 * 60 * 60 * 1000;

        console.log('订单已激活:', orderNo, '密钥:', key);

        return res.status(200).json({
            success: true,
            key,
            nodeId,
            expire,
            message: '密钥激活成功'
        });

    } catch (error) {
        console.error('激活失败:', error);
        return res.status(500).json({ success: false, message: '服务器错误，请稍后重试' });
    }
}
