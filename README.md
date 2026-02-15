# ⚡ 快速报价系统 (Quick Quote System) v5

> 基于 **Google Gemini AI** 与 **Supabase** 构建的智能硬件配置报价管理平台。采用原生 TypeScript + State-Driven UI 架构，无需庞大的前端框架即可实现高性能交互。

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)
![Google Gemini](https://img.shields.io/badge/Google%20Gemini-8E75B2?style=flat-square&logo=googlebard&logoColor=white)

## 📖 项目简介

**快速报价系统** 专为硬件销售、IT 集成商设计。它解决了传统报价过程中“查找型号繁琐”、“计算易出错”、“格式调整麻烦”的痛点。

核心亮点在于集成了 **Generative AI**：销售人员只需粘贴客户的自然语言需求（或微信聊天记录中的配置单），系统即可自动解析、匹配库存、生成规范的报价单。

## ✨ 核心功能

### 🤖 AI 智能辅助

*   **自然语言配置解析**：支持解析 `"4060主机 * 5 | i5-13400 / 32G"` 等非结构化文本，自动拆分型号与数量。
*   **智能模糊匹配**：基于分词与评分算法，将用户输入的口语化名称映射到标准库存型号。
*   **预算推荐**：基于 Gemini API，根据用户的场景描述（如“做深度学习”）或预算范围，自动生成配置方案。

### 💼 业务逻辑

*   **动态算价引擎**：实时计算单机成本、总价，支持修改全局数量。
*   **利润与折扣控制**：支持设置“利润点位”（Markup）和“阶梯折扣”（Tiered Discounts）。
*   **Excel 导出**：一键生成格式完美的 `.xlsx` 报价单。
*   **多角色权限**：
    *   **Sales**: 仅能报价，无法查看底价。
    *   **Manager**: 可调整库存和基础价格。
    *   **Admin**: 用户管理、系统日志、敏感数据操作。

### 🎨 Eco-Modern UI 设计系统

*   **视觉风格**：以绿色（增长/生态）为主色调，配合 Slate 灰阶字体。
*   **Glassmorphism**：顶部导航与底部工具栏采用磨砂玻璃效果，提升现代感。
*   **交互体验**：全响应式布局，卡片式设计，支持移动端操作。

## 🏗️ 技术架构

本项目摒弃了 React/Vue 等重型框架，采用了 **Vanilla TypeScript + State-Driven Rendering** 模式，代码极其轻量且易于维护。

### 目录结构

```text
├── index.html          # 入口文件 (包含 CSS 变量定义)
├── index.tsx           # 启动脚本
├── logic/              # 业务逻辑层 (Controller)
│   ├── appController.ts    # 全局初始化、数据加载
│   ├── quote.ts            # 报价核心逻辑、AI 解析算法
│   ├── login.ts            # 认证逻辑
│   ├── admin.ts            # 后台管理逻辑
│   └── ...
├── state.ts            # 全局状态管理 (Single Source of Truth)
├── ui.ts               # 视图层 (View)，基于 State 渲染 HTML 字符串
├── calculations.ts     # 纯函数计算逻辑
├── types.ts            # TypeScript 类型定义
└── config.ts           # 配置文件 (需自行创建)
```

### 核心逻辑说明

1. **状态驱动 (State-Driven)**:
   所有的应用状态存储在 state.ts 中。任何操作（点击、输入）仅修改 state，然后调用 renderApp() 重新绘制界面。
2. **AI 匹配算法 (logic/quote.ts)**:
   - **Tokenization**: 将输入字符串分词。
   - **Scoring**: 计算输入词与数据库型号的重合度。
   - **Threshold**: 设定 0.4 的匹配阈值，并在精确匹配时给予额外加分。

## 🚀 快速开始

### 1. 环境准备

确保本地已安装 Node.js (v18+) 和 npm。

### 2. 安装依赖

<>Bash

```
npm install
```

### 3. 配置环境变量

在项目根目录创建 config.ts 文件（请参考 config.example.ts，**不要将真实 Key 提交到 GitHub**）：

codeTypeScript

```
// config.ts
export const SUPABASE_URL = 'YOUR_SUPABASE_URL';
export const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
export const CONFIG_ROWS = ['主机', 'CPU', '内存', '硬盘1', '硬盘2', '显卡', '电源', '显示器'];
```



此外，你需要配置 Gemini API Key（通常通过环境变量注入或在构建时替换，本项目示例中使用 process.env.API_KEY）。

### 4. 启动开发服务器

codeBash

```
npm run dev
```

## 🗄️ 数据库设计 (Supabase)

项目依赖以下 PostgreSQL 表结构：















| 表名            | 描述         | 关键字段                                         |
| --------------- | ------------ | ------------------------------------------------ |
| quote_items     | 配件库存表   | category, model, price, compatible_hosts         |
| profiles        | 用户资料表   | id (FK), role (admin/manager/sales), is_approved |
| quote_discounts | 阶梯折扣规则 | threshold (数量阈值), rate (折扣率)              |
| quote_markups   | 利润点位     | alias, value (百分比)                            |
| login_logs      | 安全日志     | user_id, login_at                                |

> **安全提示**：本项目使用了 Supabase RLS (Row Level Security)。请确保在 Supabase 后台配置了正确的 Policy，例如：只有 Admin 角色可以 INSERT/UPDATE quote_items 表。

## 🎨 CSS 设计系统 (Eco-Modern)

项目在 index.html 中定义了一套完整的 CSS 变量系统，易于移植：

codeCSS

```
:root {
    /* 品牌色 */
    --primary: #33c758;
    
    /* 界面层级 */
    --bg-body: #F5F7FA;
    --bg-surface: #FFFFFF;
    
    /* 阴影系统 */
    --shadow-card: 0 4px 20px rgba(0, 0, 0, 0.03);
    --shadow-float: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    
    /* 圆角 */
    --radius-lg: 1rem;
}
```

## 🔒 安全说明

- **API Keys**: 请勿将 config.ts 或包含 API Key 的 .env 文件提交到版本控制系统。
- **权限控制**: 前端仅仅是视图层，真正的数据安全依赖于 Supabase 的 RLS 策略。请务必在数据库层面确保存储过程和策略的正确性。

## 📄 License

MIT License.

codeCode

```
### 修改建议

1.  **关于 `config.ts`**: 我在文档里强调了你需要创建一个 `config.ts`。在提交代码到 GitHub 之前，请务必把你的真实 `config.ts` 添加到 `.gitignore` 中，并提交一个 `config.example.ts`（里面填假的 URL 和 Key），这样别人 clone 下来知道怎么配，但不会泄露你的密钥。
2.  **关于截图**: 如果方便的话，你可以截几张系统的图（比如报价页面、AI 推荐弹窗、后台管理），放在项目的 `assets` 或 `docs` 文件夹里，然后在 README 的“核心功能”部分引用图片，这样吸引力会提升 10 倍！
```

