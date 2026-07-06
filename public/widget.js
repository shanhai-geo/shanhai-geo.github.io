/*!
 * 山海智能AI客服 Widget
 * 一行代码嵌入任何网站
 * <script src="https://shanhai-geo.github.io/widget.js"><\/script>
 */
(function(){
"use strict";

// ===== Config =====
var CHAT_URL = (function(){
  var s = document.currentScript;
  if(s && s.getAttribute('data-src')) return s.getAttribute('data-src');
  // Auto-detect from widget.js location
  var src = s ? s.src : '';
  return src.replace(/widget\.js(\?.*)?$/, 'chat.html');
})();

var BRAND = '山海智能';
var BRAND_ICON = '🏔';

// ===== Styles =====
var css = [
  '#shanhai-widget *{margin:0;padding:0;box-sizing:border-box}',
  '#shanhai-widget{position:fixed;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}',

  // FAB Button
  '#shanhai-fab{position:fixed;bottom:24px;right:24px;width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#ffd700,#ff8c00);color:#000;font-size:28px;box-shadow:0 4px 24px rgba(255,215,0,.35),0 0 0 0 rgba(255,215,0,.4);transition:all .3s cubic-bezier(.16,1,.3,1);animation:fabPulse 3s infinite}',
  '#shanhai-fab:hover{transform:scale(1.08);box-shadow:0 6px 32px rgba(255,215,0,.45)}',
  '#shanhai-fab:active{transform:scale(.95)}',
  '#shanhai-fab.open{animation:none;background:rgba(40,40,60,.9);color:#fff;box-shadow:0 4px 20px rgba(0,0,0,.4)}',
  '@keyframes fabPulse{0%,100%{box-shadow:0 4px 24px rgba(255,215,0,.35),0 0 0 0 rgba(255,215,0,.4)}50%{box-shadow:0 4px 24px rgba(255,215,0,.35),0 0 0 12px rgba(255,215,0,0)}}',

  // Tooltip
  '#shanhai-tip{position:fixed;bottom:92px;right:20px;background:rgba(18,18,36,.92);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);color:#e8e8f0;padding:10px 16px;border-radius:12px 12px 4px 12px;font-size:13px;line-height:1.5;max-width:220px;border:1px solid rgba(255,215,0,.15);box-shadow:0 8px 32px rgba(0,0,0,.3);animation:tipIn .5s cubic-bezier(.16,1,.3,1) both;animation-delay:2s;pointer-events:none;opacity:0;transition:opacity .3s}',
  '#shanhai-tip.show{opacity:1}',
  '@keyframes tipIn{from{opacity:0;transform:translateY(10px) scale(.9)}to{opacity:1;transform:translateY(0) scale(1)}}',

  // Chat Window
  '#shanhai-panel{position:fixed;bottom:96px;right:24px;width:400px;height:600px;max-height:calc(100vh - 120px);border-radius:20px;overflow:hidden;box-shadow:0 12px 60px rgba(0,0,0,.5),0 0 40px rgba(255,215,0,.06);border:1px solid rgba(255,215,0,.1);transform:scale(.8) translateY(20px);opacity:0;pointer-events:none;transition:all .35s cubic-bezier(.16,1,.3,1);background:#06060e}',
  '#shanhai-panel.open{transform:scale(1) translateY(0);opacity:1;pointer-events:auto}',
  '#shanhai-panel iframe{width:100%;height:100%;border:none;display:block}',

  // Mobile
  '@media(max-width:480px){',
    '#shanhai-fab{bottom:16px;right:16px;width:54px;height:54px;font-size:24px}',
    '#shanhai-panel{bottom:0;right:0;width:100%;height:100%;max-height:100vh;border-radius:0;border:none}',
    '#shanhai-tip{bottom:78px;right:12px;max-width:180px;font-size:12px}',
  '}'
].join('\n');

var style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

// ===== DOM =====
var wrap = document.createElement('div');
wrap.id = 'shanhai-widget';
document.body.appendChild(wrap);

// Tooltip
var tip = document.createElement('div');
tip.id = 'shanhai-tip';
tip.innerHTML = '💬 有问题？点击咨询<br><span style="color:#ffd700;font-size:11px">7×24小时AI智能客服</span>';
wrap.appendChild(tip);

// FAB
var fab = document.createElement('button');
fab.id = 'shanhai-fab';
fab.innerHTML = BRAND_ICON;
fab.setAttribute('aria-label', 'AI客服');
wrap.appendChild(fab);

// Panel
var panel = document.createElement('div');
panel.id = 'shanhai-panel';
var iframe = document.createElement('iframe');
iframe.setAttribute('allow', 'clipboard-write');
iframe.setAttribute('loading', 'lazy');
panel.appendChild(iframe);
wrap.appendChild(panel);

// ===== State =====
var isOpen = false;
var loaded = false;

function openPanel(){
  isOpen = true;
  fab.classList.add('open');
  fab.innerHTML = '✕';
  panel.classList.add('open');
  tip.classList.remove('show');
  if(!loaded){
    iframe.src = CHAT_URL;
    loaded = true;
  }
}

function closePanel(){
  isOpen = false;
  fab.classList.remove('open');
  fab.innerHTML = BRAND_ICON;
  panel.classList.remove('open');
}

fab.addEventListener('click', function(){
  isOpen ? closePanel() : openPanel();
});

// Show tooltip after delay
setTimeout(function(){
  tip.classList.add('show');
  // Auto-hide after 8s
  setTimeout(function(){ tip.classList.remove('show'); }, 8000);
}, 2500);

// Close on Escape
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && isOpen) closePanel();
});

// Close when clicking outside (desktop)
document.addEventListener('click', function(e){
  if(!isOpen) return;
  if(wrap.contains(e.target)) return;
  closePanel();
});

// Expose API for external control
window.ShanhaiWidget = {
  open: openPanel,
  close: closePanel,
  toggle: function(){ isOpen ? closePanel() : openPanel(); }
};

})();
