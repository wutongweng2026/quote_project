// --- SUPABASE CLIENT ---
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';
const supabaseUrl = SUPABASE_URL;
const supabaseKey = SUPABASE_ANON_KEY;

import { createClient, SupabaseClient, User as AuthUser, PostgrestError } from '@supabase/supabase-js';

// --- TYPES ---
interface PriceDataItem { [model: string]: number; }
interface Prices { [category:string]: PriceDataItem; }

// Database-first types matching your new schema
interface DbQuoteItem { id: number; category: string; model: string; price: number; }
interface DbDiscount { id: number; threshold: number; rate: number; }
interface DbMarkupPoint { id: number; alias: string; value: number; }
// This matches your 'profiles' table - ADDED is_approved
interface DbProfile { id: string; full_name: string | null; role: 'admin' | 'sales'; is_approved: boolean; }

// Combined user object
interface CurrentUser extends DbProfile {
    auth: AuthUser;
}

interface PriceData {
    prices: Prices;
    tieredDiscounts: DbDiscount[];
    markupPoints: DbMarkupPoint[];
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
    inputType?: 'text' | 'password';
    errorMessage?: string;
}

interface AppState {
    appStatus: 'loading' | 'ready' | 'error';
    errorMessage: string | null;
    priceData: PriceData;
    profiles: DbProfile[];
    view: 'login' | 'register' | 'quote' | 'admin' | 'userManagement'; // Added register and userManagement
    currentUser: CurrentUser | null;
    selection: SelectionState;
    customItems: CustomItem[];
    newCategory: string;
    specialDiscount: number;
    markupPoints: number;
    adminSearchTerm: string;
    showCustomModal: boolean;
    customModal: CustomModalState;
    syncStatus: 'idle' | 'saving' | 'saved' | 'error';
}

// --- CONFIG ---
const CONFIG_ROWS = ['主机', '内存', '硬盘1', '硬盘2', '显卡', '电源', '显示器'];
declare var XLSX: any;

if (!supabaseUrl || !supabaseKey) {
    const appEl = document.querySelector('#app')!;
    appEl.innerHTML = `
        <div class="app-status-container">
            <h2>配置错误</h2>
            <div class="error-details">
                <p>无法连接到数据库。请确保您的 <strong>config.ts</strong> 文件中已设置好以下环境变量：</p>
                <ul>
                    <li><code>SUPABASE_URL</code>: 您的 Supabase 项目 URL</li>
                    <li><code>SUPABASE_ANON_KEY</code>: 您的 Supabase 项目 anon key</li>
                </ul>
            </div>
        </div>
    `;
    throw new Error("Supabase credentials are not configured in the config.ts file.");
}

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

// --- STATE MANAGEMENT ---
const getInitialSelection = (): SelectionState => ({
    '主机': { model: '', quantity: 1 }, '内存': { model: '', quantity: 1 },
    '硬盘1': { model: '', quantity: 1 }, '硬盘2': { model: '', quantity: 0 },
    '显卡': { model: '', quantity: 1 }, '电源': { model: '', quantity: 1 },
    '显示器': { model: '', quantity: 1 }
});

const state: AppState = {
    appStatus: 'loading',
    errorMessage: null,
    priceData: { prices: {}, tieredDiscounts: [], markupPoints: [] },
    profiles: [],
    view: 'login',
    currentUser: null,
    selection: getInitialSelection(),
    customItems: [],
    newCategory: '',
    specialDiscount: 0,
    markupPoints: 0,
    adminSearchTerm: '',
    showCustomModal: false,
    customModal: {
        title: '', message: '', onConfirm: null, confirmText: '确定',
        cancelText: '取消', showCancel: false, isDanger: false,
    },
    syncStatus: 'idle',
};

// --- DOM SELECTORS ---
const $ = (selector: string) => document.querySelector(selector);
const appContainer = $('#app')!;

// --- RENDER FUNCTIONS ---
function renderApp() {
    let html = '';
    if (state.appStatus === 'loading') {
        html = `<div class="app-status-container"><div class="loading-spinner"></div><h2>正在加载...</h2></div>`;
    } else if (state.appStatus === 'error') {
        html = `<div class="app-status-container"><h2>出现错误</h2><div class="error-details">${state.errorMessage}</div></div>`;
    } else if (state.view === 'login') {
        html = renderLoginView();
    } else if (state.view === 'register') {
        html = renderRegisterView();
    } else if (!state.currentUser) {
        html = renderLoginView(); // Fallback to login if no user
    } else if (state.view === 'quote') {
        html = renderQuoteTool();
    } else if (state.view === 'admin' && state.currentUser.role === 'admin') {
        html = renderAdminPanel();
    } else if (state.view === 'userManagement' && state.currentUser.role === 'admin') {
        html = renderUserManagementPanel();
    } else {
        html = renderQuoteTool();
    }

    if (state.showCustomModal) {
        html += renderCustomModal();
    }
    appContainer.innerHTML = html;
}

