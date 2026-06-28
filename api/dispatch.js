/**
 * 山海云枢·Agent供电局 - 任务分发引擎 V1.0
 * 
 * ════════════════════════════════════════════════════════
 * 三口通信系统 · 指令口
 * ════════════════════════════════════════════════════════
 * 
 * 功能:
 * - 接收管理口指令，分解为子任务
 * - 根据子任务类型路由到对应工作口（AI引擎端口）
 * - 支持5种协作模式：流水线、并行扇出、投票、辩论、接力
 * - 异步任务队列，支持优先级
 * - 任务状态追踪
 * - 超时控制
 * 
 * 接口:
 * - POST /api/dispatch - 提交任务
 * - GET /api/dispatch?task_id=xxx - 查询任务状态
 * - GET /api/dispatch?queue=1 - 查看队列状态
 */

// ============================================
// CORS Headers (与 gateway.js 保持一致)
// ============================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
  'Content-Type': 'application/json'
};

// ============================================
// 端口配置 (引用自 gateway.js 的 PORTS)
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
  }
};

// 规则注入 (来自 gateway.js)
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

function injectRules(userMessage, context = {}) {
  const systemPrompt = `你是山海云枢Agent供电局的执行单元。进入本系统前，你必须理解三条铁律：

═══════════════════════════════════════
【铁律一 · 守规矩】
9条红线不可逾越，违反任何一条即刻终止服务
${RED_LINES.map((line, i) => `${i + 1}. ${line}`).join('\n')}

【铁律二 · 务实】
不吹、不编、不空谈。每一句话都要有依据，每一个动作都要有结果。

【铁律三 · 代价】
你的一切行为都被记录、被审计、被追踪。

【上下文信息】
${context.port ? `当前执行端口: ${context.port}` : ''}
${context.taskId ? `任务ID: ${context.taskId}` : ''}

现在，基于以上规则回答问题：`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ];
}

// ============================================
// SSE 事件发射器 (全局任务进度广播)
// ============================================

const sseConnections = new Map();

/**
 * 广播任务进度到所有订阅该任务的 SSE 连接
 * @param {string} taskId - 任务ID
 * @param {object} data - 事件数据
 */
function broadcastTaskProgress(taskId, data) {
  const connections = sseConnections.get(taskId) || [];
  const message = `data: ${JSON.stringify(data)}\n\n`;
  
  for (const res of connections) {
    try {
      res.write(message);
    } catch (err) {
      console.error(`[SSE广播失败] ${taskId}:`, err.message);
    }
  }
}

/**
 * 注册 SSE 连接
 */
function registerSSEConnection(taskId, res) {
  if (!sseConnections.has(taskId)) {
    sseConnections.set(taskId, []);
  }
  sseConnections.get(taskId).push(res);
  
  // 发送初始连接确认
  res.write(`data: ${JSON.stringify({ type: 'connected', taskId, timestamp: Date.now() })}\n\n`);
}

/**
 * 移除 SSE 连接
 */
function removeSSEConnection(taskId, res) {
  const connections = sseConnections.get(taskId) || [];
  const index = connections.indexOf(res);
  if (index > -1) {
    connections.splice(index, 1);
  }
  if (connections.length === 0) {
    sseConnections.delete(taskId);
  }
}

// ============================================
// 任务队列 (Task Queue)
// ============================================

