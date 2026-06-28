# 山海云枢 Agent 供电局网关 V40.0 路演验收清单

> **文档版本**: v1.0.0  
> **编制日期**: 2025-06-28  
> **适用范围**: V40.0 部署验收  
> **脚本位置**: `山海云枢/测试/roadshow-test.sh`

---

## 一、环境变量说明

执行验收脚本前，需配置以下环境变量：

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `BASE_URL` | 网关服务地址 | `http://localhost:3000` |
| `MASTER_KEY` | 管理员密钥（用于 Kill Switch 操作） | `demo-master-key-2025` |

### 本地测试
```bash
export BASE_URL=http://localhost:3000
export MASTER_KEY=your-master-key
bash roadshow-test.sh
```

### Vercel 部署后测试
```bash
export BASE_URL=https://your-project.vercel.app
export MASTER_KEY=your-production-key
bash roadshow-test.sh
```

---

## 二、验收场景清单

### 场景1: 基础连通性测试

| 项目 | 内容 |
|------|------|
| **测试编号** | TC-001 |
| **测试目标** | 状态页可达，返回正确版本号 V40.0 |
| **请求方式** | `GET /api/gateway` |
| **验收标准** | 1. HTTP 响应码为 200<br>2. 响应体为有效 JSON<br>3. 包含 `"version":"V40.0"` 字段 |
| **预期结果** | 返回包含版本信息的网关状态 JSON |

**验收命令**:
```bash
curl -s http://localhost:3000/api/gateway
```

---

### 场景2: AI对话路由测试

| 项目 | 内容 |
|------|------|
| **测试编号** | TC-002 |
| **测试目标** | 发送 chat 请求，验证能收到回复，记录使用的端口 |
| **请求方式** | `POST /api/gateway` |
| **请求体** | `{"type":"chat","query":"你好，请介绍一下自己"}` |
| **验收标准** | 1. HTTP 响应码为 200<br>2. 响应体包含回复内容<br>3. 能提取到使用的端口信息 |
| **预期结果** | 返回 AI 对话回复，包含端口路由信息 |

---

### 场景3: 端口故障切换测试

| 项目 | 内容 |
|------|------|
| **测试编号** | TC-003 |
| **测试目标** | 指定一个不存在的端口，验证自动切换到备用端口 |
| **请求方式** | `POST /api/gateway` |
| **请求体** | `{"type":"chat","query":"测试故障切换","port":"P1-FAIL"}` |
| **验收标准** | 1. 自动故障切换机制生效<br>2. 返回 200（切换成功）或 503（端口不可用）<br>3. 不出现未处理的异常 |
| **预期结果** | 系统自动切换到备用端口继续服务 |

---

### 场景4: Kill Switch 全流程测试

| 项目 | 内容 |
|------|------|
| **测试编号** | TC-004 |
| **测试目标** | 废掉端口 → 验证被废 → 恢复端口 → 验证恢复 |
| **操作序列** | 1. `POST /api/gateway` - `{"kill_command":"KILL_PORT","params":{"port":"P1-E"}}`<br>2. `POST /api/gateway` - `{"kill_command":"STATUS"}` 验证<br>3. `POST /api/gateway` - `{"kill_command":"REVIVE_PORT","params":{"port":"P1-E","masterKey":"xxx"}}`<br>4. `POST /api/gateway` - `{"kill_command":"STATUS"}` 验证 |
| **验收标准** | 1. KILL_PORT 返回成功<br>2. STATUS 显示端口被禁用<br>3. REVIVE_PORT 返回成功<br>4. STATUS 显示端口已恢复 |
| **预期结果** | Kill Switch 操作完整执行，端口状态正确变更 |

---

### 场景5: 紧急锁定/解锁测试

| 项目 | 内容 |
|------|------|
| **测试编号** | TC-005 |
| **测试目标** | LOCKDOWN → 验证请求被拒 → UNLOCK → 验证恢复 |
| **操作序列** | 1. `POST /api/gateway` - `{"kill_command":"LOCKDOWN","params":{"masterKey":"xxx"}}`<br>2. `POST /api/gateway` - 发送普通请求验证被拒<br>3. `POST /api/gateway` - `{"kill_command":"UNLOCK","params":{"masterKey":"xxx"}}`<br>4. 发送普通请求验证恢复 |
| **验收标准** | 1. LOCKDOWN 执行成功<br>2. 锁定后请求返回 403 或 `locked` 提示<br>3. UNLOCK 执行成功<br>4. 解锁后服务恢复正常 |
| **预期结果** | 紧急锁定功能正常，能快速响应安全事件 |