function renderLoginView() {
    return `
        <div class="auth-container">
            <div class="auth-box">
                <h1>产品报价系统登录</h1>
                <div id="login-error" class="auth-error" style="display: none;"></div>
                <form id="login-form">
                    <div class="auth-input-group">
                        <label for="username">用户名</label>
                        <input type="text" id="username" name="username" required autocomplete="username">
                    </div>
                    <div class="auth-input-group">
                        <label for="password">密码</label>
                        <input type="password" id="password" name="password" required autocomplete="current-password">
                    </div>
                    <button type="submit" class="auth-button">登录</button>
                </form>
                <div class="auth-toggle">
                    没有账户？ <a href="#" id="go-to-register">注册新账户</a>
                </div>
            </div>
        </div>
    `;
}

function renderRegisterView() {
    return `
        <div class="auth-container">
            <div class="auth-box">
                <h1>注册新账户</h1>
                <div id="register-error" class="auth-error" style="display: none;"></div>
                <form id="register-form">
                    <div class="auth-input-group">
                        <label for="reg-username">用户名</label>
                        <input type="text" id="reg-username" name="username" required autocomplete="username">
                    </div>
                    <div class="auth-input-group">
                        <label for="reg-password">密码</label>
                        <input type="password" id="reg-password" name="password" required autocomplete="new-password">
                    </div>
                    <button type="submit" class="auth-button">注册</button>
                </form>
                <div class="auth-toggle">
                    已有账户？ <a href="#" id="go-to-login">返回登录</a>
                </div>
            </div>
        </div>
    `;
}


function renderCustomModal() {
    if (!state.showCustomModal) return '';
    const { title, message, confirmText, cancelText, showCancel, isDanger, inputType, errorMessage } = state.customModal;
    return `
        <div class="modal-overlay" id="custom-modal-overlay">
            <div class="modal-content">
                <h2>${title}</h2>
                <p>${message}</p>
                ${inputType ? `<input type="${inputType}" id="modal-input" class="modal-input" autofocus />` : ''}
                <div class="modal-error">${errorMessage || ''}</div>
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
                <h1>产品报价系统 <span>v2.0 - 龙盛科技</span></h1>
                 <div class="header-actions">
                    <span class="user-email-display">用户: ${state.currentUser?.full_name || state.currentUser?.auth.email}</span>
                    ${state.currentUser?.role === 'admin' ? '<button class="admin-button" id="user-management-btn">用户管理</button>' : ''}
                    ${state.currentUser?.role === 'admin' ? '<button class="admin-button" id="app-view-toggle-btn">后台管理</button>' : ''}
                    <button class="admin-button" id="logout-btn">退出</button>
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
                    <colgroup> <col style="width: 200px;"> <col> <col style="width: 80px;"> <col style="width: 60px;"> </colgroup>
                    <thead> <tr> <th>配置清单</th> <th>规格型号</th> <th>数量</th> <th>操作</th> </tr> </thead>
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
                        <label>折扣:</label>
                        <div class="discount-display">${totals.appliedDiscountLabel}</div>
                    </div>
                    <div class="control-group">
                        <label for="markup-points-select">点位:</label>
                        <select id="markup-points-select">
                            ${state.priceData.markupPoints.map(point => `<option value="${point.id}" ${state.markupPoints === point.id ? 'selected' : ''}>${point.alias.split('(')[0].trim()}</option>`).join('')}
                        </select>
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
            <td> <input type="number" class="quantity-input" min="0" value="${currentSelection.quantity}" /> </td>
            <td class="config-row-action"> <button class="remove-item-btn" disabled>-</button> </td>
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
            <td> <input type="number" class="custom-quantity-input" min="0" value="${item.quantity}" /> </td>
            <td class="config-row-action"> <button class="remove-custom-item-btn">-</button> </td>
        </tr>
    `;
}

function renderAddCategoryRow() {
    return `
        <tr id="add-category-row">
            <td class="config-row-label">添加新类别</td>
            <td> <input type="text" id="new-category-input" placeholder="在此输入类别名称 (例如: 配件)" value="${state.newCategory}" /> </td>
            <td></td>
            <td class="config-row-action"> <button id="add-category-btn" style="background-color: var(--primary-color);">+</button> </td>
        </tr>
    `;
}

