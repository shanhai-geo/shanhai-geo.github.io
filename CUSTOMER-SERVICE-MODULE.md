# 山海智能·客服模块V2

## 架构

```
客服模块 = 知识库(JSON) + 引擎(chat.html) + 客户面板(customer-portal.html)
```

- **知识库** `knowledge-product.json`：所有产品知识、话术、技术文档、场景库、SOP流程
- **引擎** `chat.html`：对话UI + 知识库加载器 + 信号检测 + 来源追踪
- **客户面板** `customer-portal.html`：客户自助查询Key/到期/推荐统计/续期

## 投喂指南

### 修改产品知识
编辑 `knowledge-product.json` 中的对应模块：
- `identity` → 品牌名、产品名、定位
- `pricing` → 价格、套餐、转介绍规则
- `product_features` → 产品卖点列表
- `engines` → 支持的AI引擎列表
- `api` → 接口地址、认证方式、交付时间

### 修改话术
- `objection_handling` → 异议处理话术（太贵/考虑一下/不懂技术等）
- `scripts.personality` → AI客服性格设定

### 修改行业场景
- `scenarios` → 各行业的一句话价值描述
- 格式：`"行业名": "一句话卖点"`

### 修改技术文档
- `tech_docs.curl` → curl测试命令
- `tech_docs.python` → Python代码示例
- `tech_docs.nodejs` → Node.js代码示例
- `tech_docs.java` → Java代码示例

### 修改SOP流程
- `sop.customer_success` → 客户成功引导步骤
- `sop.after_sales` → 售后服务话术（续期/Key查询/问题排查）
- `sop.signal_triggers` → 高价值信号触发条件

### 修改链接
- `links` → 各页面URL（支付/客服/落地页/客户面板等）

## 新产品上线

1. 复制 `knowledge-product.json` → `knowledge-产品2.json`
2. 修改新JSON中的所有内容为新产品知识
3. chat.html通过URL参数 `?product=产品2` 加载对应知识库
4. 投喂完成，客服即刻上线

## 关键特性

- 知识库加载失败自动降级为内置兜底prompt
- 外链来源追踪（?ref=来源&industry=行业 → 定制欢迎词）
- 高价值信号自动识别（[SIGNAL:LEAD]标记）
- 信号日志存储（localStorage shanhai_leads）
- 来源日志存储（localStorage shanhai_ref_tracks）

## 文件清单

| 文件 | 用途 |
|------|------|
| knowledge-product.json | 产品知识库（投喂即升级） |
| chat.html | 客服引擎（模块化） |
| customer-portal.html | 客户自助面板 |
| pay.html | 支付页 |
| landing.html | 落地页 |
| orders.json | 订单数据库 |
| analytics.json | 流量追踪 |
