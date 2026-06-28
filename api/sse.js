/**
 * 山海云枢·Agent供电局 - SSE流式推送端点 V1.0
 * 
 * ════════════════════════════════════════════════════════
 * 三口通信系统 · 输出口
 * ════════════════════════════════════════════════════════
 * 
 * 功能:
 * - Server-Sent Events 推送长任务进度
 * - 客户端通过 EventSource 连接
 * - 任务完成后自动关闭连接
 * - 支持心跳保活（每15秒发心跳）
 * 
 * 接口:
 * - GET /api/sse?task_id=xxx - 建立SSE连接，实时推送任务进度
 */

// ============================================
// CORS Headers (与 gateway.js 保持一致)
// ============================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
  'Content-Type': 'text/event-stream'
};

// ============================================
// SSE 连接管理
// ============================================

// 全局SSE连接池 (与 dispatch.js 共享)
// 注意: Vercel Serverless 是无状态的，每次请求都会创建新的函数实例
// 因此这里使用内存存储，仅适用于单实例场景
// 生产环境建议使用 Redis 或其他分布式存储

const sseConnections = new Map();

// ============================================
// SSE 事件发送器
// ============================================

/**
 * 发送 SSE 事件
 * @param {object} res - 响应对象
 * @param {string} eventType - 事件类型
 * @param {object} data - 事件数据
 */
function sendSSEEvent(res, eventType, data) {
  try {
    const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    res.write(message);
    return true;
  } catch (err) {
    console.error('[SSE发送失败]', err.message);
    return false;
  }
}

/**
 * 发送注释（用于心跳保活）
 * @param {object} res - 响应对象
 */