function renderAdminPanel() {
    const searchTerm = (state.adminSearchTerm || '').toLowerCase();
    const filteredPriceEntries = Object.entries(state.priceData.prices)
        .map(([category, models]) => {
            const filteredModels = Object.entries(models).filter(([model]) => category.toLowerCase().includes(searchTerm) || model.toLowerCase().includes(searchTerm));
            return [category, Object.fromEntries(filteredModels)];
        }).filter(([, models]) => Object.keys(models).length > 0);
    
    const syncStatusMessages = {
        idle: '',
        saving: '正在保存...',
        saved: '已同步 ✓',
        error: '保存出错!'
    };

    return `
    <div class="adminContainer">
        <header class="adminHeader">
            <h2>系统管理后台</h2>
            <div class="header-actions-admin">
                <div id="sync-status" class="${state.syncStatus}">${syncStatusMessages[state.syncStatus]}</div>
                <button id="back-to-quote-btn" class="admin-button">返回报价首页</button>
            </div>
        </header>
        <div class="admin-content">
            <div class="admin-section">
                <h3 class="admin-section-header">点位管理</h3>
                <div class="admin-section-body">
                     <p style="color: var(--secondary-text-color); font-size: 0.9rem; margin-top: 0;">修改后将自动保存。</p>
                    <div id="markup-points-list">
                        ${state.priceData.markupPoints.sort((a, b) => a.value - b.value).map(point => `
                            <div class="markup-point-row" data-id="${point.id}">
                                <input type="text" class="markup-alias-input" value="${point.alias}" placeholder="别名">
                                <input type="number" class="markup-value-input" value="${point.value}" placeholder="点数">
                                <span>点</span>
                                <button class="remove-markup-point-btn" data-id="${point.id}">删除</button>
                            </div>
                        `).join('')}
                    </div>
                     <div class="markup-point-row" style="margin-top: 1rem;"> <button id="add-markup-point-btn" class="add-new-btn">添加新点位</button> </div>
                </div>
            </div>
            <div class="admin-section">
                <h3 class="admin-section-header">折扣阶梯管理</h3>
                <div class="admin-section-body">
                    <p style="color: var(--secondary-text-color); font-size: 0.9rem; margin-top: 0;">修改后将自动保存。</p>
                    <div id="tiered-discount-list">
                        ${state.priceData.tieredDiscounts.sort((a,b) => a.threshold - b.threshold).map(tier => `
                            <div class="tier-row" data-id="${tier.id}">
                                <span>满</span> <input type="number" class="tier-threshold-input" value="${tier.threshold}" placeholder="数量">
                                <span>件, 打</span> <input type="number" step="0.1" class="tier-rate-input" value="${tier.rate}" placeholder="折扣率">
                                <span>折</span> <button class="remove-tier-btn" data-id="${tier.id}">删除</button>
                            </div>
                        `).join('')}
                    </div>
                     <div class="tier-row" style="margin-top: 1rem;"> <button id="add-tier-btn" class="add-new-btn">添加新折扣阶梯</button> </div>
                </div>
            </div>
            <div class="admin-section">
                <h3 class="admin-section-header">快速录入配件</h3>
                <div class="admin-section-body">
                    <form id="quick-add-form" class="quick-add-form">
                         <input type="text" id="quick-add-category-input" placeholder="分类" />
                         <input type="text" id="quick-add-model" placeholder="型号名称" />
                         <input type="number" id="quick-add-price" placeholder="成本单价" />
                         <button type="submit" id="quick-add-btn">确认添加/更新</button>
                    </form>
                    <div class="import-section">
                        <input type="file" id="import-file-input" accept=".xlsx, .xls" style="display: none;" />
                        <button id="import-excel-btn">从Excel导入</button>
                        <span id="file-name-display"></span>
                    </div>
                </div>
            </div>
            <div class="admin-section">
                <h3 class="admin-section-header">现有数据维护</h3>
                <div class="admin-section-body">
                    <input type="search" id="admin-search-input" placeholder="输入型号或分类名称搜索..." value="${state.adminSearchTerm}" />
                    <div id="admin-data-table-container" style="max-height: 400px; overflow-y: auto;">
                        <table class="admin-data-table">
                            <thead><tr><th>分类</th><th>型号</th><th>单价</th><th>操作</th></tr></thead>
                            <tbody>
                                ${filteredPriceEntries.map(([category, models]) => Object.entries(models).map(([model, price]) => `
                                    <tr data-category="${category}" data-model="${model}">
                                        <td>${category}</td> <td>${model}</td>
                                        <td><input type="number" class="price-input" value="${price}" /></td>
                                        <td>
                                            <button class="admin-save-item-btn">保存</button>
                                            <button class="admin-delete-item-btn" data-category="${category}" data-model="${model}">删除</button>
                                        </td>
                                    </tr>`).join('')).join('') || `<tr><td colspan="4" style="text-align:center;">未找到匹配项</td></tr>`}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `;
}

