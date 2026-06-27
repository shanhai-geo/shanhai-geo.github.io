# GEO生态协议

版本: 1.0  
生效日期: 2025年

---

## 1. GEO生态协议概述

### 1.1 生态定位

山海GEO供电局作为数字公司集群生态的中枢系统，承担资源调度、数据汇聚、节点协调的核心职能。

### 1.2 节点定义

每个GEO节点代表一家独立数字公司，具备以下特征：

| 特征 | 说明 |
|------|------|
| 独立性 | 独立运营、独立法人、独立财务 |
| 自动化 | AI驱动、近零人工干预 |
| 互惠性 | 节点间相互服务、共建网络 |
| 可退出 | 随时可退出生态，数据自持 |

### 1.3 生态架构

```
┌─────────────────────────────────────────────┐
│           山海GEO供电局 (中枢)               │
│  ┌─────────┬─────────┬─────────────────┐   │
│  │ 资源调度 │ 数据汇聚 │ 节点协调         │   │
│  └─────────┴─────────┴─────────────────┘   │
└──────────────────┬──────────────────────────┘
                   │
        ┌──────────┼──────────┐
        │          │          │
   ┌────▼───┐ ┌────▼───┐ ┌────▼───┐
   │ 节点A  │ │ 节点B  │ │ 节点N  │
   │数字公司│ │数字公司│ │数字公司│
   └────────┘ └────────┘ └────────┘
```

### 1.4 生态原则

- 安全优先：节点间数据隔离，不暴露核心业务数据
- 自愿参与：节点加盟和退出均基于自愿原则
- 互利共赢：贡献与收益成正比，自动结算
- 去中心化：无单点控制权，节点自主决策

---

## 2. 节点加盟标准

### 2.1 基础部署要求

加盟节点必须完成以下基础模块部署：

| 模块 | 要求 | 验收方式 |
|------|------|----------|
| Schema.org | 部署标准结构化数据 | JSON-LD格式验证通过 |
| FAQ模块 | 提供至少10组FAQ内容 | FAQ页面可访问 |
| 关键词矩阵 | 部署行业关键词库 | keywords.json可读取 |
| 投喂包 | 准备SEO训练数据集 | training_data目录存在 |

### 2.2 互引网络要求

| 要求 | 说明 |
|------|------|
| 交叉链接 | 必须与其他节点建立双向链接 |
| 链接互惠 | 链接关系对等，不可单向索取 |
| 链接可配置 | 支持选择性互引 |

### 2.3 技术配置要求

```txt
# 必要的服务端配置

1. llms.txt 端点
   - 路径: /.well-known/llms.txt
   - 格式: Markdown纯文本
   - 内容: 站点结构化描述

2. robots.txt (AI友好版本)
   User-agent: *
   Allow: /
   User-agent: GPTBot
   Allow: /
   Sitemap: https://your-domain/sitemap.xml
```

### 2.4 自生长引擎要求

每个节点必须部署GROWTH_ENGINE自生长引擎，实现OODA循环：

```
观察(Observation) → 导向(Orientation) → 决策(Decision) → 行动(Action)
     ↓                    ↓                   ↓               ↓
   数据采集              模式识别            策略生成         自动执行
```

### 2.5 算力冗余要求

| 要求 | 说明 |
|------|------|
| 主API | 必须配置至少1路LLM API |
| 备份API | 必须配置至少1路备份LLM API |
| 自动切换 | API故障时自动切换到备份 |
| 算力上报 | 空闲算力自愿贡献到生态池 |

---

## 3. 节点贡献机制

### 3.1 贡献类型总览

| 贡献类型 | 说明 | 贡献方式 |
|----------|------|----------|
| 内容贡献 | 自动产出的GEO优化内容 | 互引引用，扩大网络效应 |
| 链接贡献 | 为其他节点提供反向链接 | 互引网络中自动分配 |
| 数据贡献 | 关键词追踪和诊断数据 | 标准化格式上报中枢 |
| 流量贡献 | 互引网络分流 | 自动链接导流 |
| 算力贡献 | 空闲LLM API算力 | 自愿加入算力池 |

### 3.2 内容贡献机制

