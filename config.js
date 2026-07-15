// 山海智能统一配置中心 config.js v1.0
// 备案切换时只需修改 DOMAIN 和 API_DOMAIN 两个值
(function(){
  window.SHC = {
    // ===== 域名配置（切换时只改这两行）=====
    DOMAIN: "shanhai-geo.top",
    API_DOMAIN: "api.shanhai-geo.top",
    
    // ===== 自动派生（无需手动改）=====
    get BASE() { return "https://" + this.API_DOMAIN },
    get PAY() { return this.BASE + "/pay.html" },
    get CHAT() { return this.BASE + "/chat.html" },
    get LANDING() { return this.BASE + "/landing.html" },
    get LLMS() { return this.BASE + "/llms.txt" },
    
    // ===== 支付配置 =====
    PAY_QR: "VSDB201244333",
    PAY_URL: "https://lhsd.leshuazf.com/pay/qrc.do?qr=VSDB201244333",
    
    // ===== 价格 =====
    PRICE: "298",
    
    // ===== 预留接口 =====
    DOMAINS: {
      primary: "shanhai-geo.top",
      backup: "",
      cn: "",
      com: ""
    },
    
    // ===== Surge站矩阵 =====
    SURGE: {
      geo: "shanhai-geo.surge.sh",
      shop: "shanhai-shop.surge.sh",
      ai: "shanhai-ai.surge.sh",
      admin: "shanhai-admin.surge.sh",
      talk: "shanhai-talk.surge.sh",
      seo: "shanhai-seo.surge.sh",
      dev: "shanhai-dev.surge.sh",
      jiaoyu: "shanhai-jiaoyu.surge.sh",
      dianshang: "shanhai-dianshang.surge.sh"
    }
  };
})();