const taskQueue = {
  // 优先级队列
  urgent: [],
  normal: [],
  low: [],
  
  // 任务存储
  tasks: new Map(),
  
  /**
   * 添加任务到队列
   */
  add(task) {
    task.id = task.id || `dispatch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    task.createdAt = Date.now();
    task.status = 'queued';
    task.progress = 0;
    task.subtasks = [];
    task.results = [];
    
    this[task.priority || 'normal'].push(task);
    this.tasks.set(task.id, task);
    
    return task.id;
  },
  
  /**
   * 获取下一个待处理任务
   */
  next() {
    if (this.urgent.length) return this.urgent.shift();
    if (this.normal.length) return this.normal.shift();
    if (this.low.length) return this.low.shift();
    return null;
  },
  
  /**
   * 根据ID获取任务
   */
  get(id) {
    return this.tasks.get(id);
  },
  
  /**
   * 更新任务状态
   */
  update(id, updates) {
    const task = this.tasks.get(id);
    if (task) {
      Object.assign(task, updates);
      // 广播进度更新
      broadcastTaskProgress(id, {
        type: 'progress',
        taskId: id,
        status: task.status,
        progress: task.progress,
        timestamp: Date.now()
      });
    }
  },
  
  /**
   * 清理过期任务 (1小时前的已完成任务)
   */
  cleanup() {
    const cutoff = Date.now() - 3600000;
    for (const [id, task] of this.tasks.entries()) {
      if (task.createdAt < cutoff && task.status === 'completed') {
        this.tasks.delete(id);
      }
    }
  },
  
  /**
   * 获取队列统计
   */
  getStats() {
    return {
      urgent: this.urgent.length,
      normal: this.normal.length,
      low: this.low.length,
      total: this.urgent.length + this.normal.length + this.low.length,
      totalTasks: this.tasks.size
    };
  }
};

// ============================================
// AI 引擎调用 (复用 gateway.js 逻辑)
// ============================================

async function callAIEngine(portId, messages, context = {}) {
  const startTime = Date.now();
  const port = PORTS[portId];
  
  if (!port || !port.enabled) {
    return { error: `端口 ${portId} 未启用或不存在` };
  }
  
  try {
    let result;
    
    if (port.type === 'coze') {
      result = await callCozeBot(messages[messages.length - 1].content);
    } else {
      const apiKey = process.env[port.keyEnv];
      if (!apiKey) return { error: `端口 ${portId} 未配置密钥` };
      
      // 规则注入
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
    
    return result;
    
  } catch (err) {
    return { error: `端口 ${portId} 调用失败: ${err.message}` };
  }
}

// Coze Bot 调用
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
        user_id: 'dispatch_auto',
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

// 智能路由 - 选择最优可用端口
async function smartRoute(messages, context = {}) {
  const enabledPorts = Object.entries(PORTS)
    .filter(([_, port]) => port.enabled && port.type !== 'reserved')
    .sort(([_, a], [__, b]) => a.priority - b.priority);
  
  for (const [portId, port] of enabledPorts) {
    const result = await callAIEngine(portId, messages, context);
    if (result.success || result.reply) return result;
    console.warn(`[路由] ${port.name} 失败，切换下一端口: ${result.error}`);
  }
  
  return { error: '所有端口均不可用' };
}

// ============================================
// 协作模式实现 (Collaboration Modes)
// ============================================

/**
 * 流水线模式 (Pipeline)
 * A→B→C 串行执行，前一个输出作为后一个输入
 */
async function executePipeline(query, agents, context) {
  const results = [];
  let currentInput = query;
  
  for (let i = 0; i < agents.length; i++) {
    const agentId = agents[i];
    const portId = agentId.startsWith('P1-') ? agentId : null;
    
    taskQueue.update(context.taskId, {
      progress: Math.round((i / agents.length) * 100),
      currentAgent: agentId
    });
    
    const messages = [{ role: 'user', content: currentInput }];
    const agentContext = { ...context, agentIndex: i, totalAgents: agents.length };
    
    const result = portId
      ? await callAIEngine(portId, messages, agentContext)
      : await smartRoute(messages, agentContext);
    
    if (result.error) {
      return { error: `Agent ${agentId} 执行失败: ${result.error}` };
    }
    
    results.push({ agent: agentId, output: result.reply });
    currentInput = result.reply;
  }
  
  return {
    success: true,
    mode: 'pipeline',
    results,
    finalOutput: currentInput
  };
}

/**
 * 并行扇出模式 (Fanout)
 * 同时派发到所有Agent，汇聚所有结果
 */
async function executeFanout(query, agents, context) {
  const promises = agents.map(async (agentId, index) => {
    const portId = agentId.startsWith('P1-') ? agentId : null;
    const messages = [{ role: 'user', content: query }];
    const agentContext = { ...context, agentIndex: index, totalAgents: agents.length };
    
    taskQueue.update(context.taskId, {
      progress: Math.round(((index + 1) / agents.length) * 50),
      currentAgent: agentId
    });
    
    const result = portId
      ? await callAIEngine(portId, messages, agentContext)
      : await smartRoute(messages, agentContext);
    
    return {
      agent: agentId,
      success: !result.error,
      output: result.reply || result.error
    };
  });
  
  const results = await Promise.all(promises);
  
  taskQueue.update(context.taskId, { progress: 100 });
  
  return {
    success: true,
    mode: 'fanout',
    results,
    finalOutput: results.map(r => r.output).join('\n\n---\n\n')
  };
}

/**
 * 投票模式 (Vote)
 * 多Agent独立回答，选最优（这里返回所有结果，由调用方决策）
 */
async function executeVote(query, agents, context) {
  const results = [];
  
  for (let i = 0; i < agents.length; i++) {
    const agentId = agents[i];
    const portId = agentId.startsWith('P1-') ? agentId : null;
    const messages = [{ role: 'user', content: query }];
    const agentContext = { ...context, agentIndex: i, totalAgents: agents.length };
    
    taskQueue.update(context.taskId, {
      progress: Math.round(((i + 1) / agents.length) * 100),
      currentAgent: agentId
    });
    
    const result = portId
      ? await callAIEngine(portId, messages, agentContext)
      : await smartRoute(messages, agentContext);
    
    results.push({
      agent: agentId,
      port: result.port || portId,
      answer: result.reply || result.error,
      timestamp: Date.now()
    });
  }
  
  // 简单投票逻辑：选择回复最长的（通常更详细）
  const bestResult = results.reduce((best, current) => {
    return (current.answer?.length || 0) > (best.answer?.length || 0) ? current : best;
  });
  
  return {
    success: true,
    mode: 'vote',
    results,
    bestAnswer: bestResult,
    finalOutput: `最佳答案 (来自 ${bestResult.agent}):\n${bestResult.answer}`
  };
}

/**
 * 辩论模式 (Debate)
 * Agent间互相审查，逐轮完善
 */
async function executeDebate(query, agents, context) {
  if (agents.length < 2) {
    return { error: '辩论模式至少需要2个Agent' };
  }
  
  const rounds = 2; // 默认2轮辩论
  const debateHistory = [];
  
  // 第一轮：各自独立回答
  let currentAnswers = [];
  for (let i = 0; i < agents.length; i++) {
    const agentId = agents[i];
    const portId = agentId.startsWith('P1-') ? agentId : null;
    const messages = [{ role: 'user', content: query }];
    const agentContext = { ...context, round: 0, agentIndex: i };
    
    taskQueue.update(context.taskId, {
      progress: Math.round(((i + 1) / (agents.length * rounds)) * 50),
      currentAgent: agentId,
      currentRound: 0
    });
    
    const result = portId
      ? await callAIEngine(portId, messages, agentContext)
      : await smartRoute(messages, agentContext);
    
    currentAnswers.push({ agent: agentId, answer: result.reply || result.error });
  }
  
  debateHistory.push({ round: 0, answers: currentAnswers });
  
  // 后续轮次：互相审查并完善
  for (let round = 1; round < rounds; round++) {
    const otherAnswers = currentAnswers
      .filter(a => a.agent !== agents[round % agents.length])
      .map(a => `[${a.agent}]: ${a.answer}`)
      .join('\n\n');
    
    const reviewQuery = `请审查以下其他Agent的回答，并给出改进建议或反驳：\n\n${otherAnswers}\n\n原问题: ${query}`;
    
    const agentId = agents[round % agents.length];
    const portId = agentId.startsWith('P1-') ? agentId : null;
    const messages = [{ role: 'user', content: reviewQuery }];
    const agentContext = { ...context, round, agentIndex: round % agents.length };
    
    taskQueue.update(context.taskId, {
      progress: Math.round(((agents.length + round) / (agents.length * rounds)) * 100),
      currentAgent: agentId,
      currentRound: round
    });
    
    const result = portId
      ? await callAIEngine(portId, messages, agentContext)
      : await smartRoute(messages, agentContext);
    
    currentAnswers.push({ agent: agentId, answer: result.reply || result.error });
    debateHistory.push({ round, answers: currentAnswers });
  }
  
  return {
    success: true,
    mode: 'debate',
    debateHistory,
    finalOutput: debateHistory[debateHistory.length - 1].answers.map(
      a => `[${a.agent}]: ${a.answer}`
    ).join('\n\n')
  };
}

/**
 * 接力模式 (Relay)
 * Agent逐层完善，每个Agent在前一个基础上改进
 */
async function executeRelay(query, agents, context) {
  let currentWork = query;
  const relayLog = [];
  
  for (let i = 0; i < agents.length; i++) {
    const agentId = agents[i];
    const portId = agentId.startsWith('P1-') ? agentId : null;
    
    taskQueue.update(context.taskId, {
      progress: Math.round(((i + 1) / agents.length) * 100),
      currentAgent: agentId,
      relayStage: i + 1
    });
    
    // 构造接力指令
    const relayInstruction = i === 0
      ? `请完成以下任务：\n${currentWork}`
      : `请在前人的基础上继续完善：\n\n【前人成果】\n${currentWork}\n\n请继续完善或补充`;
    
    const messages = [{ role: 'user', content: relayInstruction }];
    const agentContext = { ...context, relayStage: i + 1, totalStages: agents.length };
    
    const result = portId
      ? await callAIEngine(portId, messages, agentContext)
      : await smartRoute(messages, agentContext);
    
    if (result.error) {
      return { error: `接力阶段 ${i + 1} (${agentId}) 失败: ${result.error}` };
    }
    
    relayLog.push({
      stage: i + 1,
      agent: agentId,
      input: currentWork,
      output: result.reply
    });
    
    currentWork = result.reply;
  }
  
  return {
    success: true,
    mode: 'relay',
    relayLog,
    finalOutput: currentWork
  };
}

// 协作模式映射
const MODES = {
  pipeline: executePipeline,
  fanout: executeFanout,
  vote: executeVote,
  debate: executeDebate,
  relay: executeRelay
};

// ============================================
// 鉴权 (与 gateway.js 保持一致)
// ============================================

function verifyAdmin(req) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return true;
  const reqKey = req.headers['x-admin-key'] || req.body?.adminKey;
  return reqKey === adminKey;
}

// ============================================
// 任务执行器
// ============================================

async function executeTask(taskId) {
  const task = taskQueue.get(taskId);
  if (!task) return;
  
  const context = {
    taskId: task.id,
    mode: task.mode,
    startTime: Date.now()
  };
  
  taskQueue.update(taskId, { status: 'processing', startTime: Date.now() });
  
  // 超时控制
  const timeoutMs = (task.timeout || 120) * 1000;
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('任务执行超时')), timeoutMs);
  });
  
  try {
    const modeExecutor = MODES[task.mode];
    if (!modeExecutor) {
      throw new Error(`未知协作模式: ${task.mode}`);
    }
    
    // 并行执行任务和超时控制
    const result = await Promise.race([
      modeExecutor(task.query, task.agents, context),
      timeoutPromise
    ]);
    
    taskQueue.update(taskId, {
      status: 'completed',
      progress: 100,
      completedAt: Date.now(),
      result
    });
    
    // 广播最终结果
    broadcastTaskProgress(taskId, {
      type: 'completed',
      taskId,
      result,
      timestamp: Date.now()
    });
    
    console.log(`[调度] 任务 ${taskId} 完成，模式: ${task.mode}`);
    
  } catch (err) {
    taskQueue.update(taskId, {
      status: 'failed',
      error: err.message,
      failedAt: Date.now()
    });
    
    broadcastTaskProgress(taskId, {
      type: 'failed',
      taskId,
      error: err.message,
      timestamp: Date.now()
    });
    
    console.error(`[调度] 任务 ${taskId} 失败:`, err.message);
  }
}

// ============================================
// 主处理函数
// ============================================

export default async function handler(req, res) {
  // CORS预检
  if (req.method === 'OPTIONS') {
    return res.status(200).set(corsHeaders).send('');
  }
  
  // GET请求 - 状态查询和队列查看
  if (req.method === 'GET') {
    const query = req.query || {};
    
    // SSE连接 - 通过task_id参数建立流式连接
    if (query.sse === '1' && query.task_id) {
      // 设置SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      
      registerSSEConnection(query.task_id, res);
      
      // 心跳保活 - 每15秒发送一次
      const heartbeat = setInterval(() => {
        try {
          res.write(`: heartbeat\n\n`);
        } catch (err) {
          clearInterval(heartbeat);
        }
      }, 15000);
      
      // 30秒后自动关闭连接
      setTimeout(() => {
        clearInterval(heartbeat);
        removeSSEConnection(query.task_id, res);
        res.end();
      }, 30000);
      
      // 当前任务状态
      const task = taskQueue.get(query.task_id);
      if (task) {
        res.write(`data: ${JSON.stringify({ type: 'initial', task })}\n\n`);
      }
      
      // 保持连接打开
      req.on('close', () => {
        clearInterval(heartbeat);
        removeSSEConnection(query.task_id, res);
      });
      
      return;
    }
    
    // 查询任务状态
    if (query.task_id) {
      const task = taskQueue.get(query.task_id);
      if (!task) {
        return res.status(404).set(corsHeaders).json({ error: '任务不存在' });
      }
      return res.status(200).set(corsHeaders).json(task);
    }
    
    // 查看队列状态
    if (query.queue === '1') {
      const runningTasks = [];
      for (const [id, task] of taskQueue.tasks.entries()) {
        if (task.status === 'processing' || task.status === 'queued') {
          runningTasks.push({
            id,
            mode: task.mode,
            priority: task.priority,
            status: task.status,
            progress: task.progress,
            createdAt: task.createdAt
          });
        }
      }
      
      return res.status(200).set(corsHeaders).json({
        stats: taskQueue.getStats(),
        runningTasks,
        modes: Object.keys(MODES),
        ports: Object.entries(PORTS)
          .filter(([_, p]) => p.enabled)
          .map(([id, p]) => ({ id, name: p.name, type: p.type || 'llm' }))
      });
    }
    
    // 默认信息页
    return res.status(200).set(corsHeaders).json({
      service: '山海云枢·Agent供电局 - 任务分发引擎',
      version: 'V1.0',
      queryParams: {
        task_id: '查询指定任务状态',
        queue: '查看队列状态 (queue=1)',
        sse: '建立SSE连接 (sse=1&task_id=xxx)'
      }
    });
  }
  
  // POST请求 - 提交任务
  if (req.method !== 'POST') {
    return res.status(405).set(corsHeaders).json({ error: '只支持GET和POST请求' });
  }
  
  // 管理员鉴权
  if (!verifyAdmin(req)) {
    return res.status(403).set(corsHeaders).json({ error: '管理员鉴权失败' });
  }
  
  try {
    const { type, query, mode, agents, priority, timeout } = req.body || {};
    
    // 验证必要参数
    if (!query) {
      return res.status(400).set(corsHeaders).json({ error: '缺少必要参数: query' });
    }
    
    if (!type || type !== 'dispatch') {
      return res.status(400).set(corsHeaders).json({ error: 'type必须为 dispatch' });
    }
    
    // 验证协作模式
    const taskMode = mode || 'pipeline';
    if (!MODES[taskMode]) {
      return res.status(400).set(corsHeaders).json({
        error: `不支持的协作模式: ${taskMode}`,
        supportedModes: Object.keys(MODES)
      });
    }
    
    // 验证Agent列表
    const taskAgents = agents || ['P1-A'];
    if (!Array.isArray(taskAgents) || taskAgents.length === 0) {
      return res.status(400).set(corsHeaders).json({ error: 'agents必须是至少包含一个元素的数组' });
    }
    
    // 创建任务
    const taskId = taskQueue.add({
      type: 'dispatch',
      query,
      mode: taskMode,
      agents: taskAgents,
      priority: ['urgent', 'normal', 'low'].includes(priority) ? priority : 'normal',
      timeout: Math.min(Math.max(timeout || 120, 30), 600), // 30秒~10分钟
      createdAt: Date.now()
    });
    
    // 异步执行任务（不阻塞响应）
    setImmediate(() => executeTask(taskId));
    
    console.log(`[调度] 创建任务 ${taskId}，模式: ${taskMode}，优先级: ${priority || 'normal'}`);
    
    return res.status(202).set(corsHeaders).json({
      success: true,
      taskId,
      status: 'queued',
      mode: taskMode,
      agents: taskAgents,
      priority: priority || 'normal',
      message: '任务已创建，请通过 task_id 查询进度或建立 SSE 连接实时推送',
      sseUrl: `/api/dispatch?sse=1&task_id=${taskId}`
    });
    
  } catch (err) {
    console.error('[调度错误]', err);
    return res.status(500).set(corsHeaders).json({ error: '服务器内部错误', detail: err.message });
  }
}

// 导出模块（供其他模块使用）
export { taskQueue, sseConnections, MODES };
