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
    view: 'quote' | 'admin';
    selection: SelectionState;
    customItems: CustomItem[];
    newCategory: string;
    specialDiscount: number;
    markupPoints: number;
    adminSearchTerm: string;
    pendingFile: File | null;
    showLoginModal: boolean;
    loginError: string | null;
    showCustomModal: boolean;
    customModal: CustomModalState;
    appStatus: 'loading' | 'ready' | 'error';
    errorDetails: string | null;
    syncStatus: 'idle' | 'saving' | 'saved' | 'error';
}

// --- SUPABASE CONFIG ---
// These values are now read from environment variables.
// Set them in your hosting provider (e.g., Vercel, Netlify).
// IMPORTANT: Environment variables for Vite MUST start with "VITE_".
//
// 1. VITE_SUPABASE_URL: Your project's URL (e.g., https://xxxxxxxx.supabase.co)
// 2. VITE_SUPABASE_ANON_KEY: Your project's public 'anon' key.
const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY;


// Declare the client, but initialize it inside initializeApp to prevent errors.
let supabaseClient: any;

// FIX: Declare the global 'supabase' object, which is likely loaded via a <script> tag.
// This removes the need for '@ts-ignore' during client initialization.
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
    view: 'quote',
    selection: getInitialSelection(),
    customItems: [],
    newCategory: '',
    specialDiscount: 0,
    markupPoints: 15,
    adminSearchTerm: '',
    pendingFile: null,
    showLoginModal: false,
    loginError: null,
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

    console.log("Saving data to Supabase...");
    const { error } = await supabaseClient
        .from('quote_data')
        .update({ data: dataToSave, updated_at: new Date().toISOString() })
        .eq('id', 1);

    if (error) {
        console.error("Error saving to Supabase:", error);
        state.syncStatus = 'error';
    } else {
        console.log("Data saved successfully.");
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
    if (state.view === 'quote') {
        html = renderQuoteTool();
    } else if (state.view === 'admin') {
        html = renderAdminPanel();
    }

    if (state.showLoginModal) {
        html += renderLoginModal();
    }
    if (state.showCustomModal) {
        html += renderCustomModal();
    }

    appContainer.innerHTML = html;
}

function renderLoadingScreen() {
    return `<div class="app-status-container"><h2>正在从云端加载数据...</h2></div>`;
}

function renderErrorScreen(message: string | null) {
    const displayMessage = message || "发生未知错误。";
    return `
        <div class="app-status-container">
            <h2>加载失败</h2>
            <pre>${displayMessage}</pre>
        </div>
    `;
}

