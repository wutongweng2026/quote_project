// --- SUPABASE CLIENT ---
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';
const supabaseUrl = SUPABASE_URL;
const supabaseKey = SUPABASE_ANON_KEY;

import { createClient, SupabaseClient, User as AuthUser, PostgrestError } from '@supabase/supabase-js';

// --- TYPES ---
interface PriceDataItem { [model: string]: number; }
interface Prices { [category: string]: PriceDataItem; }

// Database-first types matching your new schema
interface DbQuoteItem { id: number; category: string; model: string; price: number; }
interface DbDiscount { id: number; threshold: number; rate: number; }
interface DbMarkupPoint { id: number; alias: string; value: number; }
// This matches your 'profiles' table
interface DbProfile { id: string; full_name: string | null; role: 'admin' | 'sales'; }

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
    title: string; message: string; onConfirm: (() => void) | null;
    confirmText: string; cancelText: string; showCancel: boolean; isDanger: boolean;
    inputType?: 'text' | 'password'; errorMessage?: string;
}

interface AppState {
    appStatus: 'loading' | 'ready' | 'error';
    errorMessage: string | null;
    priceData: PriceData;
    profiles: DbProfile[];
    view: 'login' | 'quote' | 'admin';
    currentUser: CurrentUser | null;
    selection: SelectionState;
    customItems: CustomItem[];
    newCategory: string;
    specialDiscount: number;
    markupPoints: number;
    adminSearchTerm: string;
    showCustomModal: boolean;
    customModal: CustomModalState;
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
};

// --- DOM SELECTORS ---
const $ = (selector: string) => document.querySelector(selector);
const appContainer = $('#app')!;