function renderUserManagementPanel() {
    return `
    <div class="adminContainer">
        <header class="adminHeader">
            <h2>用户账户管理</h2>
            <div class="header-actions-admin"> <button id="back-to-quote-btn" class="admin-button">返回报价首页</button> </div>
        </header>
        <div class="admin-content">
            <div class="admin-section">
                 <div class="admin-section-body">
                    <table class="admin-data-table">
                        <thead>
                            <tr>
                                <th>用户名</th>
                                <th>角色</th>
                                <th>状态</th>
                                <th style="text-align: right;">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${state.profiles.map(profile => `
                                <tr data-user-id="${profile.id}">
                                    <td>${profile.full_name || 'N/A'}</td>
                                    <td>
                                        <select class="user-role-select" ${profile.id === state.currentUser?.id ? 'disabled' : ''}>
                                            <option value="sales" ${profile.role === 'sales' ? 'selected' : ''}>Sales</option>
                                            <option value="admin" ${profile.role === 'admin' ? 'selected' : ''}>Admin</option>
                                        </select>
                                    </td>
                                    <td>
                                        <span class="status-badge ${profile.is_approved ? 'approved' : 'pending'}">
                                            ${profile.is_approved ? '已批准' : '待审批'}
                                        </span>
                                    </td>
                                    <td class="user-actions">
                                        ${!profile.is_approved ? `<button class="approve-user-btn">批准</button>` : ''}
                                        ${profile.id !== state.currentUser?.id ? `<button class="delete-user-btn">删除</button>` : ''}
                                    </td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
    `;
}

// --- LOGIC & EVENT HANDLERS ---
function showModal(options: Partial<CustomModalState>) {
    state.customModal = {
        title: '提示', message: '', onConfirm: null, confirmText: '确定',
        cancelText: '取消', showCancel: false, isDanger: false, errorMessage: '', ...options
    };
    state.showCustomModal = true;
    renderApp();
}

function updateTotalsUI() {
    const totals = calculateTotals();
    const finalPriceEl = document.querySelector('.final-price-display strong');
    const discountDisplayEl = document.querySelector('.discount-display');
    const finalConfigEl = document.querySelector('.final-config-display');

    if (finalPriceEl) {
        finalPriceEl.textContent = `¥ ${totals.finalPrice.toFixed(2)}`;
    }
    if (discountDisplayEl) {
        discountDisplayEl.textContent = totals.appliedDiscountLabel;
    }
    if (finalConfigEl) {
        (finalConfigEl as HTMLTextAreaElement).value = getFinalConfigText() || '未选择配件';
    }
}


function calculateTotals() {
    if (state.appStatus !== 'ready') return { finalPrice: 0, appliedDiscountLabel: '无折扣' };
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
    const totalQuantity = [...Object.values(state.selection), ...state.customItems].reduce((acc, { quantity }) => acc + quantity, 0);

    const sortedTiers = [...(state.priceData.tieredDiscounts || [])].sort((a, b) => b.threshold - a.threshold);
    let appliedRate = 1.0;
    let appliedDiscountLabel = '无折扣';
    const applicableTier = sortedTiers.find(tier => tier.threshold > 0 && totalQuantity >= tier.threshold);
    if (applicableTier) {
        appliedRate = applicableTier.rate / 10;
        appliedDiscountLabel = `满 ${applicableTier.threshold} 件, 打 ${applicableTier.rate} 折`;
    }

    const selectedMarkupPoint = state.priceData.markupPoints.find(p => p.id === state.markupPoints);
    const markupValue = selectedMarkupPoint ? selectedMarkupPoint.value : 0;
    const priceBeforeDiscount = costTotal * (1 + markupValue / 100);
    let finalPrice = priceBeforeDiscount * appliedRate - state.specialDiscount;
    finalPrice = Math.max(0, finalPrice);
    if (finalPrice > 0) {
        const intPrice = Math.floor(finalPrice);
        const lastTwoDigits = intPrice % 100;
        finalPrice = (lastTwoDigits > 50) ? (Math.floor(intPrice / 100) * 100) + 99 : (Math.floor(intPrice / 100) * 100) + 50;
    }
    return { finalPrice, appliedDiscountLabel };
}

function getFinalConfigText() {
    const parts = [
        ...Object.entries(state.selection).filter(([_, { model, quantity }]) => model && quantity > 0)
            .map(([_, { model, quantity }]) => `${model} * ${quantity}`),
        ...state.customItems.filter(item => item.model && item.quantity > 0)
            .map(item => `${item.model} * ${item.quantity}`)
    ];
    return parts.join(' | ');
}

function handleMatchConfig() {
    const input = ($('#matcher-input') as HTMLInputElement).value;
    if (!input) return;
    const newSelection = getInitialSelection();
    const allModels = Object.entries(state.priceData.prices)
        .flatMap(([category, models]) => Object.keys(models).map(model => ({ model, category, normalizedModel: model.toLowerCase().replace(/\s/g, '') })))
        .sort((a, b) => b.model.length - a.model.length);
    let processedInput = input;
    const plusIndex = processedInput.indexOf('+');
    if (plusIndex > -1) {
        const hddComponent = processedInput.split(/[\\/|]/).find(c => c.includes('+'));
        if (hddComponent) {
            const [part1Str, part2Str] = hddComponent.split('+').map(p => p.trim());
            const hddModels = allModels.filter(m => m.category === '硬盘');
            const model1 = hddModels.find(m => part1Str.toLowerCase().replace(/\s/g, '').includes(m.normalizedModel));
            const model2 = hddModels.find(m => part2Str.toLowerCase().replace(/\s/g, '').includes(m.normalizedModel));
            if (model1) newSelection['硬盘1'].model = model1.model;
            if (model2) newSelection['硬盘2'].model = model2.model;
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
                if (availableSlot) targetCategory = availableSlot; else continue;
            }
            if (newSelection[targetCategory] && !newSelection[targetCategory].model) {
                newSelection[targetCategory].model = model;
                const regex = new RegExp(`(${model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${normalizedModel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})[^/|\\\\]*?[*x]\\s*(\\d+)`, 'i');
                const match = input.match(regex);
                if (match && match[2]) newSelection[targetCategory].quantity = parseInt(match[2], 10);
                tempInput = tempInput.replace(normalizedModel, ' '.repeat(normalizedModel.length));
            }
        }
    }
    state.selection = newSelection;
    renderApp();
}

function handleExportExcel() {
    const totals = calculateTotals();
    const configParts = [...Object.values(state.selection), ...state.customItems]
        .filter(({ model, quantity }) => model && quantity > 0).map(({ model }) => model);
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
        [], [], [], [],
        [null, null, null, '北京龙盛天地科技有限公司报价表'],
        [null, null, null, '地址: 北京市海淀区清河路164号1号院'],
        [null, null, null, '电话: 010-51654433-8013 传真: 010-82627270'],
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    worksheet['!cols'] = [{ wch: 15 }, { wch: 60 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 25 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '报价单');
    XLSX.writeFile(workbook, '龙盛科技报价单.xlsx');
}


async function withButtonLoading(button: HTMLButtonElement, action: () => Promise<any>) {
    const originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span>`;
    try {
        await action();
        button.innerHTML = '已保存 ✓';
        button.style.backgroundColor = '#16a34a';
    } catch (error: any) {
        button.innerHTML = '失败!';
        button.style.backgroundColor = '#ef4444';
        showModal({ title: '操作失败', message: error.message });
    } finally {
        setTimeout(() => {
            button.disabled = false;
            button.innerHTML = originalText;
            button.style.backgroundColor = '';
        }, 2000);
    }
}

function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
    let timeout: number;
    return (...args: Parameters<F>): void => {
        clearTimeout(timeout);
        timeout = window.setTimeout(() => func(...args), waitFor);
    };
}

