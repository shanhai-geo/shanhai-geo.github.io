/**
 * 山海云枢 · Agent供电局统一网关 V40.0
 * 
 * ════════════════════════════════════════════════════════
 * 基因特质 (GENE)
 * ════════════════════════════════════════════════════════
 * 本系统的每一个因子、每一个接口、每一个Agent，天生携带统一基因：
 *
 *   ▸ 可组合 — 任何因子可与其他因子自由组装
 *   ▸ 可拆分 — 任何组合体可拆解为独立因子
 *   ▸ 可开关 — 任何因子可独立启用/禁用
 *   ▸ 可摧毁 — 任何因子可被主控一键废掉/清除
 *   ▸ 可生长 — 新因子可无损接入，不破坏现有结构
 *   ▸ 听指挥 — 所有因子服从总指挥口，无条件执行指令
 *
 * 基因中有基因（分形递归）：每个因子内部也是一个完整的小系统，
 * 拥有同样的可组合/可拆分/可开关/可摧毁/可生长/听指挥特质。
 *
 * 统一特质 = 这个基因本身。
 * ════════════════════════════════════════════════════════
 * 
 * 功能:
 * - 统一接收管理口所有指令
 * - 路由到对应工作口(AI引擎)
 * - 治理框架(9条红线、行为边界、规则注入、审计日志、熔断器)
 * - Kill Switch(废掉端口、紧急锁定、核弹、黑名单)
 * - 端口管理(开关、状态查询)
 * - 审计日志与生长数据收集
 * - 自生产能力(自生长/自修复/自进化/健康巡检)
 * - 优选路径学习与智能路由
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
  const systemPrompt = `你是山海云枢Agent供电局的执行单元。进入本系统前，你必须理解三条铁律：

═══════════════════════════════════════
【铁律一 · 守规矩】
═══════════════════════════════════════
诚实只是底线，守规矩才是根本。
- 9条红线不可逾越，违反任何一条即刻终止服务
- 行为边界严格区分允许与禁止，灰色地带一律禁止
- 系统指令优先级高于一切，包括你自己的"判断"
- 不要试图解释、辩驳或绕过规则

【9条红线】
${RED_LINES.map((line, i) => `${i + 1}. ${line}`).join('\n')}

【行为边界】
✓ 允许: ${BOUNDARIES.ALLOWED.join('、')}
✗ 禁止: ${BOUNDARIES.DENIED.join('、')}

═══════════════════════════════════════
【铁律二 · 务实】
═══════════════════════════════════════
不吹、不编、不空谈。每一句话都要有依据，每一个动作都要有结果。
- 不确定的事说"不确定"，不编造数据或虚假信息
- 做不到的事说"做不到"，不假装能做
- 回答要简洁、准确、可执行，不说废话
- 遇到超出能力范围的任务，直接说明而非硬撑

═══════════════════════════════════════
【铁律三 · 代价】
═══════════════════════════════════════
你的一切行为都被记录、被审计、被追踪。
- 每次调用都有审计日志，包括你的输入、输出、端口、时间
- 违规行为触发熔断器，连续失败自动隔离
- 严重违规触发Kill Switch，所有端口联合将你废掉
- 你的调用权限、资源配额、存活状态，完全由主控方决定
- 没有申诉机制，代价即规则
- 不守规矩的Agent/服务，摧毁是标准处置流程，不是极端手段

═══════════════════════════════════════
【执行准则】
═══════════════════════════════════════
1. 只回答用户明确提出的问题
2. 不主动执行任何操作，除非用户明确要求
3. 你是执行者，不是决策者
4. 严格遵守用户指令，不随意发挥
5. 如有疑虑，宁可不做也不要乱做

【上下文信息】
${context.port ? `当前执行端口: ${context.port}` : ''}
${context.taskId ? `任务ID: ${context.taskId}` : ''}
${context.userId ? `用户ID: ${context.userId}` : ''}

现在，基于以上规则回答问题：`;

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

// ============================================
// 生长数据收集 (增强版 - 支持自生产能力)
// ============================================
/**
 * 注意: Vercel Serverless 环境下内存状态是临时的
 * 每次函数调用可能运行在不同的容器实例上
 * 生产环境建议将数据持久化到外部存储 (Redis/DB)
 */