// --- RENDER FUNCTIONS ---
function render() {
    let html = '';
    if (state.appStatus === 'loading') {
        html = `<div class="app-status-container"><div class="loading-spinner"></div><h2>正在连接...</h2></div>`;
    } else if (state.appStatus === 'error') {
        html = `<div class="app-status-container"><h2>加载失败</h2><div class="error-details"><strong>错误信息:</strong> ${state.errorMessage}</div></div>`;
    } else if (!state.currentUser) {
        html = renderLoginView();
    } else if (state.view === 'quote') {
        html = renderQuoteTool();
    } else if (state.view === 'admin' && state.currentUser.role === 'admin') {
        html = renderAdminPanel();
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
                        <label for="email">邮箱</label>
                        <input type="email" id="email" name="email" required autocomplete="email">
                    </div>
                    <div class="auth-input-group">
                        <label for="password">密码</label>
                        <input type="password" id="password" name="password" required autocomplete="current-password">
                    </div>
                    <button type="submit" class="auth-button">登录</button>
                </form>
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

    return `
    <div class="adminContainer">
        <header class="adminHeader">
            <h2>系统管理后台</h2>
            <div class="header-actions-admin"> <button id="back-to-quote-btn" class="admin-button">返回报价首页</button> </div>
        </header>
        <div class="admin-content">
            <div class="admin-section">
                <h3 class="admin-section-header">用户管理</h3>
                <div class="admin-section-body">
                    <p style="color: var(--secondary-text-color); font-size: 0.9rem; margin-top: 0;">为保障安全，请在 Supabase 后台直接管理用户。</p>
                    <table class="admin-data-table">
                        <thead><tr><th>Full Name</th><th>Role</th></tr></thead>
                        <tbody>
                            ${state.profiles.map(profile => `
                                <tr>
                                    <td>${profile.full_name || 'N/A'}</td>
                                    <td>${profile.role}</td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="admin-section">
                <h3 class="admin-section-header">点位管理</h3>
                <div class="admin-section-body">
                     <p style="color: var(--secondary-text-color); font-size: 0.9rem; margin-top: 0;">修改后将自动保存。</p>
                    <div id="markup-points-list">
                        ${state.priceData.markupPoints.map(point => `
                            <div class="markup-point-row" data-id="${point.id}">
                                <input type="text" class="markup-alias-input" value="${point.alias}" placeholder="别名">
                                <input type="number" class="markup-value-input" value="${point.value}" placeholder="点数">
                                <span>点</span>
                                <button class="remove-markup-point-btn" data-id="${point.id}">删除</button>
                            </div>
                        `).join('')}
                    </div>
                     <div class="markup-point-row" style="margin-top: 1rem;"> <button id="add-markup-point-btn">添加新点位</button> </div>
                </div>
            </div>
            <div class="admin-section">
                <h3 class="admin-section-header">折扣阶梯管理</h3>
                <div class="admin-section-body">
                    <p style="color: var(--secondary-text-color); font-size: 0.9rem; margin-top: 0;">修改后将自动保存。</p>
                    <div id="tiered-discount-list">
                        ${state.priceData.tieredDiscounts.map(tier => `
                            <div class="tier-row" data-id="${tier.id}">
                                <span>满</span> <input type="number" class="tier-threshold-input" value="${tier.threshold}" placeholder="数量">
                                <span>件, 打</span> <input type="number" step="0.01" class="tier-rate-input" value="${tier.rate}" placeholder="折扣率">
                                <span>折</span> <button class="remove-tier-btn" data-id="${tier.id}">删除</button>
                            </div>
                        `).join('')}
                    </div>
                     <div class="tier-row" style="margin-top: 1rem;"> <button id="add-tier-btn" class="add-tier-btn">添加新折扣阶梯</button> </div>
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

// --- LOGIC & EVENT HANDLERS ---
function showModal(options: Partial<CustomModalState>) {
    state.customModal = {
        title: '提示', message: '', onConfirm: null, confirmText: '确定',
        cancelText: '取消', showCancel: false, isDanger: false, errorMessage: '', ...options
    };
    state.showCustomModal = true;
    render();
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
        appliedRate = applicableTier.rate;
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
    render();
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


function addEventListeners() {
    appContainer.addEventListener('submit', async (e) => {
        e.preventDefault();
        const target = e.target as HTMLFormElement;

        if (target.id === 'login-form') {
            const email = (target.elements.namedItem('email') as HTMLInputElement).value;
            const password = (target.elements.namedItem('password') as HTMLInputElement).value;
            const loginButton = target.querySelector('.auth-button') as HTMLButtonElement;
            const errorDiv = $('#login-error') as HTMLDivElement;

            loginButton.disabled = true;
            loginButton.innerHTML = `<span class="spinner"></span> 正在登录`;
            errorDiv.style.display = 'none';

            try {
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
                if (!data.user) throw new Error('登录失败，请重试。');
                
                // After successful login, insert a log
                await supabase.from('login_logs').insert({
                    user_id: data.user.id,
                    user_agent: navigator.userAgent
                });

            } catch (err: any) {
                errorDiv.textContent = err.message || '登录时发生错误';
                errorDiv.style.display = 'block';
                loginButton.disabled = false;
                loginButton.innerHTML = '登录';
            }
        }
        else if (target.id === 'quick-add-form') {
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
                    { category, model, price },
                    { onConflict: 'category,model' }
                 );
                 if (error) throw error;
                 
                 await loadAllData(true); // partial refresh
                 target.reset();
                 ($('#quick-add-category-input') as HTMLInputElement).focus();
            });
        }
    });

    appContainer.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const button = target.closest('button');
        if (!button) return;

        if (button.id === 'logout-btn') {
            await supabase.auth.signOut();
        } else if (button.id === 'app-view-toggle-btn') {
            state.view = 'admin';
            render();
        } else if (button.id === 'back-to-quote-btn') {
            state.view = 'quote';
            render();
        } else if (button.id === 'reset-btn') {
            state.selection = getInitialSelection();
            state.customItems = [];
            state.newCategory = '';
            state.specialDiscount = 0;
            state.markupPoints = state.priceData.markupPoints[0]?.id || 0;
            render();
        } 
        else if (button.classList.contains('admin-delete-item-btn')) {
            const { category, model } = button.dataset;
            if (!category || !model) {
                showModal({ title: '错误', message: '无法删除：缺少必要的项目信息。' });
                return;
            }
            showModal({
                title: '确认删除', message: `确定要删除 "${category} - ${model}" 吗？`, showCancel: true, isDanger: true, confirmText: '删除',
                onConfirm: async () => {
                     const { error } = await supabase.from('quote_items').delete().match({ category, model });
                     if(error) {
                        showModal({ title: '删除失败', message: error.message });
                     } else {
                        if (state.priceData.prices[category]) {
                            delete state.priceData.prices[category][model];
                            if (Object.keys(state.priceData.prices[category]).length === 0) {
                                delete state.priceData.prices[category];
                            }
                        }
                        render();
                     }
                }
            });
        }
        else if (button.classList.contains('admin-save-item-btn')) {
            const row = button.closest('tr');
            if(!row) return;
            const { category, model } = row.dataset;
            if (!category || !model) {
                showModal({ title: '错误', message: '无法保存：缺少必要的项目信息。' });
                return;
            }
            const newPrice = parseFloat((row.querySelector('.price-input') as HTMLInputElement).value);
            
            await withButtonLoading(button, async () => {
                const { error } = await supabase.from('quote_items').update({ price: newPrice }).match({ category, model });
                if (error) throw error;
                if(state.priceData.prices[category]){
                    state.priceData.prices[category][model] = newPrice;
                }
            });
        } else if (button && button.id === 'generate-quote-btn') {
            handleExportExcel();
        } else if (button && button.id === 'match-config-btn') {
            handleMatchConfig();
        }
    });

    appContainer.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.id === 'admin-search-input') {
            state.adminSearchTerm = target.value;
            render();
        } else if (target.id === 'special-discount-input' || target.classList.contains('quantity-input')) {
            if (target.id === 'special-discount-input') state.specialDiscount = Math.max(0, Number(target.value));
            const row = target.closest('tr');
            if (row && row.dataset.category) {
                 state.selection[row.dataset.category].quantity = Math.max(0, parseInt((row.querySelector('.quantity-input') as HTMLInputElement).value, 10) || 0);
            }
            render();
        }
    });

    appContainer.addEventListener('change', (e) => {
        const target = e.target as HTMLSelectElement;
        const row = target.closest('tr');
        if (target.id === 'markup-points-select') {
            state.markupPoints = Number(target.value);
            render();
        } else if (row && row.dataset.category && target.classList.contains('model-select')) {
            state.selection[row.dataset.category].model = target.value;
            render();
        }
    });
}