async function setSyncStatus(status: AppState['syncStatus'], duration = 1500) {
    state.syncStatus = status;
    const statusEl = $('#sync-status');
    if (statusEl) {
        const syncStatusMessages = { idle: '', saving: '正在保存...', saved: '已同步 ✓', error: '保存出错!' };
        statusEl.className = status;
        statusEl.textContent = syncStatusMessages[status];
    }
    if (status === 'saved' || status === 'error') {
        setTimeout(() => {
            if (state.syncStatus === status) setSyncStatus('idle');
        }, duration);
    }
}


function addEventListeners() {
    appContainer.addEventListener('submit', async (e) => {
        e.preventDefault();
        const target = e.target as HTMLFormElement;

        if (target.id === 'login-form') {
            const username = (target.elements.namedItem('username') as HTMLInputElement).value;
            const password = (target.elements.namedItem('password') as HTMLInputElement).value;
            const loginButton = target.querySelector('.auth-button') as HTMLButtonElement;
            const errorDiv = $('#login-error') as HTMLDivElement;

            loginButton.disabled = true;
            loginButton.innerHTML = `<span class="spinner"></span> 正在登录`;
            errorDiv.style.display = 'none';

            try {
                const { data: email, error: rpcError } = await supabase.rpc('get_email_by_username', { p_username: username });
                if (rpcError) throw new Error('用户名或密码错误。');
                if (!email) throw new Error('用户名或密码错误。');
                const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
                if (signInError) throw signInError;

            } catch (err: any) {
                errorDiv.textContent = '用户名或密码错误。';
                errorDiv.style.display = 'block';
                loginButton.disabled = false;
                loginButton.innerHTML = '登录';
            }
        } else if (target.id === 'register-form') {
            const username = (target.elements.namedItem('username') as HTMLInputElement).value;
            const password = (target.elements.namedItem('password') as HTMLInputElement).value;
            const registerButton = target.querySelector('.auth-button') as HTMLButtonElement;
            const errorDiv = $('#register-error') as HTMLDivElement;

            registerButton.disabled = true;
            registerButton.innerHTML = `<span class="spinner"></span> 正在注册`;
            errorDiv.style.display = 'none';

            try {
                const email = `${username.replace(/\s/g, '_')}@quotesystem.local`;

                const { data: { user }, error: signUpError } = await supabase.auth.signUp({ email, password });
                if (signUpError) throw signUpError;
                if (!user) throw new Error('无法创建用户。');

                const { error: profileError } = await supabase.from('profiles').insert({
                    id: user.id,
                    full_name: username,
                    role: 'sales', 
                    is_approved: false
                });
                if (profileError) {
                    console.error("Failed to create profile after signup:", profileError);
                    throw new Error("注册失败，请联系管理员。");
                }
                
                showModal({
                    title: '注册成功',
                    message: '您的账户已创建，请等待管理员审核批准后即可登录。',
                    onConfirm: () => {
                        state.view = 'login';
                        renderApp();
                    }
                });

            } catch(err: any) {
                errorDiv.textContent = err.message || '注册时发生未知错误。';
                errorDiv.style.display = 'block';
            } finally {
                registerButton.disabled = false;
                registerButton.innerHTML = '注册';
            }

        } else if (target.id === 'quick-add-form') {
            const category = ($('#quick-add-category-input') as HTMLInputElement).value.trim();
            const model = ($('#quick-add-model') as HTMLInputElement).value.trim();
            const price = parseFloat(($('#quick-add-price') as HTMLInputElement).value);
            const button = target.querySelector('button') as HTMLButtonElement;
            if (!category || !model || isNaN(price)) {
                showModal({ title: '输入错误', message: '请填写所有字段并确保价格有效。' });
                return;
            }

            await withButtonLoading(button, async () => {
                 const { error } = await supabase.from('quote_items').upsert(
                    { category, model, price }, { onConflict: 'category,model' }
                 );
                 if (error) {
                    showModal({ title: '添加失败', message: `无法添加配件，请检查数据库权限设置(RLS)。\n错误: ${error.message}` });
                    throw error;
                 }
                 if (!state.priceData.prices[category]) state.priceData.prices[category] = {};
                 state.priceData.prices[category][model] = price;
                 renderApp();
                 target.reset();
                 ($('#quick-add-category-input') as HTMLInputElement).focus();
            });
        }
    });

    appContainer.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const link = target.closest('a');
        if (link) {
            if (link.id === 'go-to-register') {
                e.preventDefault();
                state.view = 'register';
                renderApp();
                return;
            } else if (link.id === 'go-to-login') {
                e.preventDefault();
                state.view = 'login';
                renderApp();
                return;
            }
        }

        const button = target.closest('button');
        if (!button) return;
        
        let needsRender = false;

        if (button.id === 'logout-btn') {
            const { error } = await supabase.auth.signOut();
            if (error) {
                console.error("Logout failed:", error);
                showModal({ title: '退出失败', message: `无法退出系统: ${error.message}` });
            }
        } else if (button.id === 'import-excel-btn') {
            ($('#import-file-input') as HTMLInputElement)?.click();
        } else if (button.id === 'add-markup-point-btn') {
            const { data, error } = await supabase.from('quote_markups').insert({ alias: '新点位', value: 0 }).select().single();
            if (error) {
                showModal({ title: '错误', message: `无法添加点位: ${error.message}` });
            } else {
                state.priceData.markupPoints.push(data);
                needsRender = true;
            }
        } else if (button.id === 'add-tier-btn') {
            const { data, error } = await supabase.from('quote_discounts').insert({ threshold: 0, rate: 10 }).select().single();
            if (error) {
                showModal({ title: '错误', message: `无法添加折扣: ${error.message}` });
            } else {
                state.priceData.tieredDiscounts.push(data);
                needsRender = true;
            }
        } else if (button.classList.contains('remove-markup-point-btn')) {
            const id = button.dataset.id;
            if (!id) return;
            showModal({ title: '确认删除', message: `确定要删除此点位吗？`, isDanger: true, showCancel: true, confirmText: '删除',
                onConfirm: async () => {
                    const { error } = await supabase.from('quote_markups').delete().eq('id', id);
                    if (error) { showModal({ title: '删除失败', message: error.message }); }
                    else {
                        state.priceData.markupPoints = state.priceData.markupPoints.filter(p => p.id !== parseInt(id));
                        renderApp();
                    }
                }
            });
        } else if (button.classList.contains('remove-tier-btn')) {
            const id = button.dataset.id;
            if (!id) return;
            showModal({ title: '确认删除', message: `确定要删除此折扣阶梯吗？`, isDanger: true, showCancel: true, confirmText: '删除',
                onConfirm: async () => {
                    const { error } = await supabase.from('quote_discounts').delete().eq('id', id);
                    if (error) { showModal({ title: '删除失败', message: error.message }); }
                    else {
                        state.priceData.tieredDiscounts = state.priceData.tieredDiscounts.filter(t => t.id !== parseInt(id));
                        renderApp();
                    }
                }
            });
        } else if (button.id === 'user-management-btn') {
            state.view = 'userManagement';
            needsRender = true;
        } else if (button.id === 'app-view-toggle-btn') {
            state.view = 'admin';
            needsRender = true;
        } else if (button.id === 'back-to-quote-btn') {
            state.view = 'quote';
            needsRender = true;
        } else if (button.id === 'reset-btn') {
            state.selection = getInitialSelection();
            state.customItems = [];
            state.newCategory = '';
            state.specialDiscount = 0;
            state.markupPoints = state.priceData.markupPoints[0]?.id || 0;
            needsRender = true;
        } else if (button.classList.contains('approve-user-btn')) {
            const userId = button.closest('tr')?.dataset.userId;
            if (!userId) return;
            const { error } = await supabase.from('profiles').update({ is_approved: true }).eq('id', userId);
            if (error) {
                showModal({ title: '错误', message: `批准用户失败: ${error.message}` });
            } else {
                const profile = state.profiles.find(p => p.id === userId);
                if (profile) profile.is_approved = true;
                needsRender = true;
            }
        } else if (button.classList.contains('delete-user-btn')) {
            const row = button.closest('tr');
            const userId = row?.dataset.userId;
            const userName = row?.querySelector('td:first-child')?.textContent;
            if (!userId || !userName) return;

            showModal({
                title: '确认删除用户',
                message: `您确定要永久删除用户 "${userName}" 吗？此操作无法撤销。`,
                isDanger: true,
                showCancel: true,
                confirmText: '确认删除',
                onConfirm: async () => {
                    const { error } = await supabase.rpc('delete_user', { user_id: userId });
                    if (error) {
                        showModal({ title: '删除失败', message: error.message });
                    } else {
                        state.profiles = state.profiles.filter(p => p.id !== userId);
                        renderApp();
                    }
                }
            });

        } else if (button.classList.contains('admin-delete-item-btn')) {
            const { category, model } = button.dataset;
            if (!category || !model) return;
            showModal({
                title: '确认删除', message: `确定要删除 "${category} - ${model}" 吗？`, showCancel: true, isDanger: true, confirmText: '删除',
                onConfirm: async () => {
                     const { error } = await supabase.from('quote_items').delete().match({ category, model });
                     if(error) { showModal({ title: '删除失败', message: error.message }); } 
                     else {
                        if (state.priceData.prices[category]) delete state.priceData.prices[category][model];
                        renderApp();
                     }
                }
            });
        }
        else if (button.classList.contains('admin-save-item-btn')) {
            const row = button.closest('tr');
            if (!row) return;
            const { category, model } = row.dataset;
            if (!category || !model) {
                showModal({ title: '保存错误', message: '无法保存项目：缺少类别或型号信息。' });
                return;
            }
            const newPrice = parseFloat((row.querySelector('.price-input') as HTMLInputElement).value);
            await withButtonLoading(button, async () => {
                const { error } = await supabase.from('quote_items').update({ price: newPrice }).match({ category, model });
                if (error) throw error;
                if (state.priceData.prices[category]) {
                    state.priceData.prices[category][model] = newPrice;
                }
            });
        } else if (button.id === 'generate-quote-btn') {
            handleExportExcel();
        } else if (button.id === 'match-config-btn') {
            handleMatchConfig();
        }
        
        if (needsRender) {
            renderApp();
        }
    });

    const handleAdminDataUpdate = debounce(async (target: HTMLInputElement) => {
        const row = target.closest('.tier-row, .markup-point-row');
        if (!row) return;

        const id = parseInt((row as HTMLElement).dataset.id || '');
        if (isNaN(id)) return;

        setSyncStatus('saving');
        let error: PostgrestError | null = null;

        if (row.classList.contains('tier-row')) {
            const threshold = parseFloat((row.querySelector('.tier-threshold-input') as HTMLInputElement)?.value || '0');
            const rate = parseFloat((row.querySelector('.tier-rate-input') as HTMLInputElement)?.value || '10');
            ({ error } = await supabase.from('quote_discounts').update({ threshold, rate }).eq('id', id));
        } else if (row.classList.contains('markup-point-row')) {
            const alias = (row.querySelector('.markup-alias-input') as HTMLInputElement)?.value || '';
            const value = parseFloat((row.querySelector('.markup-value-input') as HTMLInputElement)?.value || '0');
            ({ error } = await supabase.from('quote_markups').update({ alias, value }).eq('id', id));
        }
        
        if (error) {
            setSyncStatus('error');
            console.error(error);
        } else {
            setSyncStatus('saved');
        }

    }, 700);

    appContainer.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;

        if (target.closest('#tiered-discount-list, #markup-points-list')) {
            handleAdminDataUpdate(target);
            return;
        }

        if (target.id === 'admin-search-input') {
            state.adminSearchTerm = target.value;
            renderApp();
            return;
        }

        if (target.id === 'special-discount-input') {
            state.specialDiscount = Math.max(0, Number(target.value));
            updateTotalsUI();
            return;
        }
        
        const row = target.closest('tr');
        if (row && (target.classList.contains('quantity-input') || target.classList.contains('custom-quantity-input'))) {
            const quantity = Math.max(0, parseInt(target.value, 10) || 0);
            if (row.dataset.category) {
                state.selection[row.dataset.category].quantity = quantity;
            } else if (row.dataset.customId) {
                const customId = parseInt(row.dataset.customId, 10);
                const item = state.customItems.find(i => i.id === customId);
                if (item) item.quantity = quantity;
            }
            updateTotalsUI();
            return;
        }

        if (target.id === 'new-category-input') {
            state.newCategory = target.value;
        }
    });

    appContainer.addEventListener('change', async (e) => {
        const target = e.target as HTMLSelectElement | HTMLInputElement;

        if (target.id === 'import-file-input') {
            const file = (target as HTMLInputElement).files?.[0];
            if (!file) return;
            const fileNameDisplay = $('#file-name-display');
            if(fileNameDisplay) fileNameDisplay.textContent = file.name;
            
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const data = event.target?.result;
                    const workbook = XLSX.read(data, { type: 'binary' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const json: (string|number)[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    
                    if (json.length < 2) throw new Error('Excel文件为空或缺少标题行。');
                    
                    const headers = json[0].map(h => String(h).trim());
                    const categoryIndex = headers.findIndex(h => ['分类', 'Category'].includes(h));
                    const modelIndex = headers.findIndex(h => ['型号', 'Model'].includes(h));
                    const priceIndex = headers.findIndex(h => ['单价', '成本', 'Price', 'Cost'].includes(h));

                    if (categoryIndex === -1 || modelIndex === -1 || priceIndex === -1) {
                        throw new Error('Excel文件必须包含 "分类", "型号", 和 "单价" 这几列。');
                    }

                    const itemsToUpsert = json.slice(1).map(row => ({
                        category: String(row[categoryIndex]).trim(),
                        model: String(row[modelIndex]).trim(),
                        price: parseFloat(String(row[priceIndex])),
                    })).filter(item => item.category && item.model && !isNaN(item.price));

                    if (itemsToUpsert.length === 0) throw new Error('未在文件中找到有效的数据行。');
                    
                    const { error } = await supabase.from('quote_items').upsert(itemsToUpsert, { onConflict: 'category,model' });
                    if (error) throw error;
                    
                    itemsToUpsert.forEach(item => {
                        if (!state.priceData.prices[item.category]) state.priceData.prices[item.category] = {};
                        state.priceData.prices[item.category][item.model] = item.price;
                    });
                    
                    showModal({ title: '导入成功', message: `成功导入/更新了 ${itemsToUpsert.length} 个配件。`});
                    renderApp();

                } catch (err: any) {
                    showModal({ title: '导入失败', message: err.message, isDanger: true });
                } finally {
                    (target as HTMLInputElement).value = '';
                    if(fileNameDisplay) fileNameDisplay.textContent = '';
                }
            };
            reader.readAsBinaryString(file);
            return;
        }

        const row = target.closest('tr');
        if (target.id === 'markup-points-select') {
            state.markupPoints = Number(target.value);
            updateTotalsUI();
        } else if (row?.dataset.category && target.classList.contains('model-select')) {
            state.selection[row.dataset.category].model = (target as HTMLSelectElement).value;
            updateTotalsUI();
        } else if (target.classList.contains('user-role-select')) {
            const userId = (target as HTMLSelectElement).closest('tr')?.dataset.userId;
            if (!userId) return;
            const newRole = (target as HTMLSelectElement).value as 'admin' | 'sales';
            const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
            if (error) {
                showModal({ title: '错误', message: `更新角色失败: ${error.message}` });
                (target as HTMLSelectElement).value = state.profiles.find(p => p.id === userId)?.role || 'sales';
            } else {
                const profile = state.profiles.find(p => p.id === userId);
                if (profile) profile.role = newRole;
            }
        }
    });
}

