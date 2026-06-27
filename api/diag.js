/**
 * 山海云枢 API网关 - GEO诊断代理
 * 对外提供GEO诊断服务，前端不暴露密钥
 */
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', 'Content-Type')
      .end('');
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '仅支持POST' });
  }

  const { url, keywords } = req.body || {};
  if (!url) return res.status(400).json({ error: '缺少url参数' });

  // 使用智谱做诊断分析
  const apiKey = process.env.ZHIPU_API_KEY || process.env.SILICONFLOW_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: '诊断引擎未配置' });
  }

  const prompt = `你是一位GEO(生成式引擎优化)专家。请对以下网站进行GEO诊断分析：
网站URL: ${url}
${keywords ? `目标关键词: ${keywords}` : ''}

请按以下维度分析（每项0-20分，总分100）：
1. AI搜索可见度：该网站在ChatGPT/Perplexity等AI搜索中被提及的可能性
2. 结构化数据：Schema.org标记、FAQ格式、内容结构化程度
3. 内容权威性：E-E-A-T信号、引用密度、专业术语覆盖
4. 技术SEO基础：标题/描述/关键词/robots/sitemap
5. GEO专项优化：llms.txt/AI爬虫友好度/内容引用格式

输出格式：JSON对象，包含scores(各维度分数)、total(总分)、issues(问题列表)、suggestions(优化建议列表)`;

  try {
    const isSilicon = !process.env.ZHIPU_API_KEY;
    const apiUrl = isSilicon
      ? 'https://api.siliconflow.cn/v1/chat/completions'
      : 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
    const model = isSilicon ? 'Qwen/Qwen2.5-7B-Instruct' : 'glm-4-flash';

    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 2048
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!resp.ok) {
      const err = await resp.text();
      return res.status(502).json({ error: `引擎返回${resp.status}`, detail: err });
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // 尝试解析JSON
    let result;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: content };
    } catch {
      result = { raw: content };
    }

    return res.status(200).json({
      ...result,
      url: url,
      engine: isSilicon ? '硅基流动' : '智谱GLM',
      gateway: '山海云枢',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({ error: '诊断失败', detail: err.message });
  }
}
