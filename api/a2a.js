/**
 * 山海云枢 · A2A Server V1.0
 * 
 * Agent-to-Agent 协议端点 (基于 A2A v0.3.0)
 * 
 * 接口:
 * - POST /api/a2a — 发送消息/创建任务
 * - GET /api/a2a?task_id=xxx — 查询任务状态
 * - GET /api/a2a — 服务信息
 */

const TASK_STATES = {
  SUBMITTED: 'submitted', WORKING: 'working', INPUT_REQUIRED: 'input-required',
  COMPLETED: 'completed', FAILED: 'failed', CANCELED: 'canceled'
};

const a2aTasks = new Map();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

function getGatewayUrl() {
  return process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
}

async function handleMessage(message) {
  const taskId = `a2a_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const task = {
    id: taskId, contextId: message.contextId || taskId,
    status: { state: TASK_STATES.SUBMITTED }, messages: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };

  if (message.parts) {
    task.messages.push({ role: 'user', parts: message.parts, metadata: message.metadata || {} });
  }
  a2aTasks.set(taskId, task);

  // 异步处理：调用 gateway
  setImmediate(async () => {
    try {
      task.status.state = TASK_STATES.WORKING;
      task.updatedAt = new Date().toISOString();

      const userMsg = task.messages.find(m => m.role === 'user');
      const textPart = userMsg?.parts?.find(p => p.type === 'text');
      if (!textPart) {
        task.status.state = TASK_STATES.FAILED;
        task.status.message = { role: 'agent', parts: [{ type: 'text', text: '无有效文本输入' }] };
        return;
      }

      const resp = await fetch(`${getGatewayUrl()}/api/gateway`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'chat', query: textPart.text })
      });
      const result = await resp.json();

      task.status.state = result.success ? TASK_STATES.COMPLETED : TASK_STATES.FAILED;
      task.status.message = {
        role: 'agent',
        parts: [{ type: 'text', text: result.success ? result.reply : `执行失败: ${result.error}` }]
      };
      task.updatedAt = new Date().toISOString();
    } catch (err) {
      task.status.state = TASK_STATES.FAILED;
      task.status.message = { role: 'agent', parts: [{ type: 'text', text: `内部错误: ${err.message}` }] };
      task.updatedAt = new Date().toISOString();
    }
  });

  return task;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).set(corsHeaders).send('');

  if (req.method === 'GET') {
    const q = req.query || {};
    if (q.task_id) {
      const task = a2aTasks.get(q.task_id);
      return task ? res.status(200).set(corsHeaders).json(task) : res.status(404).set(corsHeaders).json({ error: '任务不存在' });
    }
    return res.status(200).set(corsHeaders).json({
      service: '山海云枢·A2A Server', version: '1.0.0', protocol: 'A2A v0.3.0',
      endpoints: { agentCard: '/.well-known/agent.json', sendMessage: 'POST /api/a2a', getTask: 'GET /api/a2a?task_id=xxx' },
      skills: ['ai-chat', 'task-dispatch', 'health-inspection', 'evolution-analysis', 'governance']
    });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    if (body.message) return res.status(201).set(corsHeaders).json(await handleMessage(body.message));
    if (body.parts) return res.status(201).set(corsHeaders).json(await handleMessage({ parts: body.parts, contextId: body.contextId, metadata: body.metadata }));
    return res.status(400).set(corsHeaders).json({ error: '缺少 message 或 parts 字段' });
  }

  return res.status(405).set(corsHeaders).json({ error: '不支持的方法' });
}
