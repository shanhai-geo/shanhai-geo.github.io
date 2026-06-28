# 山海云枢 · 三口通信架构

## 三个口的定义

```
指令口 (管理口)        神经系统 (Agent供电局)      工作口 (AI引擎)
─────────────         ─────────────────          ─────────────
大脑皮层               中枢神经                   运动神经
主人发号施令           接收/路由/调度              执行任务
接收结果               汇总/推送                  返回结果
```

---

## 通信总线架构

```
┌────────────────────────────────────────────────────────────┐
│                      任务总线 (Task Bus)                      │
│                                                               │
│  所有指令和结果都经过这条总线                                  │
│  保证：指令畅通 · 结果及时 · 不丢失 · 可追踪                 │
│                                                               │
└────────────┬─────────────────────────────────┬──────────────┘
             │                                   │
             ▼                                   ▼
┌────────────────────┐              ┌────────────────────────┐
│   指令口 (管理口)    │              │   神经系统 (Agent供电局) │
│                    │              │                          │
│  主人输入指令      │─────命令────→│  任务调度器              │
│                    │              │    ↓                     │
│  接收结果推送      │←────结果─────│  路由到工作口            │
│                    │              │    ↓                     │
│  实时状态面板      │              │  监控执行                │
│  - 进行中任务      │              │    ↓                     │
│  - 已完成结果      │              │  汇总结果                │
│  - 失败重试        │              │    ↓                     │
│                    │              │  推送回指令口            │
└────────────────────┘              └──────────┬───────────────┘
                                               │
                                               ▼
                                    ┌────────────────────────┐
                                    │   工作口群 (AI引擎)      │
                                    │                          │
                                    │  P1-A 智谱GLM [ON]      │
                                    │  P1-B 硅基流动 [ON]     │
                                    │  P1-C 火山引擎 [ON]     │
                                    │  P1-D Coze Bot  [ON]    │
                                    │  P1-E 预留 [OFF]        │
                                    │  P1-F 预留 [OFF]        │
                                    │  P1-G 预留 [OFF]        │
                                    │                          │
                                    │  每个工作口独立执行      │
                                    │  结果返回给神经系统      │
                                    └────────────────────────┘
```

---

## 通信流程 (闭环)

### 场景1: 快速问答 (同步)

```
1. 主人: "帮我查一下今天的订单"
   │
   ▼
2. 指令口: POST /api/gateway
   {
     type: "chat",
     query: "帮我查一下今天的订单",
     priority: "normal"
   }
   │
   ▼
3. 神经系统: 任务调度器
   - 识别任务类型: chat
   - 选择工作口: P1-A (智谱GLM, 主路)
   - 转发请求
   │
   ▼
4. 工作口: P1-A 智谱GLM
   - 执行AI对话
   - 生成结果
   │
   ▼
5. 神经系统: 汇总结果
   - 记录执行日志
   - 更新任务状态
   │
   ▼
6. 指令口: 收到HTTP响应
   {
     success: true,
     reply: "今天共有15笔订单...",
     port: "P1-A",
     time: 1.2s
   }
   │
   ▼
7. 主人: 看到结果，发下一条指令
```

### 场景2: 长任务 (异步+推送)

```
1. 主人: "帮我分析最近一个月的销售数据并生成报告"
   │
   ▼
2. 指令口: POST /api/gateway
   {
     type: "task",
     query: "分析销售数据...",
     priority: "high",
     callback: "sse"  // 请求流式推送
   }
   │
   ▼
3. 神经系统: 任务调度器
   - 创建任务ID: task_abc123
   - 返回任务ID给指令口
   - 任务进入执行队列
   │
   ▼
4. 指令口: 打开SSE连接
   GET /api/gateway/stream?task_id=task_abc123
   (保持连接，等待结果推送)
   │
   ▼
5. 神经系统: 分发到工作口
   - P1-D Coze Bot (需要深度分析)
   - 可能同时调用多个工作口并行
   │
   ▼
6. 工作口: 执行中...
   - 第1步: 读取数据 (10%)
   - 第2步: 分析趋势 (30%)
   - 第3步: 生成报告 (60%)
   - 第4步: 优化建议 (100%)
   │
   ▼
7. 神经系统: 实时推送到指令口 (SSE)
   event: progress
   data: {"progress": 30, "status": "分析趋势中..."}
   
   event: progress
   data: {"progress": 60, "status": "生成报告中..."}
   
   event: result
   data: {"progress": 100, "result": "完整报告内容..."}
   │
   ▼
8. 指令口: 实时更新界面
   - 进度条: 30% → 60% → 100%
   - 状态: "分析中..." → "生成中..." → "完成"
   - 显示结果
   │
   ▼
9. 主人: 看到完整报告，发下一条指令
```

---

## 指令优先级

