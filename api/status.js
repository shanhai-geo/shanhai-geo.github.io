/**
 * 山海云枢 API网关 - 系统状态
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const engines = [
    { name: '智谱GLM', key: 'ZHIPU_API_KEY', priority: '主路' },
    { name: '硅基流动', key: 'SILICONFLOW_API_KEY', priority: '备路1' },
    { name: '火山引擎', key: 'VOLCENGINE_API_KEY', priority: '备路2' }
  ].map(e => ({
    ...e,
    status: process.env[e.key] ? 'online' : 'offline'
  }));

  const onlineCount = engines.filter(e => e.status === 'online').length;
  
  return res.status(200).json({
    gateway: '山海云枢 / YUNSHU',
    version: '1.0.0',
    status: onlineCount > 0 ? 'online' : 'offline',
    engines: engines,
    engineStatus: `${onlineCount}/3 在线`,
    kv: (process.env.KV_REST_API_URL) ? 'connected' : 'not_configured',
    timestamp: new Date().toISOString(),
    uptime: process.uptime ? process.uptime() : 0
  });
}