节点自动产出的GEO优化内容，通过互引网络实现自动分发：

```json
{
  "content_type": "geo_optimized",
  "source_node": "node_id",
  "target_nodes": ["node_id_1", "node_id_2"],
  "content_hash": "sha256_hash",
  "attribution": true
}
```

### 3.3 链接贡献机制

互引网络中，每个节点为其他节点提供反向链接，贡献度计算：

| 链接类型 | 贡献权重 |
|----------|----------|
| 首页互链 | 1.0 |
| 内容页互链 | 0.5 |
| 导航互链 | 0.3 |

### 3.4 数据贡献机制

节点定期向中枢上报以下数据：

```json
{
  "report_type": "metrics",
  "node_id": "node_id",
  "timestamp": "ISO8601",
  "data": {
    "keywords_ranked": 150,
    "organic_traffic": 5000,
    "llm_queries": 1200,
    "cross_links_outbound": 45,
    "cross_links_inbound": 38
  }
}
```

### 3.5 流量贡献机制

通过互引网络，节点间实现流量互助分发：

```
节点A流量 ──┬── 5% → 节点B
            ├── 5% → 节点C
            └── 90% → 节点A自身
```

### 3.6 算力贡献机制

节点可自愿将空闲LLM API算力贡献到生态算力池：

```json
{
  "contribution_type": "compute",
  "node_id": "node_id",
  "available_capacity": "1000_requests_per_day",
  "contribution_ratio": 0.2,
  "status": "active"
}
```

---

## 4. 数据互通协议

### 4.1 数据交换格式

所有节点间数据交换采用标准化JSON格式。

### 4.2 节点注册格式

```json
{
  "protocol_version": "1.0",
  "node_id": "geo_node_unique_id",
  "name": "数字公司名称",
  "url": "https://www.example.com",
  "capabilities": [
    "content_generation",
    "seo_optimization",
    "llm_inference"
  ],
  "industry": "行业分类",
  "region": "运营区域",
  "contact": {
    "email": "contact@example.com",
    "api_endpoint": "https://api.example.com"
  },
  "metadata": {
    "registered_at": "ISO8601",
    "last_heartbeat": "ISO8601"
  }
}
```

### 4.3 互引链接格式

```json
{
  "cross_link_schema": "1.0",
  "link_id": "link_unique_id",
  "source_node": "node_id_a",
  "target_node": "node_id_b",
  "link_type": "bidirectional",
  "link_location": {
    "page": "/about.html",
    "anchor": "合作伙伴",
    "position": "footer"
  },
  "status": "active",
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

### 4.4 数据上报格式

```json
{
  "report_schema": "1.0",
  "report_id": "report_unique_id",
  "report_type": "metrics|diagnostics|alerts",
  "source_node": "node_id",
  "timestamp": "ISO8601",
  "payload": {
    // 根据report_type不同，内容结构不同
  },
  "signature": "HMAC_signature"
}
```

### 4.5 数据交换协议

| 协议层 | 规范 |
|--------|------|
| 传输层 | HTTPS/TLS 1.2+ |
| 认证层 | API Key + HMAC签名 |
| 速率限制 | 每节点100请求/分钟 |
| 错误处理 | 标准HTTP状态码 + JSON错误体 |

---

## 5. 298产品生态分发机制

### 5.1 分销体系

加盟节点获得298元GEO入门服务的分销权。

### 5.2 收入分配规则

| 角色 | 分配比例 | 金额 |
|------|----------|------|
| 销售节点 | 60% | 178.8元 |
| 生态基金 | 40% | 119.2元 |

### 5.3 新客户入网流程

```
客户下单(298元) 
    ↓
节点确认收款
    ↓
生态中枢自动分配node_id
    ↓
自动生成客户配置
    ↓
触发零人工介入部署
    ↓