function sendHeartbeat(res) {
  try {
    res.write(': heartbeat\n\n');
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * 注册 SSE 连接
 */
function registerConnection(taskId, clientId, res) {
  if (!sseConnections.has(taskId)) {
    sseConnections.set(taskId, new Map());
  }
  
  const clients = sseConnections.get(taskId);
  clients.set(clientId, {
    res,
    connectedAt: Date.now(),
    lastActivity: Date.now()
  });
  
  console.log(`[SSE] 客户端 ${clientId} 连接任务 ${taskId}，当前连接数: ${clients.size}`);
  
  return clients.size;
}

/**
 * 移除 SSE 连接
 */
function removeConnection(taskId, clientId) {
  const clients = sseConnections.get(taskId);
  if (clients) {
    clients.delete(clientId);
    console.log(`[SSE] 客户端 ${clientId} 断开任务 ${taskId}，剩余连接数: ${clients.size}`);
    
    if (clients.size === 0) {
      sseConnections.delete(taskId);
    }
  }
}

/**
 * 广播消息到指定任务的所有连接
 */
function broadcast(taskId, eventType, data) {
  const clients = sseConnections.get(taskId);
  if (!clients) return 0;
  
  let successCount = 0;
  for (const [clientId, client] of clients.entries()) {
    const sent = sendSSEEvent(client.res, eventType, {
      ...data,
      clientId,
      timestamp: Date.now()
    });
    
    if (sent) {
      client.lastActivity = Date.now();
      successCount++;
    } else {
      // 连接已断开，标记待删除
      clients.delete(clientId);
    }
  }
  
  return successCount;
}

// ============================================
// 模拟任务状态更新接口 (供外部调用)
// ============================================

/**
 * 更新任务进度（可通过内部API调用）
 * @param {string} taskId - 任务ID
 * @param {object} data - 更新数据
 */
export async function updateTaskProgress(taskId, data) {
  return broadcast(taskId, 'progress', data);
}

/**
 * 标记任务完成
 * @param {string} taskId - 任务ID
 * @param {object} result - 任务结果
 */
export async function completeTask(taskId, result) {
  const sent = broadcast(taskId, 'completed', { result });
  // 延迟5秒后关闭所有连接
  setTimeout(() => {
    const clients = sseConnections.get(taskId);
    if (clients) {
      for (const [clientId, client] of clients.entries()) {
        sendSSEEvent(client.res, 'close', { reason: 'task_completed' });
        client.res.end();
      }
      sseConnections.delete(taskId);
    }
  }, 5000);
  return sent;
}

/**
 * 标记任务失败
 * @param {string} taskId - 任务ID
 * @param {string} error - 错误信息
 */
export async function failTask(taskId, error) {
  const sent = broadcast(taskId, 'failed', { error });
  // 延迟3秒后关闭所有连接
  setTimeout(() => {
    const clients = sseConnections.get(taskId);
    if (clients) {
      for (const [clientId, client] of clients.entries()) {
        sendSSEEvent(client.res, 'close', { reason: 'task_failed' });
        client.res.end();
      }
      sseConnections.delete(taskId);
    }
  }, 3000);
  return sent;
}

// ============================================
// 主处理函数
// ============================================

export default async function handler(req, res) {
  // CORS预检
  if (req.method === 'OPTIONS') {
    return res.status(200)
      .set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      })
      .send('');
  }
  
  // 只支持 GET 请求
  if (req.method !== 'GET') {
    return res.status(405)
      .set(corsHeaders)
      .json({ error: '只支持GET请求' });
  }
  
  const { task_id, client_id } = req.query || {};
  
  // 验证参数
  if (!task_id) {
    return res.status(400)
      .set(corsHeaders)
      .json({ error: '缺少必要参数: task_id' });
  }
  
  // 生成客户端ID
  const clientId = client_id || `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // 设置 SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // 注册连接
  registerConnection(task_id, clientId, res);
  
  // 发送连接确认
  sendSSEEvent(res, 'connected', {
    clientId,
    taskId: task_id,
    message: 'SSE连接已建立，正在等待任务进度...',
    timestamp: Date.now()
  });
  
  // 发送当前任务状态（如果有）
  // 注意：由于是Serverless，任务状态存储在函数实例内存中
  // 这里发送一个提示，让客户端可以通过 /api/dispatch?task_id=xxx 获取完整状态
  sendSSEEvent(res, 'info', {
    message: '请使用 /api/dispatch?task_id=' + task_id + ' 查询任务初始状态',
    timestamp: Date.now()
  });
  
  // 心跳保活定时器 - 每15秒发送一次心跳
  const heartbeat = setInterval(() => {
    if (!sendHeartbeat(res)) {
      clearInterval(heartbeat);
      return;
    }
    
    // 更新连接活跃时间
    const clients = sseConnections.get(task_id);
    if (clients && clients.has(clientId)) {
      clients.get(clientId).lastActivity = Date.now();
    }
  }, 15000);
  
  // 连接超时自动关闭 - 默认5分钟
  const connectionTimeout = setTimeout(() => {
    clearInterval(heartbeat);
    sendSSEEvent(res, 'timeout', {
      message: '连接超时，自动关闭',
      timestamp: Date.now()
    });
    removeConnection(task_id, clientId);
    res.end();
  }, 300000); // 5分钟
  
  // 监听请求关闭事件
  req.on('close', () => {
    clearInterval(heartbeat);
    clearTimeout(connectionTimeout);
    removeConnection(task_id, clientId);
  });
  
  // 监听错误事件
  req.on('error', (err) => {
    console.error('[SSE请求错误]', err.message);
    clearInterval(heartbeat);
    clearTimeout(connectionTimeout);
    removeConnection(task_id, clientId);
  });
  
  // 保持连接打开（对于Serverless，这个函数会一直运行直到超时或连接关闭）
  // 使用空Promise保持函数活跃
  await new Promise(() => {});
}

// ============================================
// 工具函数
// ============================================

/**
 * 获取当前SSE连接统计
 */
export function getConnectionStats() {
  const stats = {
    totalTasks: sseConnections.size,
    totalConnections: 0,
    tasks: []
  };
  
  for (const [taskId, clients] of sseConnections.entries()) {
    stats.totalConnections += clients.size;
    stats.tasks.push({
      taskId,
      connections: clients.size,
      clients: Array.from(clients.entries()).map(([id, c]) => ({
        clientId: id,
        connectedAt: c.connectedAt,
        lastActivity: c.lastActivity
      }))
    });
  }
  
  return stats;
}