function renderLoginModal() {
    return `
        <div class="modal-overlay" id="modal-overlay">
            <div class="modal-content">
                <h2>管理员登录</h2>
                <input type="password" id="password-input" class="modal-input" placeholder="请输入密码" autofocus />
                <div class="modal-error">${state.loginError || ''}</div>
                <div class="modal-buttons">
                    <button class="modal-cancel-btn" id="modal-cancel-btn">取消</button>
                    <button class="modal-confirm-btn" id="modal-confirm-btn">确定</button>
                </div>
            </div>
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
    const lastUpdated = state.priceData.lastUpdated;
    const formattedDate = lastUpdated ? `价格更新: ${new Date(lastUpdated).toLocaleString('zh-CN')}` : '';

    return `
        <div class="quoteContainer">
            <header class="quoteHeader">
                <h1>产品报价系统 <span>v1.01 - 龙盛科技</span></h1>
                <div class="header-actions">
                    <span class="update-timestamp">${formattedDate}</span>
                    <button class="admin-button" id="app-view-toggle-btn">${state.isLoggedIn ? '后台管理' : '后台登录'}</button>
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
    <div class="adminContainer">
        <header class="adminHeader">
            <h2>龙盛科技 系统管理后台 V1.01</h2>
            <div class="header-actions-admin">
                ${renderSyncStatus()}
                <button id="back-to-quote-btn" class="admin-button">返回报价首页</button>
            </div>
        </header>

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

    return { finalPrice, appliedRate, appliedDiscountLabel };
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
    let costTotal = 0;
    
    const rows = [
        ['类别', '规格型号', '成本单价', '数量', '成本小计']
    ];

    const allItems = [
        ...Object.entries(state.selection),
        ...state.customItems.map(item => [item.category, item] as [string, CustomItem])
    ];

    allItems.forEach(([category, { model, quantity }]) => {
        if (model && quantity > 0) {
            const dataCategory = category.startsWith('硬盘') ? '硬盘' : category;
            const cost = state.priceData.prices[dataCategory]?.[model] ?? 0;
            const subtotal = cost * quantity;
            costTotal += subtotal;
            rows.push([category, model, cost.toString(), quantity.toString(), subtotal.toString()]);
        }
    });

    rows.push([]); 
    rows.push(['', '', '', '总成本', costTotal.toString()]);
    // FIX: Changed String(state.markupPoints) to state.markupPoints.toString() to fix a type error where 'String' is not considered callable.
    rows.push(['', '', '', '点位', state.markupPoints.toString()]);
    rows.push(['', '', '', '折扣', totals.appliedRate.toString()]);
    rows.push(['', '', '', '特别立减', state.specialDiscount.toString()]);
    rows.push(['', '', '', '最终报价', totals.finalPrice.toString()]);

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
        link.setAttribute("download", "报价单.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
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

function handleLogin() {
    const passwordInput = ($('#password-input') as HTMLInputElement);
    const password = passwordInput.value;
    if (password === '112@') {
        state.isLoggedIn = true;
        state.showLoginModal = false;
        state.loginError = null;
        state.view = 'admin';
        render();
    } else {
        state.loginError = '密码错误！';
        render();
        passwordInput.focus();
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
    appContainer.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!target) return;
        
        const button = target.closest('button');
        const row = target.closest<HTMLTableRowElement>('tr');
        const tierRow = target.closest<HTMLElement>('.tier-row');

        if (target.id === 'modal-overlay' || target.id === 'custom-modal-overlay') {
             state.showLoginModal = false;
             state.showCustomModal = false;
             state.loginError = null;
             render();
             return;
        }

        if (button && button.id === 'modal-cancel-btn') {
            state.showLoginModal = false; state.loginError = null; render();
        } else if(button && button.id === 'custom-modal-cancel-btn') {
            state.showCustomModal = false; render();
        } else if (button && button.id === 'custom-modal-confirm-btn') {
            if (state.customModal.onConfirm) {
                state.customModal.onConfirm();
            }
            state.showCustomModal = false;
            render();
        } else if (button && button.id === 'modal-confirm-btn') {
            handleLogin();
        } else if (button && button.id === 'app-view-toggle-btn') {
            if (state.isLoggedIn) {
                state.view = 'admin';
                render();
            } else {
                state.showLoginModal = true;
                render();
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

            let csvContent = "\uFEFF"; // BOM for Excel compatibility
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

    appContainer.addEventListener('keydown', (e: any) => {
        if (state.showLoginModal && e.key === 'Enter') {
            e.preventDefault();
            handleLogin();
        }
    });
}

// --- INITIALIZATION ---
async function initializeApp() {
    render(); // Show loading screen
    
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        state.appStatus = 'error';
        state.errorDetails = `数据库连接配置错误！

请在您的 Vercel 项目设置中添加以下两个环境变量：

1.  **VITE_SUPABASE_URL**
    值为: https://pqsppjjmlwemkxyehuqz.supabase.co

2.  **VITE_SUPABASE_ANON_KEY**
    值为: sb_publishable_h1g0_kOLSqTlFQBXGPjOuQ_aeTtfbZw

---
**重要提示：**
- 变量名必须以 "VITE_" 开头。
- 请确保您使用的是 "Publishable key" (可发布密钥)，而不是危险的 "Secret Key"。
- 添加/修改变量后，您需要重新部署Vercel项目。
`;
        render();
        return;
    }

    // FIX: Removed @ts-ignore by declaring the global 'supabase' variable at the top of the file.
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    try {
        const { data, error } = await supabaseClient
            .from('quote_data')
            .select('data')
            .eq('id', 1)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found, which is ok on first run
            throw error;
        }

        if (data && data.data) {
            state.priceData = data.data;
        } else {
            // No data in DB, so this is the first run. Insert the default data.
            console.log("No data found in Supabase. Initializing with default data...");
            state.priceData = PRICE_DATA;
            const { error: insertError } = await supabaseClient
                .from('quote_data')
                .insert({ id: 1, data: PRICE_DATA });

            if (insertError) {
                throw insertError;
            }
        }
        state.appStatus = 'ready';
    } catch (e: any) {
        console.error("Failed to load data from Supabase:", e);
        state.appStatus = 'error';
        state.errorDetails = `无法从云端加载数据。请检查：
1. Vercel 中的环境变量是否已正确设置并重新部署。
2. Supabase 数据库表是否已按说明创建。
3. 网络连接是否正常。

错误详情: ${e.message}`;
    }
    render();
}

addEventListeners();
initializeApp();