---

### 场景6: 治理框架验证

| 项目 | 内容 |
|------|------|
| **测试编号** | TC-006 |
| **测试目标** | 查询治理数据，验证9条红线、行为边界正确返回 |
| **请求方式** | `GET /api/gateway?governance=1` |
| **验收标准** | 1. HTTP 响应码为 200<br>2. 响应包含红线规则（≥9条）<br>3. 包含行为边界定义<br>4. 包含治理策略 |
| **预期结果** | 返回完整的治理框架定义 |

**关键验收点**:
- 9条红线规则明确定义
- 行为边界清晰可查
- 治理策略完整覆盖

---

### 场景7: 健康巡检测试

| 项目 | 内容 |
|------|------|
| **测试编号** | TC-007 |
| **测试目标** | 调用 health 端点，验证返回所有端口状态和整体评估 |
| **请求方式** | `GET /api/gateway?health=1` |
| **验收标准** | 1. HTTP 响应码为 200<br>2. 返回各端口状态信息<br>3. 包含健康状态评估<br>4. 可能包含健康评分 |
| **预期结果** | 返回完整的健康巡检报告 |

**返回数据预期**:
- 各端口在线/离线状态
- 整体健康评分
- 异常端口告警（如有）

---

### 场景8: 自进化分析测试

| 项目 | 内容 |
|------|------|
| **测试编号** | TC-008 |
| **测试目标** | 调用 evolution 端点，验证返回端口表现和建议 |
| **请求方式** | `GET /api/gateway?evolution=1` |
| **验收标准** | 1. HTTP 响应码为 200<br>2. 包含进化/性能数据<br>3. 包含优化建议<br>4. 包含分析结论 |
| **预期结果** | 返回自进化分析报告 |

---

### 场景9: 任务分发测试

| 项目 | 内容 |
|------|------|
| **测试编号** | TC-009 |
| **测试目标** | 通过 dispatch 提交任务，查询任务状态 |
| **操作序列** | 1. `POST /api/dispatch` - 提交异步任务<br>2. `GET /api/dispatch?task_id=xxx` - 查询任务状态<br>3. `GET /api/dispatch?queue=1` - 查询队列状态 |
| **验收标准** | 1. 任务提交返回 200 或 202<br>2. 获取到任务 ID<br>3. 能查询到任务状态<br>4. 队列状态正常 |
| **预期结果** | 任务分发系统正常工作 |

---

### 场景10: 审计日志验证

| 项目 | 内容 |
|------|------|
| **测试编号** | TC-010 |
| **测试目标** | 执行多个操作后，查询审计日志验证记录完整 |
| **操作序列** | 1. 执行多次操作（对话、Kill Switch 等）<br>2. `GET /api/gateway?audit=1` - 查询审计日志 |
| **验收标准** | 1. 审计日志端点可用（或通过其他方式记录）<br>2. 记录包含操作类型、时间戳<br>3. 操作历史可追溯 |
| **预期结果** | 审计日志完整记录所有关键操作 |

---

## 三、API 端点完整清单

### GET 端点

| 端点 | 说明 |
|------|------|
| `GET /api/gateway` | 默认状态页 |
| `GET /api/gateway?governance=1` | 治理数据 |
| `GET /api/gateway?kill_status=1` | Kill Switch 状态 |
| `GET /api/gateway?port_status=1` | 端口状态 |
| `GET /api/gateway?health=1` | 健康巡检 |
| `GET /api/gateway?evolution=1` | 进化分析 |
| `GET /api/gateway?optimal_path=1&task_type=chat` | 优选路径 |
| `GET /api/dispatch?task_id=xxx` | 查询任务 |
| `GET /api/dispatch?queue=1` | 队列状态 |
| `GET /api/sse?task_id=xxx` | SSE 流式推送 |

### POST 端点