// --- INITIALIZATION ---
async function loadAllData(partialRefresh = false) {
    try {
        const requiredFetches = [
            supabase.from('quote_items').select('*'),
            supabase.from('quote_discounts').select('*'),
            supabase.from('quote_markups').select('*')
        ];

        if (!partialRefresh) {
            requiredFetches.push(supabase.from('profiles').select('*'));
        }

        const [itemsRes, discountsRes, markupsRes, profilesRes] = await Promise.all(requiredFetches);
        
        const errors = [itemsRes.error, discountsRes.error, markupsRes.error, profilesRes?.error].filter((e): e is PostgrestError => !!e);
        if (errors.length > 0) throw new Error(errors.map(e => e.message).join(', '));

        const itemsData: DbQuoteItem[] = itemsRes.data || [];
        state.priceData.prices = itemsData.reduce((acc, item) => {
            if (!acc[item.category]) acc[item.category] = {};
            acc[item.category][item.model] = item.price;
            return acc;
        }, {} as Prices);

        state.priceData.tieredDiscounts = discountsRes.data || [];
        state.priceData.markupPoints = markupsRes.data || [];
        if (!partialRefresh) {
            state.profiles = profilesRes.data || [];
        }

        if (state.priceData.markupPoints.length > 0 && state.markupPoints === 0) {
            state.markupPoints = state.priceData.markupPoints[0].id;
        }

        state.appStatus = 'ready';
    } catch (error: any) {
        state.appStatus = 'error';
        state.errorMessage = error.message;
        state.currentUser = null; // Log out on data fetch error
    }
    render();
}

supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
        // User is logged in, fetch their profile
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('id, full_name, role')
            .eq('id', session.user.id)
            .single();

        if (error) {
            state.appStatus = 'error';
            state.errorMessage = `Could not fetch user profile: ${error.message}`;
            state.currentUser = null;
        } else if (profile) {
            state.currentUser = { ...profile, auth: session.user };
            if (state.appStatus !== 'ready') {
                await loadAllData();
            }
        }
    } else {
        // User is logged out
        state.currentUser = null;
    }
    render();
});

addEventListeners();
// Initial load is now handled by the onAuthStateChange listener
