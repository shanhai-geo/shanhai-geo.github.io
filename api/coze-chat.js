/**
 * 山海云枢 - Coze Bot API 代理
 * 管理后台主Agent通道
 * 
 * 流程：管理后台 → /api/coze-chat → Coze Bot API → 返回智能回复
 * 
 * 环境变量：
 * - COZE_PAT_TOKEN: 扣子平台个人访问令牌
 * - COZE_BOT_ID: 智能体ID
 * - COZE_USER_ID: 用户标识（可选，默认 admin_shanhai）
 * - ADMIN_KEY: 管理员密钥（可选，用于鉴权）
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
  'Content-Type': 'application/json'
};

// 管理员鉴权（可选）
function verifyAdmin(req) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return true; // 未配置则不鉴权
  const reqKey = req.headers['x-admin-key'] || req.body?.adminKey;
  return reqKey === adminKey;
}

// Coze API 非流式调用
async function callCozeBot(query, conversationId, userId) {
  const token = process.env.COZE_PAT_TOKEN;
  const botId = process.env.COZE_BOT_ID;
  
  if (!token || !botId) {
    return { error: 'Coze Bot 未配置，请在 Vercel 环境变量中设置 COZE_PAT_TOKEN 和 COZE_BOT_ID' };
  }

  const baseUrl = 'https://api.coze.cn';
  
  try {
    // Step 1: 发起对话
    const chatPayload = {
      bot_id: botId,
      user_id: userId || process.env.COZE_USER_ID || 'admin_shanhai',
      stream: false,
      auto_save_history: true,
      additional_messages: [
        {
          role: 'user',
          content: query,
          content_type: 'text'
        }
      ]
    };
    
    if (conversationId) {
      chatPayload.conversation_id = conversationId;
    }

    const chatResp = await fetch(`${baseUrl}/v3/chat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(chatPayload),
      signal: AbortSignal.timeout(60000) // 60秒超时
    });

    if (!chatResp.ok) {
      const errText = await chatResp.text();
      return { error: `Coze API 返回 ${chatResp.status}: ${errText}` };
    }

    const chatData = await chatResp.json();
    
    if (chatData.code !== 0) {
      return { error: `Coze 对话失败: ${chatData.msg || '未知错误'}` };
    }

    const convId = chatData.data?.conversation_id || chatData.data?.id;
    const chatId = chatData.data?.id;

    // Step 2: 轮询对话状态
    let status = chatData.data?.status || 'created';
    let maxWait = 50; // 最多等50秒
    while ((status === 'created' || status === 'in_progress') && maxWait > 0) {
      await new Promise(r => setTimeout(r, 1000));
      maxWait--;
      
      const statusResp = await fetch(
        `${baseUrl}/v3/chat/retrieve?conversation_id=${convId}&chat_id=${chatId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (statusResp.ok) {
        const statusData = await statusResp.json();
        status = statusData.data?.status;
      }
    }

    if (status !== 'completed') {
      return { error: `对话超时或失败，状态: ${status}`, conversationId: convId };
    }

    // Step 3: 获取对话消息
    const msgResp = await fetch(
      `${baseUrl}/v3/conversation/message/list?conversation_id=${convId}&chat_id=${chatId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!msgResp.ok) {
      // 备用：尝试另一个接口
      const msgResp2 = await fetch(
        `${baseUrl}/v3/conversation/${convId}/messages?limit=5`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (!msgResp2.ok) {
        return { error: '获取回复消息失败', conversationId: convId };
      }
      
      const msgData2 = await msgResp2.json();
      const messages = msgData2.data || [];
      const assistantMsg = messages.filter(m => m.role === 'assistant').pop();
      
      return {
        reply: assistantMsg?.content || '主Agent暂无回复',
        conversationId: convId,
        role: assistantMsg?.type || 'answer'
      };
    }

    const msgData = await msgResp.json();
    const messages = msgData.data || [];
    const assistantMsg = messages.filter(m => m.role === 'assistant' && m.type === 'answer').pop();

    return {
      reply: assistantMsg?.content || '主Agent暂无回复',
      conversationId: convId,
      role: assistantMsg?.type || 'answer'
    };

  } catch (err) {
    return { error: `Coze 调用异常: ${err.message}` };
  }
}

export default async function handler(req, res) {
  // CORS
  if (req.method === 'OPTIONS') {
    return res.status(200)
      .setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Key')
      .end('');
  }

  // 健康检查
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'online',
      service: '山海云枢 主Agent通道',
      coze_configured: !!(process.env.COZE_PAT_TOKEN && process.env.COZE_BOT_ID),
      timestamp: new Date().toISOString()
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: '仅支持POST' });
  }

  // 鉴权
  if (!verifyAdmin(req)) {
    return res.status(403).json({ error: '管理员鉴权失败' });
  }

  try {
    const { query, message, conversationId, userId } = req.body || {};
    const q = query || message;
    
    if (!q) {
      return res.status(400).json({ error: '缺少 query/message 参数' });
    }

    const result = await callCozeBot(q, conversationId, userId);

    if (result.error) {
      return res.status(502).json({
        success: false,
        error: result.error,
        conversationId: result.conversationId || null,
        gateway: '山海云枢'
      });
    }

    return res.status(200).json({
      success: true,
      reply: result.reply,
      conversationId: result.conversationId,
      role: result.role,
      gateway: '山海云枢 主Agent通道',
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('[Coze代理错误]', err);
    return res.status(500).json({ error: '服务器内部错误', detail: err.message });
  }
}