// FIX: Changed function to return a boolean indicating success or failure.
async function loadAllData(): Promise<boolean> {
    try {
        const { data: itemsData, error: itemsError } = await supabase.from('quote_items').select('*');
        if (itemsError) throw itemsError;

        const { data: discountsData, error: discountsError } = await supabase.from('quote_discounts').select('*');
        if (discountsError) throw discountsError;

        const { data: markupsData, error: markupsError } = await supabase.from('quote_markups').select('*');
        if (markupsError) throw markupsError;

        state.priceData.prices = (itemsData || []).reduce((acc, item) => {
            if (!acc[item.category]) acc[item.category] = {};
            acc[item.category][item.model] = item.price;
            return acc;
        }, {} as Prices);

        state.priceData.tieredDiscounts = discountsData || [];
        state.priceData.markupPoints = markupsData || [];
        
        if (state.priceData.markupPoints.length > 0 && state.markupPoints === 0) {
            state.markupPoints = state.priceData.markupPoints[0].id;
        }

        state.appStatus = 'ready';
        return true;
    } catch (error: any) {
        state.appStatus = 'error';
        state.errorMessage = `
            <h3 style="color: #b91c1c; margin-top:0;">无法加载应用数据</h3>
            <p>登录成功，但无法获取报价所需的核心数据。这通常是由于数据库权限问题导致的。</p>
            <h4>解决方案：</h4>
            <p>请确保已为 <strong>登录用户</strong> 开启了读取 <code>quote_items</code>, <code>quote_discounts</code>, 和 <code>quote_markups</code> 这三个表的权限。请前往您的 Supabase SQL Editor 运行以下命令，然后刷新页面重新登录：</p>
            <pre style="background-color: #e2e8f0; padding: 1rem; border-radius: 6px; text-align: left;"><code>CREATE POLICY "Authenticated users can read all quote items" ON public.quote_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all quote discounts" ON public.quote_discounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all quote markups" ON public.quote_markups FOR SELECT TO authenticated USING (true);</code></pre>
            <p><strong>重要提示:</strong> 如果您之前创建了 "Public can read..." 策略，这些新策略是必需的，因为现在是由已登录用户而非匿名公众来读取数据。</p>
            <p style="margin-top: 1rem;">原始错误: ${error.message}</p>`;
        state.currentUser = null;
        return false;
    }
}

supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('id, full_name, role, is_approved')
            .eq('id', session.user.id)
            .single();

        if (error) {
            state.currentUser = null;
            state.appStatus = 'error';
            state.errorMessage = `无法获取您的用户资料: ${error.message}. 这可能是数据库权限问题。请确保您为 'profiles' 表启用了RLS，并设置了允许用户读取自己的数据。`;
            renderApp();
            return;
        }

        if (profile) {
            if (!profile.is_approved && profile.role !== 'admin') {
                showModal({
                    title: '账户待审批',
                    message: '您的账户正在等待管理员批准，请稍后再试。',
                    onConfirm: async () => { await supabase.auth.signOut(); }
                });
                return;
            }

            state.appStatus = 'loading';
            renderApp();

            const loadedSuccessfully = await loadAllData(); 

            if (loadedSuccessfully) {
                state.currentUser = { ...profile, auth: session.user };
                if (profile.role === 'admin') {
                    const { data: allProfiles, error: profilesError } = await supabase.from('profiles').select('*');
                    state.profiles = profilesError ? [profile] : (allProfiles || []);
                } else {
                    state.profiles = [profile];
                }
                state.view = 'quote';
            }
        } else {
            showModal({
                title: '登录错误',
                message: '您的账户存在，但未能找到对应的用户资料。请联系管理员。',
                onConfirm: async () => { await supabase.auth.signOut(); }
            });
            return;
        }
    } else {
        state.appStatus = 'ready';
        state.currentUser = null;
        state.profiles = [];
        state.view = 'login';
    }
    
    renderApp();
});

addEventListeners();
// Initial load check, if no user, render login page.
(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        state.appStatus = 'ready';
        renderApp();
    }
})();