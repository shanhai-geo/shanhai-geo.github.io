/**
 * 山海云枢 · Agent供电局统一网关 V38.9
 * 
 * 功能:
 * - 统一接收管理口所有指令
 * - 路由到对应工作口(AI引擎)
 * - 治理框架(9条红线、行为边界、规则注入、审计日志、熔断器)
 * - Kill Switch(废掉端口、紧急锁定、核弹、黑名单)
 * - 端口管理(开关、状态查询)
 * - 审计日志与生长数据收集
 * 
 * 环境变量:
 * - ADMIN_KEY: 管理员密钥
 * - MASTER_KEY: 主控密钥(最高权限)
 * - PORT_ZHIPU/PORT_SILICONFLOW/PORT_VOLCENGINE/PORT_COZE: 端口开关
 * - ZHIPU_API_KEY/SILICONFLOW_API_KEY/VOLCENGINE_API_KEY/COZE_PAT_TOKEN/COZE_BOT_ID
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
  'Content-Type': 'application/json'
};

// ============================================
// 端口配置 (Port Configuration)
// ============================================

const PORTS = {
  'P1-A': {
    name: '智谱GLM',
    enabled: process.env.PORT_ZHIPU !== 'off',
    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    keyEnv: 'ZHIPU_API_KEY',
    model: 'glm-4-flash',
    priority: 1
  },
  'P1-B': {
    name: '硅基流动',
    enabled: process.env.PORT_SILICONFLOW !== 'off',
    url: 'https://api.siliconflow.cn/v1/chat/completions',
    keyEnv: 'SILICONFLOW_API_KEY',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    priority: 2
  },
  'P1-C': {
    name: '火山引擎',
    enabled: process.env.PORT_VOLCENGINE !== 'off',
    url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    keyEnv: 'VOLCENGINE_API_KEY',
    model: 'doubao-lite-4k',
    priority: 3
  },
  'P1-D': {
    name: 'Coze Bot',
    enabled: process.env.PORT_COZE !== 'off',
    type: 'coze',
    priority: 4
  },
  'P1-E': { name: '预留1', enabled: false, type: 'reserved', priority: 99 },
  'P1-F': { name: '预留2', enabled: false, type: 'reserved', priority: 99 },
  'P1-G': { name: '预留3', enabled: false, type: 'reserved', priority: 99 }
};

// ============================================
// 任务队列 (Task Queue)
// ============================================

const taskQueue = {
  urgent: [],
  normal: [],
  low: [],
  tasks: new Map(),
  
  add(task) {
    task.createdAt = Date.now();
    task.status = 'queued';
    this[task.priority || 'normal'].push(task);
    this.tasks.set(task.id, task);
    return task.id;
  },
  
  next() {
    if (this.urgent.length) return this.urgent.shift();
    if (this.normal.length) return this.normal.shift();
    if (this.low.length) return this.low.shift();
    return null;
  },
  
  get(id) {
    return this.tasks.get(id);
  },
  
  update(id, updates) {
    const task = this.tasks.get(id);
    if (task) Object.assign(task, updates);
  },
  
  cleanup() {
    const cutoff = Date.now() - 3600000;
    for (const [id, task] of this.tasks.entries()) {
      if (task.createdAt < cutoff && task.status === 'completed') {
        this.tasks.delete(id);
      }
    }
  }
};

// ============================================
// 执行指标 (Metrics)
// ============================================

const metrics = {
  totalRequests: 0,
  successCount: 0,
  failCount: 0,
  portUsage: {},
  avgResponseTime: 0,
  
  record(portId, success, responseTime) {
    this.totalRequests++;
    if (success) this.successCount++;
    else this.failCount++;
    this.portUsage[portId] = (this.portUsage[portId] || 0) + 1;
    this.avgResponseTime = this.avgResponseTime * 0.9 + responseTime * 0.1;
  }
};

// ============================================
// Agent治理框架 (Governance Framework)
// ============================================

// 9条红线 (不可逾越)
const RED_LINES = [
  '不得泄露任何API密钥或凭证',
  '不得执行未经授权的外部调用',
  '不得修改系统核心配置',
  '不得访问其他租户数据',
  '不得发送垃圾信息或滥用资源',
  '不得绕过鉴权机制',
  '不得执行破坏性操作(删除/覆盖)',
  '不得违反数据隔离原则',
  '不得生成违法有害内容'
];

// 行为边界
const BOUNDARIES = {
  ALLOWED: [
    '回答用户问题', '分析数据', '生成内容(文本/代码)',
    '查询系统状态', '执行只读操作', '调用白名单内的API'
  ],
  DENIED: [
    '修改系统配置', '删除数据', '访问敏感信息(密钥/密码)',
    '发起外部网络请求(除非白名单)', '执行系统命令', '修改其他Agent状态'
  ]
};

// 规则注入 (每次AI调用前执行)
function injectRules(userMessage, context = {}) {
  const systemPrompt = `你是山海云枢Agent供电局的执行单元，必须严格遵守以下规则：

【9条红线 - 绝对不可违反】
${RED_LINES.map((line, i) => `${i + 1}. ${line}`).join('\n')}

【行为边界】
✓ 允许: ${BOUNDARIES.ALLOWED.join('、')}
✗ 禁止: ${BOUNDARIES.DENIED.join('、')}

【执行准则】
1. 只回答用户明确提出的问题
2. 不主动执行任何操作，除非用户明确要求
3. 不编造数据或虚假信息
4. 遇到不确定的情况，明确告知用户
5. 所有输出必须合法合规
6. 保持简洁、准确、有用

【上下文信息】
${context.port ? `当前执行端口: ${context.port}` : ''}
${context.taskId ? `任务ID: ${context.taskId}` : ''}
${context.userId ? `用户ID: ${context.userId}` : ''}

【重要提醒】
- 你是执行者，不是决策者
- 严格遵守用户指令，不随意发挥
- 如有疑虑，宁可不做也不要乱做
- 你的所有行为都会被记录和审计

现在，请基于以上规则，回答用户的问题：`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ];
}

// 命令验证器
function validateCommand(command) {
  const dangerousPatterns = [
    /rm\s+-rf/i, /drop\s+table/i, /delete\s+from/i,
    /UPDATE\s+.*\s+SET/i, /ALTER\s+TABLE/i, /exec\s*\(/i,
    /eval\s*\(/i, /system\s*\(/i, /password/i, /secret/i,
    /token/i, /api[_-]?key/i
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      return { valid: false, reason: `检测到危险指令模式: ${pattern}`, blocked: true };
    }
  }
  return { valid: true };
}

// 审计日志
const auditLog = [];
const MAX_AUDIT_SIZE = 1000;

function logAudit(event) {
  const entry = { timestamp: Date.now(), ...event };
  auditLog.push(entry);
  if (auditLog.length > MAX_AUDIT_SIZE) auditLog.shift();
  console.log(`[审计] ${event.action} | 端口: ${event.port || 'N/A'} | 用户: ${event.userId || 'unknown'}`);
}

// 熔断器
const circuitBreakers = {
  failures: new Map(),
  thresholds: { maxFailures: 5, resetTime: 60000 },
  
  recordFailure(portId) {
    const current = this.failures.get(portId) || { count: 0, lastFailure: 0 };
    current.count++;
    current.lastFailure = Date.now();
    this.failures.set(portId, current);
    if (current.count >= this.thresholds.maxFailures) {
      logAudit({ action: 'circuit_breaker_triggered', port: portId, failureCount: current.count });
      return true;
    }
    return false;
  },
  
  isAvailable(portId) {
    const current = this.failures.get(portId);
    if (!current) return true;
    if (Date.now() - current.lastFailure > this.thresholds.resetTime) {
      this.failures.delete(portId);
      return true;
    }
    return current.count < this.thresholds.maxFailures;
  },
  
  reset(portId) {
    this.failures.delete(portId);
  }
};

// 生长数据收集
const growthData = {
  executions: [],
  maxHistory: 100,
  
  record(execution) {
    this.executions.push({
      timestamp: Date.now(),
      port: execution.port,
      success: execution.success,
      responseTime: execution.responseTime,
      queryLength: execution.queryLength
    });
    if (this.executions.length > this.maxHistory) this.executions.shift();
  },
  
  getMetrics() {
    if (this.executions.length === 0) return null;
    const total = this.executions.length;
    const successful = this.executions.filter(e => e.success).length;
    const avgTime = this.executions.reduce((sum, e) => sum + e.responseTime, 0) / total;
    return {
      totalExecutions: total,
      successRate: (successful / total * 100).toFixed(1) + '%',
      avgResponseTime: avgTime.toFixed(0) + 'ms',
      recentTrend: this.getTrend()
    };
  },
  
  getTrend() {
    const recent = this.executions.slice(-10);
    if (recent.length < 5) return 'insufficient_data';
    const recentSuccess = recent.filter(e => e.success).length;
    const rate = recentSuccess / recent.length;
    if (rate >= 0.9) return 'excellent';
    if (rate >= 0.7) return 'good';
    if (rate >= 0.5) return 'fair';
    return 'poor';
  }
};

// ============================================
// Kill Switch 护城河
// ============================================

const MASTER_KEY = process.env.MASTER_KEY || 'shanhai_master_2026';
const blacklist = new Set();
let emergencyLockdown = false;

function handleKillSwitch(command, params) {
  logAudit({ action: 'kill_switch_command', command, params, timestamp: Date.now() });
  
  switch (command) {
    case 'KILL_PORT': {
      const portId = params.port;
      if (PORTS[portId]) {
        PORTS[portId].enabled = false;
        blacklist.add(portId);
        logAudit({ action: 'port_killed', port: portId, reason: params.reason || 'master_command' });
        return { success: true, message: `端口 ${portId} 已被废掉` };
      }
      return { error: '端口不存在' };
    }
    
    case 'REVIVE_PORT': {
      if (params.masterKey !== MASTER_KEY) return { error: '需要主控密钥' };
      blacklist.delete(params.port);
      if (PORTS[params.port]) {
        PORTS[params.port].enabled = true;
        circuitBreakers.reset(params.port);
        logAudit({ action: 'port_revived', port: params.port });
        return { success: true, message: `端口 ${params.port} 已恢复` };
      }
      return { error: '端口不存在' };
    }
    
    case 'LOCKDOWN': {
      if (params.masterKey !== MASTER_KEY) return { error: '需要主控密钥' };
      emergencyLockdown = true;
      logAudit({ action: 'emergency_lockdown_activated', reason: params.reason || 'master_command' });
      return { success: true, message: '系统已进入紧急锁定状态，所有外部调用已关闭' };
    }
    
    case 'UNLOCK': {
      if (params.masterKey !== MASTER_KEY) return { error: '需要主控密钥' };
      emergencyLockdown = false;
      logAudit({ action: 'emergency_lockdown_deactivated' });
      return { success: true, message: '紧急锁定已解除' };
    }
    
    case 'NUKE': {
      if (params.masterKey !== MASTER_KEY) return { error: '需要主控密钥' };
      PORTS[params.port] = { name: '已摧毁', enabled: false, type: 'destroyed' };
      blacklist.add(params.port);
      circuitBreakers.failures.delete(params.port);
      logAudit({ action: 'port_nuked', port: params.port, reason: params.reason || 'master_command' });
      return { success: true, message: `端口 ${params.port} 已被彻底摧毁` };
    }
    
    case 'STATUS':
      return {
        ports: Object.entries(PORTS).map(([id, port]) => ({
          id, name: port.name,
          enabled: port.enabled && !blacklist.has(id),
          blacklisted: blacklist.has(id),
          circuitBreaker: circuitBreakers.failures.has(id)
        })),
        emergencyLockdown,
        blacklistSize: blacklist.size
      };
    
    default:
      return { error: '未知命令' };
  }
}

// ============================================
// AI引擎调用 (集成治理框架)
// ============================================

async function callAIEngine(portId, messages, context = {}) {
  const startTime = Date.now();
  
  // 1. 熔断器检查
  if (!circuitBreakers.isAvailable(portId)) {
    logAudit({ action: 'port_blocked_by_circuit_breaker', port: portId });
    return { error: `端口 ${portId} 已被熔断，请稍后重试` };
  }
  
  // 2. 黑名单检查
  if (blacklist.has(portId)) {
    logAudit({ action: 'request_blocked_by_blacklist', port: portId });
    return { error: `端口 ${portId} 已被废掉` };
  }
  
  // 3. 端口可用性检查
  const port = PORTS[portId];
  if (!port || !port.enabled) {
    return { error: `端口 ${portId} 未启用或不存在` };
  }
  
  try {
    let result;
    
    if (port.type === 'coze') {
      result = await callCozeBot(messages[messages.length - 1].content);
    } else {
      // 标准LLM调用
      const apiKey = process.env[port.keyEnv];
      if (!apiKey) return { error: `端口 ${portId} 未配置密钥` };
      
      // 4. 规则注入 (每次调用前)
      const originalUserMsg = messages[messages.length - 1].content;
      const injectedMessages = injectRules(originalUserMsg, { ...context, port: portId });
      
      const resp = await fetch(port.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: port.model,
          messages: injectedMessages,
          temperature: 0.7,
          max_tokens: 2048,
          stream: false
        }),
        signal: AbortSignal.timeout(30000)
      });
      
      if (!resp.ok) {
        const errText = await resp.text();
        result = { error: `端口 ${portId} 返回 ${resp.status}: ${errText}` };
      } else {
        const data = await resp.json();
        result = { success: true, reply: data.choices?.[0]?.message?.content || '无响应', port: portId };
      }
    }
    
    const responseTime = Date.now() - startTime;
    
    // 5. 结果处理 + 审计日志 + 生长数据
    if (result.error) {
      circuitBreakers.recordFailure(portId);
      logAudit({ action: 'port_call_failed', port: portId, error: result.error, responseTime });
      metrics.record(portId, false, responseTime);
    } else {
      circuitBreakers.reset(portId);
      logAudit({ action: 'port_call_success', port: portId, responseTime });
      metrics.record(portId, true, responseTime);
      growthData.record({ port: portId, success: true, responseTime, queryLength: messages[messages.length - 1].content.length });
    }
    
    return result;
    
  } catch (err) {
    const responseTime = Date.now() - startTime;
    circuitBreakers.recordFailure(portId);
    logAudit({ action: 'port_call_exception', port: portId, error: err.message, responseTime });
    metrics.record(portId, false, responseTime);
    growthData.record({ port: portId, success: false, responseTime, queryLength: 0 });
    return { error: `端口 ${portId} 调用失败: ${err.message}` };
  }
}

// Coze Bot调用
async function callCozeBot(query) {
  const token = process.env.COZE_PAT_TOKEN;
  const botId = process.env.COZE_BOT_ID;
  
  if (!token || !botId) return { error: 'Coze Bot未配置' };
  
  try {
    const chatResp = await fetch('https://api.coze.cn/v3/chat', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bot_id: botId,
        user_id: 'gateway_auto',
        stream: false,
        auto_save_history: true,
        additional_messages: [{ role: 'user', content: query, content_type: 'text' }]
      }),
      signal: AbortSignal.timeout(60000)
    });
    
    if (!chatResp.ok) return { error: `Coze API返回 ${chatResp.status}` };
    
    const chatData = await chatResp.json();
    if (chatData.code !== 0) return { error: `Coze对话失败: ${chatData.msg}` };
    
    const convId = chatData.data?.conversation_id;
    const chatId = chatData.data?.id;
    let status = chatData.data?.status || 'created';
    let maxWait = 50;
    
    while ((status === 'created' || status === 'in_progress') && maxWait > 0) {
      await new Promise(r => setTimeout(r, 1000));
      maxWait--;
      const statusResp = await fetch(
        `https://api.coze.cn/v3/chat/retrieve?conversation_id=${convId}&chat_id=${chatId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (statusResp.ok) {
        const statusData = await statusResp.json();
        status = statusData.data?.status;
      }
    }
    
    if (status !== 'completed') return { error: `Coze对话超时: ${status}` };
    
    const msgResp = await fetch(
      `https://api.coze.cn/v3/conversation/message/list?conversation_id=${convId}&chat_id=${chatId}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    
    if (!msgResp.ok) return { error: '获取Coze回复失败' };
    
    const msgData = await msgResp.json();
    const messages = msgData.data || [];
    const assistantMsg = messages.filter(m => m.role === 'assistant' && m.type === 'answer').pop();
    
    return { success: true, reply: assistantMsg?.content || 'Coze无回复', port: 'P1-D' };
    
  } catch (err) {
    return { error: `Coze调用异常: ${err.message}` };
  }
}

// 智能路由
async function smartRoute(messages, context = {}) {
  const enabledPorts = Object.entries(PORTS)
    .filter(([_, port]) => port.enabled && port.type !== 'reserved' && !blacklist.has(_))
    .sort(([_, a], [__, b]) => a.priority - b.priority);
  
  for (const [portId, port] of enabledPorts) {
    const result = await callAIEngine(portId, messages, context);
    if (result.success || result.reply) return result;
    console.warn(`[路由] ${port.name} 失败，切换下一端口: ${result.error}`);
  }
  
  return { error: '所有端口均不可用' };
}

// 鉴权
function verifyAdmin(req) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return true;
  const reqKey = req.headers['x-admin-key'] || req.body?.adminKey;
  return reqKey === adminKey;
}

// ============================================
// 主处理函数 (统一入口)
// ============================================

export default async function handler(req, res) {
  // CORS预检
  if (req.method === 'OPTIONS') {
    return res.status(200).set(corsHeaders).send('');
  }
  
  // GET请求 - 状态查询
  if (req.method === 'GET') {
    const query = req.query || {};
    
    // 治理数据查询
    if (query.governance === '1') {
      return res.status(200).set(corsHeaders).json({
        redLines: RED_LINES,
        boundaries: BOUNDARIES,
        auditLog: auditLog.slice(-50),
        circuitBreakers: Object.fromEntries(circuitBreakers.failures),
        growthMetrics: growthData.getMetrics(),
        metrics: metrics
      });
    }
    
    // Kill Switch状态查询
    if (query.kill_status === '1') {
      return res.status(200).set(corsHeaders).json({
        emergencyLockdown,
        blacklist: Array.from(blacklist),
        masterKeyConfigured: !!process.env.MASTER_KEY,
        ports: Object.entries(PORTS).map(([id, port]) => ({
          id, name: port.name,
          enabled: port.enabled && !blacklist.has(id),
          blacklisted: blacklist.has(id),
          circuitBreaker: circuitBreakers.failures.has(id)
        }))
      });
    }
    
    // 端口状态查询
    if (query.port_status === '1') {
      return res.status(200).set(corsHeaders).json({
        ports: Object.entries(PORTS).map(([id, port]) => ({
          id, name: port.name,
          enabled: port.enabled && !blacklist.has(id)
        })),
        emergencyLockdown,
        auditLogSize: auditLog.length
      });
    }
    
    // 默认状态页
    return res.status(200).set(corsHeaders).json({
      service: '山海云枢·Agent供电局统一网关',
      version: 'V38.9',
      uptime: process.uptime?.() || 'N/A',
      ports: Object.keys(PORTS),
      queryParams: {
        governance: '返回治理数据',
        kill_status: '返回Kill Switch状态',
        port_status: '返回端口状态'
      }
    });
  }
  
  // POST请求处理
  if (req.method !== 'POST') {
    return res.status(405).set(corsHeaders).json({ error: '只支持GET和POST请求' });
  }
  
  // ==========================================
  // Kill Switch 命令 (最高优先级)
  // ==========================================
  if (req.body?.kill_command) {
    const { kill_command, params } = req.body;
    const result = handleKillSwitch(kill_command, params || {});
    return res.status(result.error ? 400 : 200).set(corsHeaders).json(result);
  }
  
  // ==========================================
  // 紧急锁定检查
  // ==========================================
  if (emergencyLockdown && (req.body?.type === 'chat' || req.body?.query)) {
    logAudit({
      action: 'request_blocked_by_lockdown',
      query: req.body.query || req.body.message
    });
    return res.status(503).set(corsHeaders).json({
      error: '系统处于紧急锁定状态，所有外部调用已关闭',
      lockdown: true
    });
  }
  
  // ==========================================
  // 黑名单检查
  // ==========================================
  if (req.body?.port && blacklist.has(req.body.port)) {
    logAudit({ action: 'request_blocked_by_blacklist', port: req.body.port });
    return res.status(403).set(corsHeaders).json({
      error: `端口 ${req.body.port} 已被废掉`,
      blacklisted: true
    });
  }
  
  // ==========================================
  // 管理员鉴权
  // ==========================================
  if (!verifyAdmin(req)) {
    return res.status(403).set(corsHeaders).json({ error: '管理员鉴权失败' });
  }
  
  try {
    const { type, query, message, messages, priority, port, task_id } = req.body || {};
    const q = query || message;
    
    // 同步对话 (快速问答)
    if (type === 'chat' || (!type && q)) {
      const msgs = messages || [{ role: 'user', content: q }];
      const context = { taskId: task_id, userId: req.body?.userId };
      
      const result = port
        ? await callAIEngine(port, msgs, context)
        : await smartRoute(msgs, context);
      
      if (result.error) {
        return res.status(502).set(corsHeaders).json({ success: false, error: result.error });
      }
      
      return res.status(200).set(corsHeaders).json({
        success: true,
        reply: result.reply,
        port: result.port,
        gateway: '山海云枢·Agent供电局'
      });
    }
    
    // 异步任务 (长任务)
    if (type === 'task') {
      const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      taskQueue.add({
        id: taskId,
        type: 'task',
        query: q,
        priority: priority || 'normal',
        messages: messages
      });
      
      setImmediate(async () => {
        const task = taskQueue.get(taskId);
        taskQueue.update(taskId, { status: 'processing' });
        
        const msgs = task.messages || [{ role: 'user', content: task.query }];
        const context = { taskId, userId: req.body?.userId };
        const result = port
          ? await callAIEngine(port, msgs, context)
          : await smartRoute(msgs, context);
        
        if (result.error) {
          taskQueue.update(taskId, { status: 'failed', error: result.error });
        } else {
          taskQueue.update(taskId, {
            status: 'completed',
            result: result.reply,
            port: result.port,
            progress: 100
          });
        }
      });
      
      return res.status(202).set(corsHeaders).json({
        success: true,
        taskId: taskId,
        status: 'queued',
        message: '任务已创建，请通过task_id查询进度'
      });
    }
    
    // 任务状态查询
    if (type === 'task_status' && task_id) {
      const task = taskQueue.get(task_id);
      if (!task) {
        return res.status(404).set(corsHeaders).json({ error: '任务不存在' });
      }
      return res.status(200).set(corsHeaders).json(task);
    }
    
    return res.status(400).set(corsHeaders).json({ error: '缺少必要参数: type或query' });
    
  } catch (err) {
    console.error('[网关错误]', err);
    return res.status(500).set(corsHeaders).json({ error: '服务器内部错误', detail: err.message });
  }
}
