# 25. API 接口规范

## 25.1 接口设计原则

### 25.1.1 RESTful 设计

**资源命名**:

- 使用名词表示资源
- 复数形式表示集合
- 层级关系使用嵌套路径

**HTTP 方法**:

- `GET`: 查询资源
- `POST`: 创建资源
- `PUT/PATCH`: 更新资源
- `DELETE`: 删除资源

**状态码**:

- `200 OK`: 成功
- `201 Created`: 创建成功
- `400 Bad Request`: 请求错误
- `401 Unauthorized`: 未授权
- `403 Forbidden`: 禁止访问
- `404 Not Found`: 资源不存在
- `500 Internal Server Error`: 服务器错误

### 25.1.2 数据格式

**请求格式**:

```json
{
  "code": 200,
  "status": 200,
  "message": "success",
  "error": false,
  "data": {
    // 响应数据
  }
}
```

**分页格式**:

```json
{
  "code": 200,
  "data": {
    "items": [...],
    "total": 100,
    "page": 1,
    "pageSize": 20,
    "totalPages": 5
  }
}
```

## 25.2 用户认证接口

### 25.2.1 用户注册

**接口**: `POST /auth/register`

**请求**:

```json
{
  "username": "string",
  "password": "string"
}
```

**响应**:

```json
{
  "code": 200,
  "data": {
    "accessToken": "string",
    "user": {
      "id": "number",
      "username": "string"
    }
  }
}
```

### 25.2.2 用户登录

**接口**: `POST /auth/login`

**请求**:

```json
{
  "username": "string",
  "password": "string"
}
```

**响应**:

```json
{
  "code": 200,
  "data": {
    "accessToken": "string",
    "user": {
      "id": "number",
      "username": "string"
    }
  }
}
```

### 25.2.3 获取用户信息

**接口**: `GET /users/self/profile`

**认证**: Bearer Token

**响应**:

```json
{
  "code": 200,
  "data": {
    "id": 1,
    "username": "user123",
    "email": "user@example.com",
    "createdAt": "2023-01-01T00:00:00Z"
  }
}
```

## 25.3 图纸管理接口

### 25.3.1 获取图纸列表

**接口**: `GET /files`

**参数**:

- `page`: 页码 (默认 1)
- `pageSize`: 每页数量 (默认 20)
- `search`: 搜索关键词

**响应**:

```json
{
  "code": 200,
  "data": {
    "items": [
      {
        "id": 1,
        "title": "My Design",
        "createdAt": "2023-01-01T00:00:00Z",
        "updatedAt": "2023-01-02T00:00:00Z"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20
  }
}
```

### 25.3.2 创建图纸

**接口**: `POST /files/create`

**请求**:

```json
{
  "title": "New Design"
}
```

**响应**:

```json
{
  "code": 201,
  "data": {
    "id": 1,
    "title": "New Design",
    "createdAt": "2023-01-01T00:00:00Z",
    "updatedAt": "2023-01-01T00:00:00Z"
  }
}
```

### 25.3.3 获取图纸详情

**接口**: `GET /files/{id}`

**响应**:

```json
{
  "code": 200,
  "data": {
    "id": 1,
    "title": "My Design",
    "data": {
      "appVersion": "suika-editor_0.0.2",
      "paperId": "paper_123",
      "data": [...]
    },
    "createdAt": "2023-01-01T00:00:00Z",
    "updatedAt": "2023-01-02T00:00:00Z"
  }
}
```

### 25.3.4 更新图纸

**接口**: `PATCH /files/{id}`

**请求**:

```json
{
  "title": "Updated Design"
}
```

**响应**:

```json
{
  "code": 200,
  "data": {
    "id": 1,
    "title": "Updated Design",
    "updatedAt": "2023-01-02T00:00:00Z"
  }
}
```

### 25.3.5 删除图纸

**接口**: `DELETE /files`

**请求**:

```json
{
  "ids": [1, 2, 3]
}
```

**响应**:

```json
{
  "code": 200,
  "data": {
    "deletedCount": 3
  }
}
```

## 25.4 协作接口

### 25.4.1 WebSocket 连接

**地址**: `ws://{host}/join/room/`

**认证**: URL 参数或 Header

```javascript
const ws = new WebSocket('ws://localhost:5356/join/room/?token=xxx&roomId=paper_123');
```

### 25.4.2 协作协议

**连接建立**:

```json
{
  "type": "join",
  "roomId": "paper_123",
  "userId": 1,
  "username": "user123"
}
```

**操作同步**:

```json
{
  "type": "sync",
  "operations": [
    {
      "type": "add",
      "id": "rect_123",
      "data": { /* 图形数据 */ }
    }
  ]
}
```

**用户状态**:

```json
{
  "type": "presence",
  "users": [
    {
      "id": 1,
      "username": "user123",
      "color": "#ff0000",
      "cursor": { "x": 100, "y": 200 }
    }
  ]
}
```

## 25.5 文件上传接口

### 25.5.1 图片上传

**接口**: `POST /upload/image`

**Content-Type**: `multipart/form-data`

**参数**:

- `file`: 图片文件
- `maxSize`: 最大文件大小 (默认 10MB)

**响应**:

```json
{
  "code": 200,
  "data": {
    "url": "https://example.com/uploads/image.jpg",
    "width": 1920,
    "height": 1080,
    "size": 245760
  }
}
```

### 25.5.2 图纸导入

**接口**: `POST /import/paper`

**支持格式**:

- JSON (Suika 格式)
- SVG (矢量格式)
- PNG/JPG (位图导入)

**响应**:

```json
{
  "code": 200,
  "data": {
    "paperId": "imported_paper_123",
    "graphicsCount": 25,
    "warnings": ["Some styles were not preserved"]
  }
}
```

