// 山海智能 · 业务自动化引擎
// 部署在Cloudflare Workers，零成本运行

addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.pathname === '/api/order') event.respondWith(handleOrder(event.request));
  else if (url.pathname === '/api/stats') event.respondWith(handleStats());
  else if (url.pathname === '/api/health') event.respondWith(handleHealth());
  else event.respondWith(new Response(JSON.stringify({
    name: '山海智能业务引擎', status: 'running',
    endpoints: ['/api/order', '/api/stats', '/api/health']
  }), { headers: { 'Content-Type': 'application/json;charset=UTF-8' }}));
});

async function handleOrder(request) {
  if (request.method !== 'POST') return new Response(JSON.stringify({error:'仅支持POST'}),{status:405});
  const body = await request.json();
  const { phone, orderId, confirmCode } = body;
  if (!phone || !orderId || !confirmCode) return new Response(JSON.stringify({error:'缺少必填参数'}),{status:400});
  if (!confirmCode.startsWith('SH') || confirmCode.length !== 10) return new Response(JSON.stringify({error:'确认码无效'}),{status:400});
  
  const order = { phone, orderId, confirmCode, status:'pending', key:'', amount:298, createdAt:new Date().toISOString() };
  await ORDERS.put('order:'+confirmCode, JSON.stringify(order));
  return new Response(JSON.stringify({success:true, message:'订单已提交待核实', confirmCode}),{headers:{'Content-Type':'application/json;charset=UTF-8'}});
}

async function handleStats() {
  const list = await ORDERS.list();
  let pending=0, delivered=0;
  for (const key of list.keys) {
    const o = JSON.parse(await ORDERS.get(key.name));
    if (o.status==='pending') pending++;
    if (o.status==='delivered') delivered++;
  }
  return new Response(JSON.stringify({total:list.keys.length, pending, delivered, revenue:delivered*298}),{headers:{'Content-Type':'application/json;charset=UTF-8'}});
}

async function handleHealth() {
  return new Response(JSON.stringify({status:'healthy', time:new Date().toISOString()}),{headers:{'Content-Type':'application/json;charset=UTF-8'}});
}
