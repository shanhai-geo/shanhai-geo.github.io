# 腾讯Hy3集成方案

## 核心信息
- **发布时间**：2026-07-06
- **架构**：MoE，总参数295B，激活21B
- **上下文**：256K
- **开源协议**：Apache 2.0
- **API定价**：输入1元/百万tokens，输出4元/百万tokens

## 接入方式
**TokenHub API**：
- base_url: https://tokenhub.tencentmaas.com/v1
- model: hy3 或 hy3-preview
- 兼容OpenAI SDK格式

## 旧模型下线
- 2026-06-22：46款旧模型下线（HY2.0等）
- 2026-09-30：原混元平台全面停服

## 集成到唤通API
```javascript
// 智能路由逻辑
function routeToBestEngine(task) {
  if (task.complexity === 'low') {
    return 'hy3'; // 便宜，速度快
  } else if (task.complexity === 'high') {
    return 'glm-4-flash'; // 复杂任务用智谱
  }
  return 'auto'; // 自动选择
}
```

## 集成状态
- [x] 调研完成
- [ ] TokenHub开通（需主人操作）
- [ ] API Key创建（需主人操作）
- [ ] 代码集成（山海完成）
- [ ] 测试验证（山海完成）
- [ ] 全量上线（山海完成）