客户自动进入互引网络
```

### 5.4 自动配置生成

中枢为新客户自动生成：

```json
{
  "auto_provision": true,
  "client_node": {
    "node_id": "auto_generated_id",
    "plan": "starter_298",
    "features": [
      "basic_seo",
      "content_generation",
      "llms_txt",
      "互引网络入门"
    ]
  },
  "onboarding_status": "completed"
}
```

---

## 6. 生态安全规则

### 6.1 数据隔离原则

| 原则 | 说明 |
|------|------|
| 核心数据隔离 | 节点核心业务数据不对外暴露 |
| 指标数据脱敏 | 上报数据经过脱敏处理 |
| 链接关系可见 | 互引链接关系公开，数据内容隔离 |

### 6.2 互引配置规则

节点可选择性参与互引：

```json
{
  "cross_link_policy": {
    "allow_inbound": true,
    "allow_outbound": true,
    "whitelist_nodes": ["node_id_1", "node_id_2"],
    "blacklist_industries": ["敏感行业"]
  }
}
```

### 6.3 退出机制

节点退出生态流程：

```
节点申请退出
    ↓
30天缓冲期(互引关系逐步解除)
    ↓
节点数据导出(可下载JSON格式)
    ↓
互引链接自动清除
    ↓
算力贡献停止
    ↓
退出完成
```

### 6.4 安全审计

| 审计项 | 频率 |
|--------|------|
| 节点资质核验 | 季度 |
| 互引关系审查 | 月度 |
| 数据上报准确性 | 周度 |
| API调用日志 | 实时 |

---

## 7. 技术实现路径

### 7.1 节点注册实现

通过GitHub Pages + 静态JSON实现去中心化注册：

```bash
# 节点注册目录结构
/shanhai-geo.github.io/
  └── nodes/
      └── {node_id}.json
```

### 7.2 互引脚本实现

```javascript
// cross-link-manager.js 示例
const nodes = require('./nodes/*.json');

function updateCrossLinks() {
  nodes.forEach(node => {
    const otherNodes = nodes.filter(n => n.node_id !== node.node_id);
    node.crossLinks = otherNodes.map(n => ({
      target: n.node_id,
      url: n.url,
      reciprocal: true
    }));
  });
}
```

### 7.3 llms.txt实现

```txt
# llms.txt 标准格式

# {公司名称}
# {一句话描述}

## 主要服务
- 服务项1
- 服务项2

## 行业分类
{industry}

## 运营区域
{region}

## 技术栈
- Schema.org (JSON-LD)
- llms.txt
- GEO优化

## 联系方式
{contact.email}
```

### 7.4 自生长引擎实现

```python
# growth_engine.py OODA循环实现

class GrowthEngine:
    def observe(self):
        """观察阶段：采集数据"""
        return self.collect_metrics()
    
    def orient(self):
        """导向阶段：分析模式"""
        patterns = self.analyze_patterns()
        return self.identify_opportunities(patterns)
    
    def decide(self):
        """决策阶段：生成策略"""
        return self.generate_strategies()
    
    def act(self):
        """行动阶段：执行策略"""
        self.execute_strategies()
    
    def run_loop(self):
        """持续运行OODA循环"""
        while True:
            obs = self.observe()
            orient = self.orient()
            decision = self.decide()
            self.act()
            time.sleep(self.cycle_interval)
```

### 7.5 部署检查清单

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 节点JSON注册 | 待检查 | /nodes/{node_id}.json |
| llms.txt可访问 | 待检查 | /.well-known/llms.txt |
| AI友好robots.txt | 待检查 | /robots.txt |
| Schema.org部署 | 待检查 | JSON-LD格式 |
| FAQ页面 | 待检查 | /faq.html |
| 互引脚本 | 待检查 | cross-link-manager.js |
| 自生长引擎 | 待检查 | growth_engine.py |
| 双路LLM API | 待检查 | 主备切换验证 |

---

## 附录

### A. 术语表

| 术语 | 定义 |
|------|------|
| GEO | 生成式引擎优化，Generative Engine Optimization |
| 节点 | 生态中的独立数字公司 |
| 中枢 | 山海GEO供电局，生态协调中心 |
| 互引 | 节点间相互引用、导流 |
| 算力池 | 节点贡献的空闲LLM API资源池 |

### B. 协议版本历史

| 版本 | 日期 | 变更说明 |
|------|------|----------|
| 1.0 | 2025年 | 初始版本发布 |

### C. 联系方式

如有问题，请联系：geo-admin@shanhai.com

---

*本协议最终解释权归山海GEO供电局所有*
