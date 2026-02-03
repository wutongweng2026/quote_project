

// FIX: The reference to "vite/client" was removed as it was causing a "Cannot find type definition file" error.
// The necessary types for import.meta.env are defined manually below as a workaround for what is likely a
// project configuration issue (e.g., in tsconfig.json).
// FIX: Wrapped `ImportMeta` in `declare global` to ensure the type augmentation applies globally from within this module (.tsx file).
declare global {
  interface ImportMeta {
    readonly env: {
      readonly VITE_SUPABASE_URL: string;
      readonly VITE_SUPABASE_ANON_KEY: string;
    };
  }
}

// --- TYPES ---
interface Profile {
    id: string;
    full_name: string;
    phone: string;
    role: 'admin' | 'user';
    approved: boolean;
}
interface LoginLog {
    id: number;
    email: string;
    timestamp: string;
}
interface PriceDataItem { [model: string]: number; }
interface Prices { [category: string]: PriceDataItem; }
interface TieredDiscount { id: number; threshold: number; rate: number; }
interface PriceData {
    prices: Prices;
    tieredDiscounts: TieredDiscount[];
    lastUpdated?: string | null;
}
interface SelectionItem { model: string; quantity: number; }
interface SelectionState { [category: string]: SelectionItem; }
interface CustomItem { id: number; category: string; model: string; quantity: number; }
interface CustomModalState {
    title: string;
    message: string;
    onConfirm: (() => void) | null;
    confirmText: string;
    cancelText: string;
    showCancel: boolean;
    isDanger: boolean;
}
interface AppState {
    priceData: PriceData;
    isLoggedIn: boolean;
    userEmail: string | null;
    profile: Profile | null;
    view: 'quote' | 'admin' | 'login' | 'pending';
    loginView: 'signIn' | 'signUp';
    adminView: 'prices' | 'users' | 'logs';
    users: Profile[];
    loginLogs: LoginLog[];
    authError: string | null;
    authLoading: boolean;
    selection: SelectionState;
    customItems: CustomItem[];
    newCategory: string;
    specialDiscount: number;
    markupPoints: number;
    adminSearchTerm: string;
    pendingFile: File | null;
    showCustomModal: boolean;
    customModal: CustomModalState;
    appStatus: 'loading' | 'ready' | 'error';
    errorDetails: string | null;
    syncStatus: 'idle' | 'saving' | 'saved' | 'error';
}

// --- SUPABASE CONFIG ---
const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY;


let supabaseClient: any;
declare var supabase: any;


// --- DATA (Embedded) & CONFIG ---
const PRICE_DATA: PriceData = {
  "prices": {
    "内存": { "8G DDR5 5600": 750, "16G DDR5 5600": 1650 },
    "硬盘": { "512G SSD": 600, "1T SSD": 1100, "2T SATA": 800 },
    "显卡": { "T400 4G": 900, "T1000 4G": 2200, "T1000 8G": 2900, "RTX5060 8G": 2700, "RTX4060 8G": 2750, "RTX5060ti 8G": 3200, "RTX5060ti 16G": 5000, "RX6600LE 8G": 1800, "RTX3060": 2300 },
    "显示器": { "21.5-TE22-19": 360, "23.8-T24A-20": 530, "来酷27寸B2737": 460, "慧天V24 23.8": 350 },
    "电源": { "300W": 0, "500W": 200 },
    "主机": { "TSK-C3 I5-13400": 2800, "TSK-C3 I5-14400": 3100, "TSK-C3 I5-14500": 3200, "TSK-C3 I7-13700": 4550, "TSK-C3 I7-14700": 5450, "TSK-C3 I9-14900": 5550, "TSK-C4 Ultra5-235": 3300, "TSK-C4 Ultra7-265": 4550 }
  },
  "tieredDiscounts": [
    { "id": 1721360183321, "threshold": 10, "rate": 0.99 }
  ]
};

const CONFIG_ROWS = ['主机', '内存', '硬盘1', '硬盘2', '显卡', '电源', '显示器'];
declare var XLSX: any;

// --- STATE MANAGEMENT ---
const getInitialSelection = (): SelectionState => ({
    '主机': { model: '', quantity: 1 },
    '内存': { model: '', quantity: 1 },
    '硬盘1': { model: '', quantity: 1 },
    '硬盘2': { model: '', quantity: 0 },
    '显卡': { model: '', quantity: 1 },
    '电源': { model: '', quantity: 1 },
    '显示器': { model: '', quantity: 1 }
});

const state: AppState = {
    priceData: { prices: {}, tieredDiscounts: [] },
    isLoggedIn: false,
    userEmail: null,
    profile: null,
    view: 'login',
    loginView: 'signIn',
    adminView: 'prices',
    users: [],
    loginLogs: [],
    authError: null,
    authLoading: false,
    selection: getInitialSelection(),
    customItems: [],
    newCategory: '',
    specialDiscount: 0,
    markupPoints: 15,
    adminSearchTerm: '',
    pendingFile: null,
    showCustomModal: false,
    customModal: {
        title: '',
        message: '',
        onConfirm: null,
        confirmText: '确定',
        cancelText: '取消',
        showCancel: false,
        isDanger: false,
    },
    appStatus: 'loading',
    errorDetails: null,
    syncStatus: 'idle',
};

