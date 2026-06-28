/**
 * 山海云枢 · MCP Server V1.0
 * 
 * Model Context Protocol 端点
 * 基于 JSON-RPC 2.0 + Streamable HTTP（无状态模式）
 * 
 * 接口: POST /api/mcp
 * 
 * 最小方法集:
 * - initialize — 握手协商
 * - notifications/initialized — 初始化完成通知
 * - tools/list — 暴露可用工具列表
 * - tools/call — 执行工具调用
 */

// ============================================
// MCP 工具定义
// ============================================

const MCP_TOOLS = [
  {
    name: 'chat_completions',
    description: '调用山海云枢统一AI引擎进行对话。支持多模型自动路由。',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: '用户消息' },
        model: { type: 'string', description: '指定模型(可选): zhipu/siliconflow/volcengine/coze' },
        priority: { type: 'string', enum: ['urgent', 'normal', 'low'], default: 'normal' }
      },
      required: ['message']
    }
  },
  {
    name: 'health_check',
    description: '检查山海云枢系统健康状态，返回所有端口状态和整体评估。',
    inputSchema: {
      type: 'object',
      properties: { detailed: { type: 'boolean', default: false } }
    }
  },
  {
    name: 'port_status',
    description: '查询AI引擎端口状态。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'kill_switch_status',
    description: '查询Kill Switch状态。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'evolution_analysis',
    description: '触发自进化分析，返回各端口表现和优化建议。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'optimal_path',
    description: '查询指定任务类型的历史最优端口组合。',
    inputSchema: {
      type: 'object',
      properties: { task_type: { type: 'string', default: 'chat' } }
    }
  }
];

// ============================================
// JSON-RPC 处理
// ============================================

function getGatewayUrl() {
  return process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
}

function mapModelToPort(model) {
  return { zhipu: 'P1-A', siliconflow: 'P1-B', volcengine: 'P1-C', coze: 'P1-D' }[model];
}

async function handleJsonRpc(method, params) {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: '山海云枢·Agent供电局', version: '1.0.0' }
      };
    case 'notifications/initialized':
      return null;
    case 'tools/list':
      return { tools: MCP_TOOLS };
    case 'tools/call':
      return await handleToolCall(params.name, params.arguments || {});
    default:
      throw { code: -32601, message: `Method not found: ${method}` };
  }
}

async function handleToolCall(toolName, args) {
  const base = getGatewayUrl();
  try {
    switch (toolName) {
      case 'chat_completions': {
        const body = { type: 'chat', query: args.message, priority: args.priority || 'normal' };
        if (args.model) body.port = mapModelToPort(args.model);
        const r = await fetch(`${base}/api/gateway`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const d = await r.json();
        return { content: [{ type: 'text', text: d.success ? d.reply : `错误: ${d.error}` }], isError: !d.success };
      }
      case 'health_check': {
        const r = await fetch(`${base}/api/gateway?health=1`); const d = await r.json();
        return { content: [{ type: 'text', text: JSON.stringify(d, null, 2) }] };
      }
      case 'port_status': {
        const r = await fetch(`${base}/api/gateway?port_status=1`); const d = await r.json();
        return { content: [{ type: 'text', text: JSON.stringify(d, null, 2) }] };
      }
      case 'kill_switch_status': {
        const r = await fetch(`${base}/api/gateway?kill_status=1`); const d = await r.json();
        return { content: [{ type: 'text', text: JSON.stringify(d, null, 2) }] };
      }
      case 'evolution_analysis': {
        const r = await fetch(`${base}/api/gateway?evolution=1`); const d = await r.json();
        return { content: [{ type: 'text', text: JSON.stringify(d, null, 2) }] };
      }
      case 'optimal_path': {
        const r = await fetch(`${base}/api/gateway?optimal_path=1&task_type=${args.task_type || 'chat'}`); const d = await r.json();
        return { content: [{ type: 'text', text: JSON.stringify(d, null, 2) }] };
      }
      default:
        return { content: [{ type: 'text', text: `未知工具: ${toolName}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: 'text', text: `调用失败: ${err.message}` }], isError: true };
  }
}

// ============================================
// CORS + Handler
// ============================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).set(corsHeaders).send('');
  if (req.method !== 'POST') return res.status(405).set(corsHeaders).json({ jsonrpc: '2.0', error: { code: -32600, message: 'Only POST' }, id: null });

  try {
    const body = req.body;
    if (Array.isArray(body)) {
      const results = await Promise.all(body.map(async (r) => {
        try { const res = await handleJsonRpc(r.method, r.params || {}); return res === null ? null : { jsonrpc: '2.0', result: res, id: r.id }; }
        catch (e) { return { jsonrpc: '2.0', error: e, id: r.id }; }
      }));
      return res.status(200).set(corsHeaders).json(results.filter(Boolean));
    }
    const result = await handleJsonRpc(body.method, body.params || {});
    if (result === null) return res.status(204).set(corsHeaders).send('');
    return res.status(200).set(corsHeaders).json({ jsonrpc: '2.0', result, id: body.id });
  } catch (err) {
    return res.status(200).set(corsHeaders).json({ jsonrpc: '2.0', error: { code: -32603, message: err.message }, id: req.body?.id || null });
  }
}