## 25.6 设置同步接口

### 25.6.1 获取用户设置

**接口**: `GET /settings`

**响应**:

```json
{
  "code": 200,
  "data": {
    "theme": "dark",
    "language": "zh",
    "shortcuts": { /* 快捷键设置 */ },
    "preferences": { /* 其他偏好 */ }
  }
}
```

### 25.6.2 更新用户设置

**接口**: `PATCH /settings`

**请求**:

```json
{
  "theme": "light",
  "language": "en"
}
```

**响应**:

```json
{
  "code": 200,
  "data": {
    "updated": true
  }
}
```

## 25.7 模板接口

### 25.7.1 获取模板列表

**接口**: `GET /templates`

**参数**:

- `category`: 模板分类
- `search`: 搜索关键词

**响应**:

```json
{
  "code": 200,
  "data": {
    "items": [
      {
        "id": "template_1",
        "name": "Blank Document",
        "category": "basic",
        "thumbnail": "url",
        "data": { /* 模板数据 */ }
      }
    ]
  }
}
```

### 25.7.2 创建模板

**接口**: `POST /templates`

**请求**:

```json
{
  "name": "My Template",
  "category": "custom",
  "data": { /* 图纸数据 */ }
}
```

## 25.8 导出接口

### 25.8.1 导出 PNG

**接口**: `POST /export/png`

**请求**:

```json
{
  "paperId": "paper_123",
  "width": 1920,
  "height": 1080,
  "scale": 2
}
```

**响应**:

```json
{
  "code": 200,
  "data": {
    "url": "https://example.com/exports/paper_123.png",
    "expiresAt": "2023-01-01T01:00:00Z"
  }
}
```

### 25.8.2 导出 SVG

**接口**: `POST /export/svg`

**请求**:

```json
{
  "paperId": "paper_123",
  "includeGrid": false,
  "includeRuler": false
}
```

**响应**:

```json
{
  "code": 200,
  "data": {
    "svg": "<svg>...</svg>",
    "url": "https://example.com/exports/paper_123.svg"
  }
}
```

## 25.9 协作统计接口

### 25.9.1 获取协作统计

**接口**: `GET /stats/collaboration/{paperId}`

**响应**:

```json
{
  "code": 200,
  "data": {
    "totalUsers": 5,
    "activeUsers": 3,
    "totalEdits": 1247,
    "sessionDuration": 3600,
    "userStats": [
      {
        "userId": 1,
        "username": "user1",
        "edits": 234,
        "timeSpent": 1800
      }
    ]
  }
}
```

## 25.10 错误处理

### 25.10.1 错误响应格式

```json
{
  "code": 400,
  "status": 400,
  "message": "Validation failed",
  "error": true,
  "details": {
    "field": "username",
    "reason": "required"
  }
}
```

### 25.10.2 常见错误码

**客户端错误 (4xx)**:

- `400`: 请求参数错误
- `401`: 未认证
- `403`: 权限不足
- `404`: 资源不存在
- `409`: 资源冲突
- `413`: 请求实体过大
- `429`: 请求过于频繁

**服务器错误 (5xx)**:

- `500`: 服务器内部错误
- `502`: 网关错误
- `503`: 服务不可用
- `504`: 网关超时

## 25.11 限流和缓存

### 25.11.1 限流策略

**请求限制**:

- API 请求: 1000 次/分钟
- 文件上传: 10 个/分钟
- 协作操作: 100 次/秒

**限流响应**:

```json
{
  "code": 429,
  "message": "Too many requests",
  "retryAfter": 60
}
```

### 25.11.2 缓存策略

**HTTP 缓存**:

```http
Cache-Control: max-age=300
ETag: "abc123"
```

**应用缓存**:

- 图纸数据: 5分钟
- 用户信息: 1小时
- 模板列表: 1天

## 25.12 版本控制

### 25.12.1 API 版本

**版本标识**:

- URL 路径: `/api/v1/files`
- Header: `X-API-Version: v1`
- Accept Header: `application/vnd.suika.v1+json`

### 25.12.2 向后兼容

**版本迁移**:

- 新版本发布时保持旧版本可用
- 逐步迁移用户
- 废弃通知

## 25.13 监控和日志

### 25.13.1 请求日志

**记录内容**:

- 请求时间
- 用户 ID
- 接口路径
- 响应时间
- 状态码
- 错误信息

### 25.13.2 性能监控

**监控指标**:

- API 响应时间
- 错误率
- 并发连接数
- 资源使用率

### 25.13.3 业务监控

**业务指标**:

- 用户活跃度
- 图纸创建数
- 协作会话数
- 导出次数

## 25.14 安全考虑

### 25.14.1 认证和授权

**JWT Token**:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**权限控制**:

- 用户级别权限
- 资源级别权限
- 操作级别权限

### 25.14.2 数据验证

**输入验证**:

- 参数类型检查
- 长度限制
- 格式验证
- XSS 防护

**输出过滤**:

- 数据脱敏
- 敏感信息过滤

### 25.14.3 HTTPS

**强制 HTTPS**:

- 所有 API 必须使用 HTTPS
- HTTP 重定向到 HTTPS
- HSTS 头

### 25.14.4 CORS

**跨域配置**:

```javascript
app.use(cors({
  origin: ['https://suika.example.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
```

## 25.15 API 文档

### 25.15.1 OpenAPI 规范

**API 文档**:

```yaml
openapi: 3.0.3
info:
  title: Suika API
  version: 1.0.0
  description: Suika Graphics Editor API

paths:
  /auth/login:
    post:
      summary: User login
      # ... 详细定义
```

### 25.15.2 在线文档

**Swagger UI**: `/api/docs`

**Postman 集合**: 下载链接

**SDK 生成**: TypeScript, JavaScript SDK