function debounce(func: Function, wait: number) {
  let timeout: number;
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

const saveDataToSupabase = debounce(async (dataToSave: PriceData) => {
    if (!supabaseClient) return;
    
    state.syncStatus = 'saving';
    render();

    const { error } = await supabaseClient
        .from('quote_data')
        .update({ data: dataToSave, updated_at: new Date().toISOString() })
        .eq('id', 1);

    if (error) {
        state.syncStatus = 'error';
    } else {
        state.syncStatus = 'saved';
    }
    render();

    if (state.syncStatus === 'saved') {
        setTimeout(() => {
            if (state.syncStatus === 'saved') {
                state.syncStatus = 'idle';
                render();
            }
        }, 2500);
    }
}, 1500);

function updateTimestamp() {
    if (state.priceData) {
        state.priceData.lastUpdated = new Date().toISOString();
    }
    saveDataToSupabase(state.priceData);
}

// --- DOM SELECTORS ---
const $ = (selector: string) => document.querySelector(selector);
const appContainer = $('#app')!;

// --- RENDER FUNCTIONS ---
function render() {
    if (state.appStatus === 'loading') {
        appContainer.innerHTML = renderLoadingScreen();
        return;
    }
    if (state.appStatus === 'error') {
        appContainer.innerHTML = renderErrorScreen(state.errorDetails);
        return;
    }

    let html = '';
    if (state.view === 'login') {
        html = renderLoginView();
    } else if (state.view === 'pending') {
        html = renderPendingApprovalView();
    } else if (state.view === 'quote') {
        html = renderQuoteTool();
    } else if (state.view === 'admin') {
        html = renderAdminPanel();
    }

    if (state.showCustomModal) {
        html += renderCustomModal();
    }

    appContainer.innerHTML = html;
}

function renderLoadingScreen() {
    return `<div class="app-status-container"><div class="loading-spinner"></div></div>`;
}

function renderErrorScreen(message: string | null) {
    const displayMessage = message || "发生未知错误。";
    return `
        <div class="app-status-container">
            <h2>加载失败</h2>
            <div class="error-details">${displayMessage}</div>
        </div>
    `;
}

function renderLoginView() {
    const isSignIn = state.loginView === 'signIn';
    return `
        <div class="auth-container">
            <div class="auth-box">
                <h1>${isSignIn ? '登录报价系统' : '注册新账户'}</h1>
                <form id="auth-form">
                    ${!isSignIn ? `
                        <div class="auth-input-group">
                            <label for="full_name">真实姓名</label>
                            <input type="text" id="full_name" required autocomplete="name" />
                        </div>
                        <div class="auth-input-group">
                            <label for="phone">手机号</label>
                            <input type="tel" id="phone" required autocomplete="tel" />
                        </div>
                    ` : ''}
                    <div class="auth-input-group">
                        <label for="email">邮箱</label>
                        <input type="email" id="email" required autocomplete="email" />
                    </div>
                    <div class="auth-input-group">
                        <label for="password">密码</label>
                        <input type="password" id="password" required autocomplete="${isSignIn ? 'current-password' : 'new-password'}" />
                    </div>
                    ${state.authError ? `<div class="auth-error">${state.authError}</div>` : ''}
                    <button type="submit" class="auth-button" ${state.authLoading ? 'disabled' : ''}>
                        ${state.authLoading ? '<span class="spinner"></span>' : (isSignIn ? '登 录' : '注 册')}
                    </button>
                </form>
                <div class="auth-toggle">
                    ${isSignIn ? '还没有账户?' : '已有账户?'}
                    <a href="#" id="auth-toggle-link">${isSignIn ? '立即注册' : '立即登录'}</a>
                </div>
            </div>
        </div>
    `;
}

function renderPendingApprovalView() {
    return `
        <div class="app-status-container">
            <h2>等待审批</h2>
            <p>您的账户 (${state.userEmail}) 已注册成功，正在等待管理员审批。</p>
            <p>审批通过后，您将可以访问报价系统。</p>
            <button class="admin-button" id="logout-btn" style="background-color: var(--secondary-color); color: white; margin-top: 1rem;">退出登录</button>
        </div>
    `;
}

function renderCustomModal() {
    if (!state.showCustomModal) return '';
    const { title, message, confirmText, cancelText, showCancel, isDanger } = state.customModal;
    return `
        <div class="modal-overlay" id="custom-modal-overlay">
            <div class="modal-content">
                <h2>${title}</h2>
                <p>${message}</p>
                <div class="modal-buttons">
                    ${showCancel ? `<button class="modal-cancel-btn" id="custom-modal-cancel-btn">${cancelText}</button>` : ''}
                    <button class="modal-confirm-btn ${isDanger ? 'danger' : ''}" id="custom-modal-confirm-btn">${confirmText}</button>
                </div>
            </div>
        </div>
    `;
}

function renderQuoteTool() {
    const totals = calculateTotals();
    const finalConfigText = getFinalConfigText();
    return `
        <div class="quoteContainer">
            <header class="quoteHeader">
                <h1>产品报价系统 <span>v1.01 - 龙盛科技</span></h1>
                <div class="header-actions">
                    <span class="user-email-display">${state.userEmail || ''}</span>
                    ${state.profile?.role === 'admin' ? `<button class="admin-button" id="app-view-toggle-btn">后台管理</button>` : ''}
                    <button class="admin-button" id="logout-btn">登出</button>
                </div>
            </header>

            <main class="quoteBody">
                 <div class="product-matcher-section">
                    <label for="matcher-input">产品匹配 (粘贴配置后点击按钮):</label>
                    <div class="matcher-input-group">
                        <input type="text" id="matcher-input" placeholder="例如: TSK-C3 I5-14500/8G DDR5 *2 / 512G SSD+2T SATA /RTX 5060 8G /500W">
                        <button id="match-config-btn">匹配配置</button>
                    </div>
                </div>

                <table class="config-table">
                    <colgroup>
                        <col style="width: 200px;">
                        <col>
                        <col style="width: 80px;">
                        <col style="width: 60px;">
                    </colgroup>
                    <thead>
                        <tr>
                            <th>配置清单</th>
                            <th>规格型号</th>
                            <th>数量</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${CONFIG_ROWS.map(category => renderConfigRow(category)).join('')}
                        ${state.customItems.map(item => renderCustomItemRow(item)).join('')}
                        ${renderAddCategoryRow()}
                    </tbody>
                </table>
                
                <div class="final-config-section">
                    <label>最终配置:</label>
                    <textarea class="final-config-display" readonly>${finalConfigText || '未选择配件'}</textarea>
                </div>

                <div class="controls-grid">
                    <div class="control-group">
                        <label>应用折扣:</label>
                        <div class="discount-display">${totals.appliedDiscountLabel}</div>
                    </div>
                    <div class="control-group">
                         <label for="markup-points-input">点位:</label>
                        <div class="points-input-group">
                           <input type="number" id="markup-points-input" value="${state.markupPoints}" placeholder="例如: 15" />
                           <span>点</span>
                        </div>
                    </div>
                    <div class="control-group">
                        <label for="special-discount-input">特别立减:</label>
                        <input type="number" id="special-discount-input" value="${state.specialDiscount}" placeholder="0" />
                    </div>
                </div>
            </main>

            <footer class="quoteFooter">
                <div class="footer-buttons">
                    <button class="reset-btn" id="reset-btn">重置</button>
                    <button class="generate-btn" id="generate-quote-btn">导出Excel</button>
                </div>
                <div class="final-price-display">
                    <span>最终价格</span>
                    <strong>¥ ${totals.finalPrice.toFixed(2)}</strong>
                </div>
            </footer>
        </div>
    `;
}

function renderConfigRow(category: string) {
    const dataCategory = category.startsWith('硬盘') ? '硬盘' : category;
    const models = state.priceData.prices[dataCategory] || {};
    const currentSelection = state.selection[category];
    return `
        <tr data-category="${category}">
            <td class="config-row-label">${category}</td>
            <td>
                <select class="model-select">
                    <option value="">-- 请选择 --</option>
                    ${Object.keys(models).sort().map(model => `<option value="${model}" ${currentSelection.model === model ? 'selected' : ''}>${model}</option>`).join('')}
                </select>
            </td>
            <td>
                <input type="number" class="quantity-input" min="0" value="${currentSelection.quantity}" />
            </td>
            <td class="config-row-action">
                <button class="remove-item-btn" disabled>-</button>
            </td>
        </tr>
    `;
}

function renderCustomItemRow(item: CustomItem) {
    const models = state.priceData.prices[item.category] || {};
    return `
        <tr data-custom-id="${item.id}">
            <td class="config-row-label">${item.category}</td>
            <td>
                <select class="custom-model-select">
                    <option value="">-- 请选择 --</option>
                    ${Object.keys(models).sort().map(model => `<option value="${model}" ${item.model === model ? 'selected' : ''}>${model}</option>`).join('')}
                </select>
            </td>
            <td>
                <input type="number" class="custom-quantity-input" min="0" value="${item.quantity}" />
            </td>
            <td class="config-row-action">
                <button class="remove-custom-item-btn">-</button>
            </td>
        </tr>
    `;
}

function renderAddCategoryRow() {
    return `
        <tr id="add-category-row">
            <td class="config-row-label">添加新类别</td>
            <td>
                <input type="text" id="new-category-input" placeholder="在此输入类别名称 (例如: 配件)" value="${state.newCategory}" />
            </td>
            <td></td>
            <td class="config-row-action">
                <button id="add-category-btn" style="background-color: var(--primary-color);">+</button>
            </td>
        </tr>
    `;
}

function renderSyncStatus() {
    switch (state.syncStatus) {
        case 'saving':
            return `<span id="sync-status" class="saving"><span class="spinner"></span>正在保存...</span>`;
        case 'saved':
            return `<span id="sync-status" class="saved">已同步 ✓</span>`;
        case 'error':
            return `<span id="sync-status" class="error">同步失败 ✗</span>`;
        case 'idle':
        default:
             return `<span id="sync-status">所有更改已保存</span>`;
    }
}

function renderAdminPanel() {
    return `
    <div class="adminContainer">
        <header class="adminHeader">
            <h2>龙盛科技 系统管理后台 V1.01</h2>
            <div class="header-actions-admin">
                <span class="user-email-display">${state.userEmail || ''}</span>
                ${renderSyncStatus()}
                <button id="back-to-quote-btn" class="admin-button">返回报价首页</button>
                <button id="logout-btn" class="admin-button">登出</button>
            </div>
        </header>

        <nav class="admin-tabs">
            <button class="admin-tab-btn ${state.adminView === 'prices' ? 'active' : ''}" data-view="prices">价格管理</button>
            <button class="admin-tab-btn ${state.adminView === 'users' ? 'active' : ''}" data-view="users">用户管理</button>
            <button class="admin-tab-btn ${state.adminView === 'logs' ? 'active' : ''}" data-view="logs">登录日志</button>
        </nav>

        <div class="admin-content">
            ${state.adminView === 'prices' ? renderPriceManagement() : ''}
            ${state.adminView === 'users' ? renderUserManagement() : ''}
            ${state.adminView === 'logs' ? renderLoginLogs() : ''}
        </div>
    </div>
    `;
}

function renderPriceManagement() {
     const searchTerm = (state.adminSearchTerm || '').toLowerCase();
    const filteredPriceEntries = Object.entries(state.priceData.prices)
        .map(([category, models]) => {
            const filteredModels = Object.entries(models).filter(([model]) =>
                category.toLowerCase().includes(searchTerm) || model.toLowerCase().includes(searchTerm)
            );
            return [category, Object.fromEntries(filteredModels)];
        })
        .filter(([, models]) => Object.keys(models).length > 0);

    return `
        <div class="admin-section">
            <h3 class="admin-section-header">1. 核心计算参数与折扣</h3>
            <div class="admin-section-body">
                <div class="tiered-discount-section">
                    <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">N件N折阶梯价设置:</label>
                    <div id="tier-list">
                    ${(state.priceData.tieredDiscounts || []).map(tier => `
                        <div class="tier-row" data-tier-id="${tier.id}">
                            <span>满</span> <input type="number" class="tier-threshold" value="${tier.threshold}" placeholder="数量" /> <span>件, 打</span>
                            <input type="number" class="tier-rate" step="1" value="${Math.round((tier.rate || 1) * 100)}" placeholder="例如: 99" /> <span>折</span>
                            <button class="remove-tier-btn">删除</button>
                        </div>
                    `).join('')}
                    </div>
                    <button id="add-tier-btn" class="add-tier-btn">+ 添加阶梯</button>
                </div>
            </div>
        </div>
        <div class="admin-section">
            <h3 class="admin-section-header" style="background-color: #3b82f6;">2. 快速录入配件</h3>
            <div class="admin-section-body">
                <div class="quick-add-form">
                     <input type="text" id="quick-add-category-input" placeholder="分类" />
                     <input type="text" id="quick-add-model" placeholder="型号名称" />
                     <input type="number" id="quick-add-price" placeholder="成本单价" />
                     <button id="quick-add-btn">确认添加</button>
                </div>
            </div>
        </div>
        <div class="admin-section">
             <h3 class="admin-section-header" style="background-color: #16a34a;">3. 导入配件 (Excel/Txt)</h3>
             <div class="admin-section-body">
                 <div class="import-form">
                    <label for="import-file-input" class="import-file-label">
                        选择文件
                        <input type="file" id="import-file-input" accept=".txt,.csv,.xlsx,.xls" />
                    </label>
                    <span id="file-name-display">未选择文件</span>
                    <button id="import-btn">执行批量导入</button>
                 </div>
             </div>
        </div>
        <div class="admin-section">
            <h3 class="admin-section-header" style="background-color: #6b7280;">4. 现有数据维护</h3>
            <div class="admin-section-body">
                <input type="search" id="admin-search-input" placeholder="输入型号或分类名称搜索..." value="${state.adminSearchTerm}" />
                <div id="admin-data-table-container" style="max-height: 400px; overflow-y: auto;">
                    <table class="admin-data-table">
                        <thead><tr><th>分类</th><th>型号</th><th>单价</th><th>操作</th></tr></thead>
                        <tbody>
                            ${filteredPriceEntries.map(([category, models]) => 
                                Object.entries(models).map(([model, price]) => `
                                    <tr data-category="${category}" data-model="${model}">
                                        <td>${category}</td>
                                        <td>${model}</td>
                                        <td><input type="number" class="price-input" value="${price}" /></td>
                                        <td>
                                            <button class="admin-save-item-btn">保存</button>
                                            <button class="admin-delete-item-btn">删除</button>
                                        </td>
                                    </tr>
                                `).join('')
                            ).join('') || `<tr><td colspan="4" style="text-align:center;">未找到匹配项</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        <button id="export-all-prices-btn" class="generate-btn" style="width: 100%; padding: 0.8rem; margin-top: 1rem;">导出全部价格为Excel</button>
    `;
}

function renderUserManagement() {
    return `
        <div class="admin-section">
            <h3 class="admin-section-header">用户列表</h3>
            <div class="admin-section-body">
                <div class="admin-data-table-container">
                    <table class="admin-data-table">
                        <thead>
                            <tr>
                                <th>姓名</th>
                                <th>手机号</th>
                                <th>邮箱</th>
                                <th>角色</th>
                                <th>状态</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${state.users.length === 0 ? `<tr><td colspan="6">没有需要管理的用户</td></tr>` : ''}
                            ${state.users.map(user => `
                                <tr data-user-id="${user.id}">
                                    <td>${user.full_name || 'N/A'}</td>
                                    <td>${user.phone || 'N/A'}</td>
                                    {/* FIX: Correctly display the user's email from the user object, with a fallback to user ID. The previous logic was incorrectly checking the logged-in admin's email. */}
                                    <td>${(user as any).email || user.id}</td>
                                    <td><span class="status-badge role-${user.role}">${user.role}</span></td>
                                    <td><span class="status-badge ${user.approved ? 'approved' : 'pending'}">${user.approved ? '已批准' : '待审批'}</span></td>
                                    <td class="user-actions">
                                        ${!user.approved ? `<button class="approve-user-btn">批准</button>` : ''}
                                        ${user.role !== 'admin' ? `<button class="reject-user-btn">驳回/删除</button>` : ''}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function renderLoginLogs() {
    return `
        <div class="admin-section">
            <h3 class="admin-section-header">登录日志</h3>
            <div class="admin-section-body">
                <div class="admin-data-table-container">
                    <table class="admin-data-table">
                        <thead><tr><th>用户邮箱</th><th>登录时间</th></tr></thead>
                        <tbody>
                             ${state.loginLogs.length === 0 ? `<tr><td colspan="2">暂无登录记录</td></tr>` : ''}
                             ${state.loginLogs.map(log => `
                                <tr>
                                    <td>${log.email}</td>
                                    <td>${new Date(log.timestamp).toLocaleString('zh-CN')}</td>
                                </tr>
                             `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// --- LOGIC & EVENT HANDLERS ---
function showModal(options: Partial<CustomModalState>) {
    state.customModal = {
        title: '提示',
        message: '',
        onConfirm: null,
        confirmText: '确定',
        cancelText: '取消',
        showCancel: false,
        isDanger: false,
        ...options
    };
    state.showCustomModal = true;
    render();
}

function calculateTotals() {
    const standardCost = Object.entries(state.selection).reduce((acc, [category, { model, quantity }]) => {
        if (model && quantity > 0) {
            const dataCategory = category.startsWith('硬盘') ? '硬盘' : category;
            const cost = state.priceData.prices[dataCategory]?.[model] ?? 0;
            return acc + (cost * quantity);
        }
        return acc;
    }, 0);

    const customCost = state.customItems.reduce((acc, item) => {
        if (item.model && item.quantity > 0) {
            const cost = state.priceData.prices[item.category]?.[item.model] ?? 0;
            return acc + (cost * item.quantity);
        }
        return acc;
    }, 0);
    
    const costTotal = standardCost + customCost;

    const standardItems = Object.values(state.selection).filter(item => item.model && item.quantity > 0);
    const customItems = state.customItems.filter(item => item.model && item.quantity > 0);
    const totalQuantity = [...standardItems, ...customItems].reduce((acc, { quantity }) => acc + quantity, 0);

    const sortedTiers = [...(state.priceData.tieredDiscounts || [])].sort((a, b) => b.threshold - a.threshold);
    let appliedRate = 1.0;
    let appliedDiscountLabel = '无折扣';

    const applicableTier = sortedTiers.find(tier => tier.threshold > 0 && totalQuantity >= tier.threshold);

    if (applicableTier) {
        appliedRate = applicableTier.rate;
        appliedDiscountLabel = `满 ${applicableTier.threshold} 件, 打 ${applicableTier.rate} 折`;
    }

    const priceBeforeDiscount = costTotal * (1 + state.markupPoints / 100);
    let finalPrice = priceBeforeDiscount * appliedRate - state.specialDiscount;
    
    finalPrice = Math.max(0, finalPrice);

    if (finalPrice > 0) {
        const intPrice = Math.floor(finalPrice);
        const lastTwoDigits = intPrice % 100;
        
        if (lastTwoDigits !== 0) {
            const basePrice = Math.floor(intPrice / 100) * 100;
            if (lastTwoDigits > 50) {
                finalPrice = basePrice + 99;
            } else { 
                finalPrice = basePrice + 50;
            }
        } else {
            finalPrice = intPrice;
        }
    }

    return { finalPrice, appliedRate, appliedDiscountLabel, costTotal };
}

function getFinalConfigText() {
    const parts = [
        ...Object.entries(state.selection)
            .filter(([_, { model, quantity }]) => model && quantity > 0)
            .map(([_, { model, quantity }]) => `${model} * ${quantity}`),
        ...state.customItems
            .filter(item => item.model && item.quantity > 0)
            .map(item => `${item.model} * ${item.quantity}`)
    ];
    return parts.join(' | ');
}

function handleMatchConfig() {
    const input = ($('#matcher-input') as HTMLInputElement).value;
    if (!input) return;

    const newSelection = getInitialSelection();
    const allModels = Object.entries(state.priceData.prices)
        .flatMap(([category, models]) =>
            Object.keys(models).map(model => ({
                model,
                category,
                normalizedModel: model.toLowerCase().replace(/\s/g, '')
            }))
        )
        .sort((a, b) => b.model.length - a.model.length);

    let processedInput = input;

    const plusIndex = processedInput.indexOf('+');
    if (plusIndex > -1) {
        const components = processedInput.split(/[\\/|]/);
        const hddComponent = components.find(c => c.includes('+'));

        if (hddComponent) {
            const [part1Str, part2Str] = hddComponent.split('+').map(p => p.trim());
            const hddModels = allModels.filter(m => m.category === '硬盘');

            const model1 = hddModels.find(m => part1Str.toLowerCase().replace(/\s/g, '').includes(m.normalizedModel));
            const model2 = hddModels.find(m => part2Str.toLowerCase().replace(/\s/g, '').includes(m.normalizedModel));

            if (model1) {
                newSelection['硬盘1'].model = model1.model;
            }
            if (model2) {
                newSelection['硬盘2'].model = model2.model;
            }
            processedInput = processedInput.replace(hddComponent, ' ');
        }
    }

    let tempInput = processedInput.toLowerCase();
    const hddFillOrder = ['硬盘1', '硬盘2'];

    for (const { model, category, normalizedModel } of allModels) {
        if (tempInput.replace(/\s/g, '').includes(normalizedModel)) {
            let targetCategory = category;

            if (category === '硬盘') {
                const availableSlot = hddFillOrder.find(cat => !newSelection[cat].model);
                if (availableSlot) {
                    targetCategory = availableSlot;
                } else {
                    continue; 
                }
            }

            if (newSelection[targetCategory] && !newSelection[targetCategory].model) {
                newSelection[targetCategory].model = model;

                const regex = new RegExp(`(${model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${normalizedModel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})[^/|\\\\]*?[*x]\\s*(\\d+)`, 'i');
                const match = input.match(regex);
                if (match && match[2]) {
                    newSelection[targetCategory].quantity = parseInt(match[2], 10);
                }
                
                tempInput = tempInput.replace(normalizedModel, ' '.repeat(normalizedModel.length));
            }
        }
    }

    state.selection = newSelection;
    render();
}

function handleExportExcel() {
    const totals = calculateTotals();
    
    const configParts = [
        ...Object.entries(state.selection)
            .filter(([_, { model, quantity }]) => model && quantity > 0)
            .map(([_, { model }]) => model),
        ...state.customItems
            .filter(item => item.model && item.quantity > 0)
            .map(item => item.model)
    ];

    if (configParts.length === 0) {
        showModal({ title: '无法导出', message: '请先选择至少一个配件再导出报价单。' });
        return;
    }

    const mainframeModel = state.selection['主机']?.model || '';
    const modelCode = mainframeModel.split(' ')[0] || '自定义主机';
    const configString = configParts.join(' | ');
    const remark = '含13%增值税发票';

    const aoa = [
        ['型号', '配置', '数量', '单价', '总价', '备注'],
        [modelCode, configString, 1, totals.finalPrice, totals.finalPrice, remark],
        [null, '总计', null, null, totals.finalPrice, null],
        [], // Empty row
        [], // Empty row
        [], // Empty row
        [], // Empty row
        [null, null, null, '北京龙盛天地科技有限公司报价表'],
        [null, null, null, '地址: 北京市海淀区清河路164号1号院'],
        [null, null, null, '电话: 010-51654433-8013 传真: 010-82627270'],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(aoa);

    worksheet['!cols'] = [
        { wch: 15 }, // A: 型号
        { wch: 60 }, // B: 配置
        { wch: 8 },  // C: 数量
        { wch: 12 }, // D: 单价
        { wch: 12 }, // E: 总价
        { wch: 25 }, // F: 备注
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '报价单');

    XLSX.writeFile(workbook, '龙盛科技报价单.xlsx');
}

function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files ? target.files[0] : null;
    if (!file) {
        (document.getElementById('file-name-display') as HTMLElement).textContent = '未选择文件';
        state.pendingFile = null;
        return;
    }
    (document.getElementById('file-name-display') as HTMLElement).textContent = file.name;
    state.pendingFile = file;
}

async function handleAuthAction(e: Event) {
    e.preventDefault();
    state.authLoading = true;
    state.authError = null;
    render();

    const emailInput = ($('#email') as HTMLInputElement);
    const passwordInput = ($('#password') as HTMLInputElement);
    const email = emailInput.value;
    const password = passwordInput.value;

    try {
        if (state.loginView === 'signIn') {
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
            if (data.user) {
                const { error: logError } = await supabaseClient.from('login_logs').insert({ user_id: data.user.id, email: data.user.email });
                if (logError) console.error('Failed to log login event:', logError.message);
            }
        } else { // signUp
            const fullNameInput = ($('#full_name') as HTMLInputElement);
            const phoneInput = ($('#phone') as HTMLInputElement);
            const full_name = fullNameInput.value;
            const phone = phoneInput.value;
            if (!full_name || !phone) {
                throw new Error("姓名和手机号不能为空");
            }
            const { error } = await supabaseClient.auth.signUp({ 
                email, 
                password,
                options: {
                    data: {
                        full_name,
                        phone
                    }
                }
            });
            if (error) throw error;
            showModal({ title: '注册成功', message: '您的账户已创建，请等待管理员审批后登录。', onConfirm: () => {
                state.loginView = 'signIn';
                render();
            }});
        }
    } catch (error: any) {
        state.authError = error.message || '发生未知错误';
    } finally {
        state.authLoading = false;
        render();
    }
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
    // The onAuthStateChange listener will handle resetting the state
}

async function fetchUsersAndLogs() {
    if (state.profile?.role !== 'admin') return;

    const { data: usersData, error: usersError } = await supabaseClient.from('profiles').select('*');
    if (usersError) {
        console.error("Error fetching users:", usersError);
    } else {
        const { data: authUsers, error: authUsersError } = await supabaseClient.auth.admin.listUsers();
        if (authUsersError) {
             console.error("Error fetching auth users:", authUsersError);
             state.users = usersData;
        } else {
            // This is inefficient but necessary as profiles don't store emails.
            const emailMap = new Map(authUsers.users.map(u => [u.id, u.email]));
            state.users = usersData.map((profile: any) => ({...profile, email: emailMap.get(profile.id) || 'N/A' }));
        }
    }

    const { data: logsData, error: logsError } = await supabaseClient.from('login_logs').select('*').order('timestamp', { ascending: false });
    if (logsError) {
        console.error("Error fetching logs:", logsError);
    } else {
        state.loginLogs = logsData;
    }

    render();
}

async function approveUser(userId: string) {
    const { error } = await supabaseClient.from('profiles').update({ approved: true }).eq('id', userId);
    if (error) {
        showModal({title: '错误', message: '批准用户失败: ' + error.message });
    } else {
        await fetchUsersAndLogs(); // Refresh list
    }
}

async function rejectUser(userId: string) {
    const { error } = await supabaseClient.auth.admin.deleteUser(userId);
     if (error) {
        showModal({title: '错误', message: '删除用户失败: ' + error.message });
    } else {
        await fetchUsersAndLogs(); // Refresh list
    }
}

function processImportedData(data: any[][]) {
    let updatedCount = 0;
    let addedCount = 0;
    let importHappened = false;

    const headers = ['配件', '分类', '型号', '报价', '单价'];
    const firstRow = data.length > 0 ? data[0].map(h => String(h).trim()) : [];
    let startIndex = 0;

    let categoryIndex = -1, modelIndex = -1, priceIndex = -1;
    
    if (headers.some(h => firstRow.includes(h))) {
        startIndex = 1;
        categoryIndex = firstRow.findIndex(h => h === '配件' || h === '分类');
        modelIndex = firstRow.findIndex(h => h === '型号');
        priceIndex = firstRow.findIndex(h => h === '报价' || h === '单价');
    } else {
        categoryIndex = 0;
        modelIndex = 1;
        priceIndex = 2;
    }

    if (categoryIndex === -1 || modelIndex === -1 || priceIndex === -1) {
        showModal({ title: '导入失败', message: '文件缺少必要的列标题 (配件/分类, 型号, 报价/单价)。' });
        return;
    }

    for (let i = startIndex; i < data.length; i++) {
        const row = data[i];
        if (row && row.length >= 3) {
            let category = String(row[categoryIndex] || '').trim();
            const model = String(row[modelIndex] || '').trim();
            const price = parseFloat(row[priceIndex]);

            if (category.startsWith('硬盘')) {
                category = '硬盘';
            }

            if (category && model && !isNaN(price)) {
                if (!state.priceData.prices[category]) {
                    state.priceData.prices[category] = {};
                }
                if (state.priceData.prices[category][model] === undefined) addedCount++;
                else updatedCount++;
                state.priceData.prices[category][model] = price;
                importHappened = true;
            }
        }
    }
    
    if (importHappened) {
        updateTimestamp();
    }
    
    showModal({
        title: '导入完成',
        message: `更新: ${updatedCount} 条\n新增: ${addedCount} 条`,
    });
    
    state.pendingFile = null;
    const fileInput = ($('#import-file-input') as HTMLInputElement);
    if(fileInput) fileInput.value = '';
    const fileNameDisplay = ($('#file-name-display') as HTMLElement);
    if(fileNameDisplay) fileNameDisplay.textContent = '未选择文件';
    render();
}

function addEventListeners() {
    appContainer.addEventListener('submit', (e) => {
        const target = e.target as HTMLElement;
        if (target.id === 'auth-form') {
            handleAuthAction(e);
        }
    });

    appContainer.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!target) return;
        
        const button = target.closest('button');
        const row = target.closest<HTMLTableRowElement>('tr');
        const tierRow = target.closest<HTMLElement>('.tier-row');
        const link = target.closest('a');

        if (link && link.id === 'auth-toggle-link') {
            e.preventDefault();
            state.loginView = state.loginView === 'signIn' ? 'signUp' : 'signIn';
            state.authError = null;
            render();
            return;
        }

        if (target.id === 'custom-modal-overlay') {
             state.showCustomModal = false;
             render();
             return;
        }
        
        if(button && button.id === 'custom-modal-cancel-btn') {
            state.showCustomModal = false; render();
        } else if (button && button.id === 'custom-modal-confirm-btn') {
            if (state.customModal.onConfirm) {
                state.customModal.onConfirm();
            }
            state.showCustomModal = false;
            render();
        } else if (button && button.id === 'logout-btn') {
            handleLogout();
        } else if (button && button.id === 'app-view-toggle-btn') {
            state.view = 'admin';
            fetchUsersAndLogs();
            render();
        } else if (button && button.classList.contains('admin-tab-btn')) {
            const view = button.dataset.view as AppState['adminView'];
            if (view) {
                state.adminView = view;
                render();
            }
        } else if (button && button.classList.contains('approve-user-btn') && row) {
            const userId = row.dataset.userId;
            if (userId) approveUser(userId);
        } else if (button && button.classList.contains('reject-user-btn') && row) {
            const userId = row.dataset.userId;
            const user = state.users.find(u => u.id === userId);
            if (userId && user) {
                showModal({
                    title: '确认删除',
                    message: `确定要删除用户 "${user.full_name}" 吗？此操作无法撤销。`,
                    showCancel: true,
                    isDanger: true,
                    confirmText: '删除',
                    onConfirm: () => rejectUser(userId),
                });
            }
        } else if (button && button.id === 'back-to-quote-btn') {
            state.view = 'quote'; render();
        } else if (button && button.id === 'reset-btn') {
            state.selection = getInitialSelection();
            state.customItems = [];
            state.newCategory = '';
            state.specialDiscount = 0;
            state.markupPoints = 15;
            render();
        } else if (button && button.classList.contains('remove-item-btn') && row) {
            const category = row.dataset.category;
            if(category) state.selection[category] = getInitialSelection()[category];
            render();
        } else if (button && button.id === 'add-category-btn') {
            if (state.newCategory.trim()) {
                const newCat = state.newCategory.trim();
                 if (!state.customItems.some(item => item.category === newCat)) {
                    state.customItems.push({ id: Date.now(), category: newCat, model: '', quantity: 1 });
                }
                state.newCategory = ''; render();
            }
        } else if (button && button.classList.contains('remove-custom-item-btn') && row) {
            state.customItems = state.customItems.filter(item => item.id !== Number(row.dataset.customId));
            render();
        } else if (button && button.id === 'match-config-btn') {
            handleMatchConfig();
        } else if (button && button.id === 'generate-quote-btn') {
            handleExportExcel();
        } else if (button && button.id === 'export-all-prices-btn') {
            const rows = [['分类', '型号', '单价']];
            const sortedCategories = Object.keys(state.priceData.prices).sort();
            for (const category of sortedCategories) {
                const models = state.priceData.prices[category];
                if (models) {
                    const sortedModels = Object.keys(models).sort();
                    for (const model of sortedModels) {
                        rows.push([category, model, models[model].toString()]);
                    }
                }
            }

            let csvContent = "\uFEFF";
            rows.forEach(rowArray => {
                let row = rowArray.join(',');
                csvContent += row + '\r\n';
            });

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            if (link.download !== undefined) {
                const url = URL.createObjectURL(blob);
                link.setAttribute("href", url);
                link.setAttribute("download", "全部价格表.csv");
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        } else if (button && button.id === 'quick-add-btn') {
            const categoryInput = ($('#quick-add-category-input') as HTMLInputElement);
            const modelInput = ($('#quick-add-model') as HTMLInputElement);
            const priceInput = ($('#quick-add-price') as HTMLInputElement);
            
            const category = categoryInput.value.trim();
            const model = modelInput.value.trim();
            const priceStr = priceInput.value.trim();
            const price = parseFloat(priceStr);

            if (!category) { showModal({ title: '输入错误', message: '请输入分类。' }); return; }
            if (!model) { showModal({ title: '输入错误', message: '请输入型号名称。' }); return; }
            if (priceStr === '' || isNaN(price)) { showModal({ title: '输入错误', message: '请输入有效的成本单价。' }); return; }

            const itemExists = state.priceData.prices[category]?.[model] !== undefined;

            const performAddOrUpdate = () => {
                if (!state.priceData.prices[category]) state.priceData.prices[category] = {};
                state.priceData.prices[category][model] = price;
                updateTimestamp();
                
                categoryInput.value = '';
                modelInput.value = '';
                priceInput.value = '';
                categoryInput.focus();
                render();
            };

            if (itemExists) {
                showModal({
                    title: '确认更新',
                    message: `配件 "${category} - ${model}" 已存在，是否要将其价格更新为 ${price}？`,
                    showCancel: true,
                    confirmText: '更新',
                    onConfirm: performAddOrUpdate
                });
            } else {
                performAddOrUpdate();
            }

        } else if (button && button.classList.contains('admin-save-item-btn') && row) {
            const { category, model } = row.dataset;
            const newPrice = parseFloat((row.querySelector('.price-input') as HTMLInputElement).value);
            if (category && model && !isNaN(newPrice)) {
                if (state.priceData.prices[category]) {
                    state.priceData.prices[category][model] = newPrice;
                    updateTimestamp();
                    button.style.backgroundColor = '#16a34a';
                    setTimeout(() => { button.style.backgroundColor = ''; }, 1000);
                }
            }
        } else if (button && button.classList.contains('admin-delete-item-btn') && row) {
            const { category, model } = row.dataset;
            if (category && model) {
                showModal({
                    title: '确认删除',
                    message: `确定要删除 "${category} - ${model}" 吗？`,
                    showCancel: true,
                    isDanger: true,
                    confirmText: '删除',
                    onConfirm: () => {
                        if(state.priceData.prices[category]) {
                            delete state.priceData.prices[category][model];
                            if (Object.keys(state.priceData.prices[category]).length === 0) delete state.priceData.prices[category];
                            updateTimestamp();
                            render();
                        }
                    }
                });
            }
        } else if (button && button.id === 'add-tier-btn') {
            if (!state.priceData.tieredDiscounts) state.priceData.tieredDiscounts = [];
            state.priceData.tieredDiscounts.push({ id: Date.now(), threshold: 0, rate: 0.99 });
            updateTimestamp();
            render();
        } else if (button && button.classList.contains('remove-tier-btn') && tierRow) {
            const tierId = Number(tierRow.dataset.tierId);
            state.priceData.tieredDiscounts = state.priceData.tieredDiscounts.filter(t => t.id !== tierId);
            updateTimestamp();
            render();
        } else if (button && button.id === 'import-btn') {
            if (state.pendingFile) {
                const file = state.pendingFile;
                const reader = new FileReader();
                const fileName = file.name.toLowerCase();

                if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
                    reader.onload = (e) => {
                        try {
                            if (e.target && e.target.result instanceof ArrayBuffer) {
                                const data = new Uint8Array(e.target.result);
                                const workbook = XLSX.read(data, { type: 'array' });
                                const firstSheetName = workbook.SheetNames[0];
                                const worksheet = workbook.Sheets[firstSheetName];
                                const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                                processImportedData(json);
                            } else {
                                throw new Error('File data is not in the expected ArrayBuffer format.');
                            }
                        } catch (err) {
                             showModal({ title: '导入失败', message: '无法解析Excel文件，请确保文件格式正确。' });
                        }
                    };
                    reader.readAsArrayBuffer(file);
                } else {
                    reader.onload = (e) => {
                        const text = e.target && e.target.result;
                        if (typeof text !== 'string') {
                            showModal({ title: '导入失败', message: '文件读取失败，内容格式不正确。' });
                            return;
                        }
                        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
                        const dataAsArrays = lines.map(line => line.split(/[,，\t]/).map(p => p.trim()));
                        processImportedData(dataAsArrays);
                    };
                    reader.readAsText(state.pendingFile);
                }
            } else {
                showModal({ title: '提示', message: '请先选择一个文件。' });
            }
        }
    });

    appContainer.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        const row = target.closest<HTMLTableRowElement>('tr');
        const tierRow = target.closest<HTMLElement>('.tier-row');
        
        if (target.id === 'new-category-input') { state.newCategory = target.value; return; }
        
        if (target.id === 'admin-search-input') {
            const searchValue = target.value;
            const selectionStart = target.selectionStart;
            const selectionEnd = target.selectionEnd;
            const scrollContainer = $('#admin-data-table-container');
            const scrollTop = scrollContainer ? scrollContainer.scrollTop : 0;

            state.adminSearchTerm = searchValue;
            render();

            const newSearchInput = $('#admin-search-input') as HTMLInputElement;
            if (newSearchInput) {
                newSearchInput.focus();
                newSearchInput.setSelectionRange(selectionStart, selectionEnd);
            }
            const newScrollContainer = $('#admin-data-table-container');
            if (newScrollContainer) {
                newScrollContainer.scrollTop = scrollTop;
            }
            return;
        }

        if (tierRow) {
            const tierId = Number(tierRow.dataset.tierId);
            const tier = state.priceData.tieredDiscounts.find(t => t.id === tierId);
            if (!tier) return;
            if (target.classList.contains('tier-threshold')) tier.threshold = Number(target.value);
            if (target.classList.contains('tier-rate')) tier.rate = Number(target.value) / 100;
            updateTimestamp();
            return;
        }

        if (row && row.dataset.category && !row.dataset.model) {
            const category = row.dataset.category;
            if (target.classList.contains('quantity-input')) {
                state.selection[category].quantity = Math.max(0, parseInt(target.value, 10) || 0); render();
            }
        } else if (row && row.dataset.customId) {
            const item = state.customItems.find(i => i.id === Number(row.dataset.customId));
            if (item && target.classList.contains('custom-quantity-input')) {
                item.quantity = Math.max(0, parseInt(target.value, 10) || 0); render();
            }
        } else if (target.id === 'special-discount-input') {
            state.specialDiscount = Math.max(0, Number(target.value)); render();
        } else if (target.id === 'markup-points-input') {
            state.markupPoints = Math.max(0, Number(target.value)); render();
        }
    });
    
    appContainer.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement | HTMLSelectElement;
        const row = target.closest<HTMLTableRowElement>('tr');

        if (target.id === 'import-file-input') { handleFileSelect(e as unknown as Event); return; }
        
        if (row && row.dataset.category) {
            const category = row.dataset.category;
            if (target.classList.contains('model-select')) { state.selection[category].model = (target as HTMLSelectElement).value; render(); }
        } else if (row && row.dataset.customId) {
            const item = state.customItems.find(i => i.id === Number(row.dataset.customId));
            if (item && target.classList.contains('custom-model-select')) { item.model = (target as HTMLSelectElement).value; render(); }
        }
    });
}