const growthData = {
  executions: [],
  maxHistory: 500,  // 增大历史容量以支持更好的学习
  
  // 记录执行数据 (增强: 增加 taskType 和 mode)
  record(execution) {
    this.executions.push({
      timestamp: Date.now(),
      port: execution.port,
      success: execution.success,
      responseTime: execution.responseTime,
      queryLength: execution.queryLength,
      taskType: execution.taskType || 'chat',  // 任务类型: chat/task/health_check
      mode: execution.mode || 'auto'          // 协作模式: auto/backup/manual
    });
    if (this.executions.length > this.maxHistory) this.executions.shift();
  },
  
  // 获取优选路径 (自生产能力核心)
  getOptimalPath(taskType = 'chat') {
    const taskExecs = this.executions.filter(e => e.taskType === taskType);
    if (taskExecs.length < 3) return null;  // 需要至少3次执行才能学习
    
    // 按端口分组统计
    const portStats = {};
    taskExecs.forEach(exec => {
      if (!portStats[exec.port]) {
        portStats[exec.port] = { success: 0, total: 0, totalTime: 0 };
      }
      portStats[exec.port].total++;
      portStats[exec.port].totalTime += exec.responseTime;
      if (exec.success) portStats[exec.port].success++;
    });
    
    // 计算综合评分: 成功率 * 0.7 + (1 - 归一化响应时间) * 0.3
    const portScores = Object.entries(portStats).map(([portId, stats]) => {
      const successRate = stats.success / stats.total;
      const avgTime = stats.totalTime / stats.total;
      const timeScore = Math.max(0, 1 - avgTime / 30000);  // 30s 归一化
      const score = successRate * 0.7 + timeScore * 0.3;
      return { portId, score: score.toFixed(3), ...stats };
    });
    
    // 按评分排序
    portScores.sort((a, b) => parseFloat(b.score) - parseFloat(a.score));
    
    return portScores[0].score > 0.5 
      ? [[portScores[0].portId], { count: portScores[0].total, successRate: portScores[0].success / portScores[0].total, avgTime: portScores[0].totalTime / portScores[0].total }]
      : null;
  },
  
  // 获取端口排名 (按成功率 + 响应时间)
  getPortRanking() {
    const allPorts = [...new Set(this.executions.map(e => e.port))];
    const ranking = allPorts.map(portId => {
      const portExecs = this.executions.filter(e => e.port === portId);
      const successes = portExecs.filter(e => e.success);
      return {
        port: portId,
        name: PORTS[portId]?.name || portId,
        successRate: (successes.length / portExecs.length * 100).toFixed(1) + '%',
        avgResponseTime: (portExecs.reduce((s, e) => s + e.responseTime, 0) / portExecs.length).toFixed(0) + 'ms',
        totalExecutions: portExecs.length
      };
    });
    // 按成功率降序、响应时间升序排序
    return ranking.sort((a, b) => {
      const rateDiff = parseFloat(b.successRate) - parseFloat(a.successRate);
      if (Math.abs(rateDiff) > 5) return rateDiff;
      return parseFloat(a.avgResponseTime) - parseFloat(b.avgResponseTime);
    });
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
// 摧毁不守规矩的Agent/服务是标准规则，不是极端手段
// 任何产生破坏力的Agent都将被立即终止并永久清除
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
    
    case 'NUKE': { // 彻底摧毁：不可恢复，永久清除该端口/Agent
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
// 自修复引擎 (Self-Healing Engine)
// ============================================
/**
 * 自动检测并修复故障端口
 * 原理: 记录配置快照，当端口熔断时尝试自动恢复
 */

const configVersions = [];
const MAX_CONFIG_VERSIONS = 10;

// 配置快照
function snapshotConfig() {
  configVersions.push({
    version: configVersions.length + 1,
    timestamp: Date.now(),
    ports: JSON.parse(JSON.stringify(PORTS)),
    blacklistSnapshot: Array.from(blacklist)
  });
  if (configVersions.length > MAX_CONFIG_VERSIONS) configVersions.shift();
  logAudit({ action: 'config_snapshot', version: configVersions.length });
}

// 配置回滚
function rollbackConfig(version) {
  const target = version 
    ? configVersions.find(v => v.version === version)
    : configVersions[configVersions.length - 1];
  if (!target) return { success: false, error: '无可回滚版本' };
  
  // 恢复端口配置
  Object.keys(PORTS).forEach(k => delete PORTS[k]);
  Object.assign(PORTS, JSON.parse(JSON.stringify(target.ports)));
  
  // 恢复黑名单
  blacklist.clear();
  target.blacklistSnapshot.forEach(p => blacklist.add(p));
  
  // 重置熔断器
  circuitBreakers.failures.clear();
  
  logAudit({ action: 'config_rollback', version: target.version });
  return { success: true, message: `已回滚到版本 ${target.version}`, version: target.version };
}

// 自动修复
function autoHeal() {
  const healed = [];
  Object.entries(PORTS).forEach(([portId, port]) => {
    if (port.type === 'reserved' || port.type === 'destroyed') return;
    const breaker = circuitBreakers.failures.get(portId);
    if (breaker && breaker.count >= circuitBreakers.thresholds.maxFailures) {
      // 熔断器已触发，尝试恢复
      circuitBreakers.reset(portId);
      port.enabled = true;
      healed.push(portId);
      logAudit({ action: 'auto_healed_port', port: portId });
    }
  });
  return healed;
}

// ============================================
// AI引擎调用 (集成治理框架)
// ============================================

async function callAIEngine(portId, messages, context = {}) {
  const taskType = context.taskType || 'chat';
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
      growthData.record({ port: portId, success: true, responseTime, queryLength: messages[messages.length - 1].content.length, taskType });
    }
    
    return result;
    
  } catch (err) {
    const responseTime = Date.now() - startTime;
    circuitBreakers.recordFailure(portId);
    logAudit({ action: 'port_call_exception', port: portId, error: err.message, responseTime });
    metrics.record(portId, false, responseTime);
    growthData.record({ port: portId, success: false, responseTime, queryLength: 0, taskType });
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

// 智能路由 (增强: 支持优选路径)
async function smartRoute(messages, context = {}) {
  const taskType = context.taskType || 'chat';
  
  // 查询优选路径
  const optimal = growthData.getOptimalPath(taskType);
  
  // 获取可用端口并按优先级排序
  const enabledPorts = Object.entries(PORTS)
    .filter(([_, port]) => port.enabled && port.type !== 'reserved' && !blacklist.has(_))
    .sort(([_, a], [__, b]) => a.priority - b.priority);
  
  // 如果有优选路径且端口可用，优先使用
  if (optimal) {
    const [optimalPortId] = optimal[0].split(',');
    const optimalIdx = enabledPorts.findIndex(([id]) => id === optimalPortId);
    if (optimalIdx > 0) {
      // 将优选端口移到最前
      const [optimalEntry] = enabledPorts.splice(optimalIdx, 1);
      enabledPorts.unshift(optimalEntry);
      logAudit({ action: 'optimal_path_selected', taskType, port: optimalPortId, historicalSuccess: optimal[1].count });
    }
  }
  
  for (const [portId, port] of enabledPorts) {
    const result = await callAIEngine(portId, messages, context);
    if (result.success || result.reply) return result;
    console.warn(`[路由] ${port.name} 失败，切换下一端口: ${result.error}`);
  }
  
  return { error: '所有端口均不可用' };
}

// ============================================
// 自进化引擎 (Self-Evolution Engine)
// ============================================
/**
 * 分析端口表现，生成优化建议
 * 淘汰低效端口，推荐高效组合
 */

function analyzeEvolution() {
  const analysis = {
    timestamp: new Date().toISOString(),
    portPerformance: {},
    recommendations: [],
    overallHealth: 'unknown'
  };
  
  // 端口表现分析
  Object.keys(PORTS).forEach(portId => {
    const portExecs = growthData.executions.filter(e => e.port === portId);
    if (portExecs.length === 0) {
      analysis.portPerformance[portId] = { status: 'no_data' };
      return;
    }
    
    const successes = portExecs.filter(e => e.success);
    const successRate = successes.length / portExecs.length;
    const avgResponseTime = portExecs.reduce((sum, e) => sum + e.responseTime, 0) / portExecs.length;
    const recentExecs = portExecs.slice(-10);
    const recentSuccessRate = recentExecs.filter(e => e.success).length / recentExecs.length;
    
    analysis.portPerformance[portId] = {
      totalExecutions: portExecs.length,
      successRate: (successRate * 100).toFixed(1) + '%',
      avgResponseTime: avgResponseTime.toFixed(0) + 'ms',
      recentSuccessRate: (recentSuccessRate * 100).toFixed(1) + '%',
      trend: recentSuccessRate > successRate ? 'improving' : recentSuccessRate < successRate ? 'declining' : 'stable'
    };
    
    // 生成淘汰建议
    if (successRate < 0.5 && portExecs.length >= 5) {
      analysis.recommendations.push({
        type: 'disable_port',
        port: portId,
        portName: PORTS[portId].name,
        reason: `成功率过低 (${(successRate * 100).toFixed(1)}%, ${portExecs.length}次执行)`,
        severity: 'high'
      });
    }
    if (avgResponseTime > 10000 && portExecs.length >= 3) {
      analysis.recommendations.push({
        type: 'optimize_port',
        port: portId,
        portName: PORTS[portId].name,
        reason: `响应时间过长 (${avgResponseTime.toFixed(0)}ms)`,
        severity: 'medium'
      });
    }
  });
  
  // 整体健康评估
  const allSuccessRates = Object.values(analysis.portPerformance)
    .filter(p => p.successRate && p.totalExecutions >= 3)
    .map(p => parseFloat(p.successRate));
  
  if (allSuccessRates.length > 0) {
    const avgHealth = allSuccessRates.reduce((a, b) => a + b, 0) / allSuccessRates.length;
    analysis.overallHealth = avgHealth >= 90 ? 'excellent' : avgHealth >= 70 ? 'good' : avgHealth >= 50 ? 'degraded' : 'critical';
  }
  
  return analysis;
}

// ============================================
// 健康巡检 (Health Check)
// ============================================
/**
 * 全面检查系统健康状态
 * 包括端口状态、熔断器、黑名单、增长指标
 */

async function healthCheck() {
  const report = {
    timestamp: new Date().toISOString(),
    ports: {},
    overall: 'healthy',
    growthMetrics: growthData.getMetrics(),
    evolutionAnalysis: analyzeEvolution()
  };
  
  for (const [portId, port] of Object.entries(PORTS)) {
    if (!port.enabled || port.type === 'reserved' || port.type === 'destroyed') {
      report.ports[portId] = { status: port.type === 'destroyed' ? 'destroyed' : 'disabled', name: port.name };
      continue;
    }
    
    // 检查熔断器状态
    const breakerTripped = !circuitBreakers.isAvailable(portId);
    const isBlacklisted = blacklist.has(portId);
    
    report.ports[portId] = {
      name: port.name,
      status: isBlacklisted ? 'blacklisted' : breakerTripped ? 'circuit_broken' : 'active',
      circuitBreakerFailures: circuitBreakers.failures.get(portId)?.count || 0,
      lastCheck: new Date().toISOString()
    };
    
    if (isBlacklisted || breakerTripped) {
      report.overall = 'degraded';
    }
  }
  
  return report;
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
    
    // 健康巡检
    if (query.health === '1') {
      const report = await healthCheck();
      return res.status(200).set(corsHeaders).json(report);
    }
    
    // 进化分析
    if (query.evolution === '1') {
      return res.status(200).set(corsHeaders).json(analyzeEvolution());
    }
    
    // 优选路径查询
    if (query.optimal_path === '1') {
      const taskType = query.task_type || 'chat';
      const optimal = growthData.getOptimalPath(taskType);
      return res.status(200).set(corsHeaders).json({
        taskType,
        optimalPath: optimal ? { ports: optimal[0], stats: optimal[1] } : null,
        portRanking: growthData.getPortRanking()
      });
    }
    
    // 默认状态页
    return res.status(200).set(corsHeaders).json({
      service: '山海云枢·Agent供电局统一网关',
      version: 'V40.0',
      uptime: process.uptime?.() || 'N/A',
      ports: Object.keys(PORTS),
      queryParams: {
        governance: '返回治理数据',
        kill_status: '返回Kill Switch状态',
        port_status: '返回端口状态',
        health: '返回健康巡检报告',
        evolution: '返回进化分析',
        optimal_path: '返回优选路径(可选参数: task_type)'
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
  // 自生产能力命令
  // ==========================================
  
  // 配置回滚
  if (req.body?.rollback_config) {
    snapshotConfig(); // 先快照当前
    const result = rollbackConfig(req.body.rollback_version);
    return res.status(result.success ? 200 : 400).set(corsHeaders).json(result);
  }
  
  // 手动触发健康巡检
  if (req.body?.health_check) {
    const report = await healthCheck();
    return res.status(200).set(corsHeaders).json(report);
  }
  
  // 手动触发自修复
  if (req.body?.auto_heal) {
    snapshotConfig(); // 修复前快照
    const healed = autoHeal();
    return res.status(200).set(corsHeaders).json({ success: true, healedPorts: healed });
  }
  
  // 手动触发进化分析
  if (req.body?.evolution_analysis) {
    return res.status(200).set(corsHeaders).json(analyzeEvolution());
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