| 优先级 | 类型 | 响应时间 | 示例 |
|--------|------|---------|------|
| urgent | 紧急指令 | <1秒 | !自检, !熔断 |
| high | 高优先 | <3秒 | 系统诊断, 紧急查询 |
| normal | 普通 | <10秒 | AI对话, 数据查询 |
| low | 后台 | <60秒 | 报告生成, 批量任务 |

---

## 结果推送机制

### 方式1: HTTP同步 (快速问答)
```
指令口 → HTTP POST → 神经系统 → 工作口 → HTTP Response → 指令口
延迟: 1-5秒
适用: 简单问答, 状态查询
```

### 方式2: SSE流式 (长任务)
```
指令口 → HTTP POST (创建任务) → 返回task_id
指令口 → SSE GET (订阅结果) → 持续接收推送
神经系统 → 工作口执行 → 实时推送到SSE → 指令口
延迟: 即时推送
适用: 报告生成, 多步骤任务
```

### 方式3: 轮询 (兼容模式)
```
指令口 → HTTP POST (创建任务) → 返回task_id
指令口 → 每2秒 GET /api/gateway/task/{id} → 检查状态
神经系统 → 更新任务状态 → 指令口轮询获取
延迟: 2-4秒
适用: 不支持SSE的环境
```

---

## 任务追踪面板 (管理口)

```
┌──────────────────────────────────────┐
│  任务追踪面板                         │
├──────────────────────────────────────┤
│  进行中 (3)                          │
│  ├─ task_abc123: 分析销售数据 [60%]  │
│  ├─ task_def456: 生成GEO报告 [30%]   │
│  └─ task_ghi789: 客户数据分析 [80%]  │
│                                      │
│  已完成 (15)                         │
│  ├─ task_jkl012: 订单查询 ✓ (1.2s)   │
│  ├─ task_mno345: 健康检查 ✓ (0.8s)   │
│  └─ ... 查看更多                     │
│                                      │
│  失败 (1)                            │
│  └─ task_pqr678: 超时 ✗ [重试]       │
└──────────────────────────────────────┘
```

---

## 实现要点

### 1. 统一网关 /api/gateway.js
```javascript
// 接收所有请求，路由到对应工作口
POST /api/gateway
  - type: "chat" → 同步返回AI对话结果
  - type: "task" → 返回task_id，异步执行
  - type: "status" → 查询任务状态

GET /api/gateway/stream?task_id=xxx
  - SSE流式推送任务进度和结果

GET /api/gateway/task/{id}
  - 查询单个任务状态和结果
```

### 2. 任务队列 (内存/Redis)
```javascript
const taskQueue = {
  // 高优先级队列
  urgent: [],
  // 普通队列
  normal: [],
  // 后台队列
  low: [],
  
  // 任务状态
  tasks: new Map(),
  
  // 添加任务
  add(task) {
    this[task.priority].push(task);
    this.tasks.set(task.id, task);
  },
  
  // 获取下一个任务
  next() {
    if (this.urgent.length) return this.urgent.shift();
    if (this.normal.length) return this.normal.shift();
    if (this.low.length) return this.low.shift();
    return null;
  }
};
```

### 3. SSE推送 (Server-Sent Events)
```javascript
// 管理口打开SSE连接
const eventSource = new EventSource('/api/gateway/stream?task_id=xxx');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.progress) {
    updateProgress(data.progress);
  }
  if (data.result) {
    showResult(data.result);
    eventSource.close();
  }
};
```

### 4. 管理口前端改造
```javascript
// 发送指令
async function sendCommand(query, priority = 'normal') {
  // 1. 发送请求
  const resp = await fetch('/api/gateway', {
    method: 'POST',
    headers: { 'X-Admin-Key': ADMIN_KEY },
    body: JSON.stringify({
      type: 'chat',
      query: query,
      priority: priority
    })
  });
  
  // 2. 接收结果
  const data = await resp.json();
  showResult(data.reply);
}

// 发送长任务
async function sendTask(query) {
  // 1. 创建任务
  const resp = await fetch('/api/gateway', {
    method: 'POST',
    headers: { 'X-Admin-Key': ADMIN_KEY },
    body: JSON.stringify({
      type: 'task',
      query: query,
      priority: 'normal',
      callback: 'sse'
    })
  });
  
  const { taskId } = await resp.json();
  
  // 2. 打开SSE订阅
  const sse = new EventSource(`/api/gateway/stream?task_id=${taskId}`);
  
  sse.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.progress) {
      showProgress(data.progress, data.status);
    }
    if (data.result) {
      showResult(data.result);
      sse.close();
    }
  };
}
```

---

## 关键设计原则

1. **指令畅通**: 任何指令都能立即被接收，不会阻塞
2. **结果及时**: 快速任务同步返回，长任务实时推送
3. **不丢失**: 所有任务有ID，可追踪，可重试
4. **可追踪**: 主人随时看到任务状态和进度
5. **优先级**: 紧急任务优先执行，后台任务排队
6. **闭环**: 指令→执行→结果→下一条指令，流畅循环