// --- INITIALIZATION ---
async function initializeApp() {
    render(); // Show loading screen
    
    if (!SUPABASE_URL || SUPABASE_URL.trim() === '' || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.trim() === '') {
        state.appStatus = 'error';
        const urlValue = SUPABASE_URL ? `<code>'${SUPABASE_URL}'</code>` : '<strong>未找到或为空</strong>';
        const keyValue = SUPABASE_ANON_KEY ? `<code>'${SUPABASE_ANON_KEY.substring(0, 8)}...'</code>` : '<strong>未找到或为空</strong>';
        const allEnvKeys = import.meta.env ? Object.keys(import.meta.env).filter(k => k.startsWith('VITE_')).join(', ') : '未检测到 VITE_ 变量';
        const detectedKeysText = allEnvKeys.length > 0 ? `<code>${allEnvKeys}</code>` : '<strong>未检测到 VITE_ 变量</strong>';

        state.errorDetails = `<strong>数据库连接配置错误！</strong><br><br>...`;
        render();
        return;
    }

    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    supabaseClient.auth.onAuthStateChange(async (event: string, session: any) => {
        if (session) {
            state.userEmail = session.user.email;
            const { data: profile, error } = await supabaseClient.from('profiles').select('*').eq('id', session.user.id).single();
            
            if (error && error.code !== 'PGRST116') {
                console.error("Error fetching profile:", error);
                handleLogout(); // Force logout if profile is inaccessible
                return;
            }

            state.profile = profile;

            if (profile && profile.approved) {
                state.isLoggedIn = true;
                state.view = 'quote';
                if (Object.keys(state.priceData.prices).length === 0) {
                    await fetchPriceData();
                } else {
                    render();
                }
            } else {
                state.isLoggedIn = false; // Not fully logged in to the app
                state.view = 'pending';
                render();
            }
        } else {
            state.isLoggedIn = false;
            state.userEmail = null;
            state.profile = null;
            state.view = 'login';
            render();
        }
    });

    state.appStatus = 'ready';
    render();
}

async function fetchPriceData() {
    try {
        const { data, error } = await supabaseClient
            .from('quote_data')
            .select('data')
            .eq('id', 1)
            .single();

        if (error && error.code !== 'PGRST116') { throw error; }

        if (data && data.data) {
            state.priceData = data.data;
        } else {
            state.priceData = PRICE_DATA;
            const { error: insertError } = await supabaseClient
                .from('quote_data')
                .insert({ id: 1, data: PRICE_DATA });
            if (insertError) throw insertError;
        }
    } catch (e: any) {
        state.appStatus = 'error';
        state.errorDetails = `无法从云端加载数据。错误: ${e.message}`;
    } finally {
        render();
    }
}


addEventListeners();
initializeApp();
