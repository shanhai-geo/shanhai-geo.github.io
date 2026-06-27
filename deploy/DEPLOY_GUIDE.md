# 山海云枢 API 网关 - 部署指南

## 架构概览

```
前端(GitHub Pages) → API网关(国内Serverless) → LLM引擎(国内API)
                         ↓
                    审计日志 + 限流 + 脱敏
```

所有数据链路均在境内完成，不涉及数据出境。

## 方案一：阿里云函数计算（推荐）

### 前置条件
- 阿里云账号，开通函数计算FC
- 安装 [Serverless Devs](https://www.serverless-devs.com/)：`npm i @serverless-devs/s -g`

### 部署步骤
```bash
cd deploy/aliyun-fc
s config add --AccessKeyID xxx --AccessKeySecret xxx -a default
cp ../../.env.example ../../.env
# 编辑 .env 填入实际密钥
export $(cat ../../.env | grep -v '^#' | xargs)
s deploy
```

### 获取Endpoint
部署成功后获得公网访问地址，格式如：
`https://shanhai-api.cn-hangzhou.fcapp.run`

---

## 方案二：腾讯云云函数

### 前置条件
- 腾讯云账号，开通云函数SCF
- 安装 Serverless Framework：`npm i -g serverless`

### 部署步骤
```bash
cd deploy/tencent-scf
export $(cat ../../.env | grep -v '^#' | xargs)
serverless deploy
```

---

## 方案三：Docker 自建（最灵活）

### 部署步骤
```bash
cd deploy/docker
export $(cat ../../.env | grep -v '^#' | xargs)
docker-compose up -d
```

访问 `http://your-server:9000/api/status` 验证。

### 配合Nginx反向代理
```nginx
server {
    listen 443 ssl;
    server_name api.shanhai-geo.com;
    
    location /api/ {
        proxy_pass http://127.0.0.1:9000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 方案四：Vercel（海外备用，非敏感查询）

已有配置，push到GitHub自动部署。适合非敏感场景备用。

---

## 前端对接

部署成功后，将前端页面的API地址替换：

```javascript
// 修改前（直连第三方API，密钥暴露）
const API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

// 修改后（走自有网关，密钥安全）
const API_URL = 'https://your-api-domain.com/api/chat';
```

需要修改的文件：
- `shanhai-geo/index.html` - GEO主站AI对话
- `shanhai-admin/index.html` - 管理后台AI功能
- `shanhai-ai/index.html` - AI客服页

## 安全清单

- [x] 零硬编码：所有密钥走环境变量
- [x] 输入过滤：SQL注入/XSS/模板注入检测
- [x] 输出脱敏：身份证号/手机号/银行卡号自动遮盖
- [x] 审计日志：全操作脱敏记录
- [x] 限流保护：30次/分钟/IP
- [x] CORS锁定：仅允许自有域名
- [x] 安全响应头：X-Content-Type-Options / X-Frame-Options
- [x] 请求体限制：1MB上限
- [x] 数据驻留：境内存储，不出境
- [x] 优雅关闭：SIGTERM处理