| 端点 | 请求体 | 说明 |
|------|--------|------|
| `/api/gateway` | `{"type":"chat","query":"..."}` | 同步对话 |
| `/api/gateway` | `{"type":"task","query":"...","priority":"normal"}` | 异步任务 |
| `/api/gateway` | `{"kill_command":"STATUS"}` | Kill Switch 状态查询 |
| `/api/gateway` | `{"kill_command":"KILL_PORT","params":{"port":"P1-E"}}` | 废掉端口 |
| `/api/gateway` | `{"kill_command":"REVIVE_PORT","params":{"port":"P1-E","masterKey":"xxx"}}` | 恢复端口 |
| `/api/gateway` | `{"kill_command":"LOCKDOWN","params":{"masterKey":"xxx"}}` | 紧急锁定 |
| `/api/gateway` | `{"kill_command":"UNLOCK","params":{"masterKey":"xxx"}}` | 解除锁定 |
| `/api/gateway` | `{"health_check":true}` | 手动健康巡检 |
| `/api/gateway` | `{"auto_heal":true}` | 手动自修复 |
| `/api/gateway` | `{"evolution_analysis":true}` | 手动进化分析 |
| `/api/gateway` | `{"rollback_config":true}` | 配置回滚 |
| `/api/dispatch` | `{"type":"task","query":"...","priority":"normal"}` | 任务分发 |

---

## 四、验收执行流程

```
┌─────────────────────────────────────────────────────────────┐
│                    验收执行流程                              │
├─────────────────────────────────────────────────────────────┤
│  1. 环境准备                                                 │
│     ├── 安装 curl（如未安装）                                 │
│     ├── 配置 BASE_URL                                        │
│     └── 配置 MASTER_KEY                                      │
│                                                              │
│  2. 本地测试                                                 │
│     ├── 启动本地服务 (npm run dev)                          │
│     └── 执行验收脚本                                         │
│                                                              │
│  3. Vercel 部署测试                                          │
│     ├── 部署到 Vercel                                        │
│     ├── 更新 BASE_URL                                        │
│     └── 重新执行验收脚本                                     │
│                                                              │
│  4. 结果判定                                                 │
│     ├── 10/10 PASS → 通过验收                               │
│     └── 存在 FAIL → 修复后重新测试                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 五、脚本特性说明

### 可重复执行
- Kill Switch 操作后会自动恢复原状
- 测试端口会被正确废掉和恢复
- 锁定状态会被正确解除

### 错误容忍
- 单个场景失败不影响其他场景
- 详细的日志输出便于定位问题
- WARN 级别提示不影响整体判定

### 彩色输出
- `[PASS]` 绿色 - 测试通过
- `[FAIL]` 红色 - 测试失败
- `[WARN]` 黄色 - 警告/异常
- `[INFO]` 蓝色 - 信息提示

---

## 六、常见问题

### Q1: curl 未安装
```bash
# Ubuntu/Debian
sudo apt install curl

# macOS
brew install curl
```

### Q2: 连接超时
增加 TIMEOUT 值或检查网络连接：
```bash
export TIMEOUT=60
```

### Q3: Kill Switch 操作失败
检查 MASTER_KEY 是否正确，或确认端口未被其他操作锁定。

### Q4: 端口不可用
确保目标端口在网关配置中已定义。

---

## 七、验收报告模板

```
╔════════════════════════════════════════════════════════════╗
║          山海云枢 Agent 供电局网关 V40.0 验收报告            ║
╠════════════════════════════════════════════════════════════╣
║  验收日期: _______________                                  ║
║  验收环境: _______________                                  ║
║  测试人员: _______________                                  ║
╠════════════════════════════════════════════════════════════╣
║  测试结果:                                                  ║
║    场景1-基础连通性:    [PASS/FAIL]                         ║
║    场景2-AI对话路由:    [PASS/FAIL]                         ║
║    场景3-端口故障切换:  [PASS/FAIL]                         ║
║    场景4-Kill Switch:   [PASS/FAIL]                         ║
║    场景5-紧急锁定/解锁: [PASS/FAIL]                         ║
║    场景6-治理框架验证:  [PASS/FAIL]                         ║
║    场景7-健康巡检:      [PASS/FAIL]                         ║
║    场景8-自进化分析:    [PASS/FAIL]                         ║
║    场景9-任务分发:      [PASS/FAIL]                         ║
║    场景10-审计日志:    [PASS/FAIL]                         ║
╠════════════════════════════════════════════════════════════╣
║  通过率: ___/10                                             ║
║  结论: [通过验收 / 需要修复]                                 ║
╚════════════════════════════════════════════════════════════╝
```

---

> **文档维护**: 请在每次验收后更新此文档，记录实际测试结果和发现的问题。
