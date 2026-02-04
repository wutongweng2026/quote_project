

// LOGIN FUNCTIONALITY COMPLETELY REMOVED. This app now loads directly into the quote tool.

// --- TYPES ---
interface PriceDataItem { [model: string]: number; }
interface Prices { [category: string]: PriceDataItem; }
interface TieredDiscount { id: number; threshold: number; rate: number; }
interface MarkupPoint { id: number; alias: string; value: number; }

interface PriceData {
    prices: Prices;
    tieredDiscounts: TieredDiscount[];
    markupPoints: MarkupPoint[];
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
    inputType?: 'text' | 'password';
    errorMessage?: string;
}
interface AppState {
    priceData: PriceData;
    view: 'quote' | 'admin';
    selection: SelectionState;
    customItems: CustomItem[];
    newCategory: string;
    specialDiscount: number;
    markupPoints: number; // This is the ID of the selected markup point
    adminSearchTerm: string;
    showCustomModal: boolean;
    customModal: CustomModalState;
}

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
  ],
  "markupPoints": [
    { "id": 1, "alias": "标准(12点)", "value": 12 },
    { "id": 2, "alias": "渠道(10点)", "value": 10 },
    { "id": 3, "alias": "大客户(8点)", "value": 8 }
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
    priceData: JSON.parse(JSON.stringify(PRICE_DATA)), // Deep copy to allow modification
    view: 'quote',
    selection: getInitialSelection(),
    customItems: [],
    newCategory: '',
    specialDiscount: 0,
    markupPoints: PRICE_DATA.markupPoints[0]?.id || 0,
    adminSearchTerm: '',
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
};

// --- DOM SELECTORS ---
const $ = (selector: string) => document.querySelector(selector);
const appContainer = $('#app')!;

// --- RENDER FUNCTIONS ---
function render() {
    let html = '';
    if (state.view === 'quote') {
        html = renderQuoteTool();
    } else if (state.view === 'admin') {
        html = renderAdminPanel();
    }

    if (state.showCustomModal) {
        html += renderCustomModal();
    }
    appContainer.innerHTML = html;
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
                <h1>产品报价系统 <span>v1.01 - 龙盛科技</span></h1>
                 <div class="header-actions">
                    <button class="admin-button" id="app-view-toggle-btn">后台管理</button>
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
                        <label>折扣:</label>
                        <div class="discount-display">${totals.appliedDiscountLabel}</div>
                    </div>
                    <div class="control-group">
                        <label for="markup-points-select">点位:</label>
                        <select id="markup-points-select">
                            ${state.priceData.markupPoints.map(point => `
                                <option value="${point.id}" ${state.markupPoints === point.id ? 'selected' : ''}>
                                    ${point.alias.split('(')[0].trim()}
                                </option>
                            `).join('')}
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
            <h2>系统管理后台</h2>
            <div class="header-actions-admin">
                <button id="back-to-quote-btn" class="admin-button">返回报价首页</button>
            </div>
        </header>
        
        <div class="admin-content">
            <div class="admin-section">
                <h3 class="admin-section-header">点位管理</h3>
                <div class="admin-section-body">
                    <div id="markup-points-list">
                        ${state.priceData.markupPoints.map(point => `
                            <div class="markup-point-row" data-id="${point.id}">
                                <input type="text" class="markup-alias-input" value="${point.alias}" placeholder="别名 (例如: 标准点位)">
                                <input type="number" class="markup-value-input" value="${point.value}" placeholder="点数">
                                <span>点</span>
                                <button class="remove-markup-point-btn" data-id="${point.id}">删除</button>
                            </div>
                        `).join('')}
                    </div>
                     <div class="markup-point-row" style="margin-top: 1rem;">
                        <button id="add-markup-point-btn">添加新点位</button>
                    </div>
                </div>
            </div>

            <div class="admin-section">
                <h3 class="admin-section-header">折扣阶梯管理</h3>
                <div class="admin-section-body">
                    <div id="tiered-discount-list">
                        ${state.priceData.tieredDiscounts.map(tier => `
                            <div class="tier-row" data-id="${tier.id}">
                                <span>满</span>
                                <input type="number" class="tier-threshold-input" value="${tier.threshold}" placeholder="数量">
                                <span>件, 打</span>
                                <input type="number" step="0.01" class="tier-rate-input" value="${tier.rate}" placeholder="折扣率 (0.98)">
                                <span>折</span>
                                <button class="remove-tier-btn" data-id="${tier.id}">删除</button>
                            </div>
                        `).join('')}
                    </div>
                     <div class="tier-row" style="margin-top: 1rem;">
                        <button id="add-tier-btn" class="add-tier-btn">添加新折扣阶梯</button>
                    </div>
                </div>
            </div>

            <div class="admin-section">
                <h3 class="admin-section-header">快速录入配件</h3>
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
                <h3 class="admin-section-header">现有数据维护</h3>
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
        errorMessage: '',
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

    const selectedMarkupPoint = state.priceData.markupPoints.find(p => p.id === state.markupPoints);
    const markupValue = selectedMarkupPoint ? selectedMarkupPoint.value : 0;

    const priceBeforeDiscount = costTotal * (1 + markupValue / 100);
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

function addEventListeners() {
    appContainer.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!target) return;
        
        const button = target.closest('button');
        const row = target.closest<HTMLTableRowElement>('tr');

        if (target.id === 'custom-modal-overlay') {
             state.showCustomModal = false;
             render();
             return;
        }
        
        if(button && button.id === 'custom-modal-cancel-btn') {
            state.showCustomModal = false;
            render();
        } else if (button && button.id === 'custom-modal-confirm-btn') {
            if (state.customModal.title === '管理员登录') {
                const passwordInput = $('#modal-input') as HTMLInputElement;
                if (passwordInput && passwordInput.value === '112@') {
                    state.view = 'admin';
                    state.showCustomModal = false;
                    render();
                } else {
                    state.customModal.errorMessage = '密码错误，请重试。';
                    render(); // Re-render modal with error
                }
            } else {
                if (state.customModal.onConfirm) {
                    state.customModal.onConfirm();
                }
                state.showCustomModal = false;
                render();
            }
        } else if (button && button.id === 'app-view-toggle-btn') {
            showModal({
                title: '管理员登录',
                message: '请输入密码以访问后台管理。',
                inputType: 'password',
                showCancel: true,
                confirmText: '确认',
                onConfirm: null
            });
        } else if (button && button.id === 'back-to-quote-btn') {
            state.view = 'quote';
            render();
        } else if (button && button.id === 'reset-btn') {
            state.selection = getInitialSelection();
            state.customItems = [];
            state.newCategory = '';
            state.specialDiscount = 0;
            state.markupPoints = state.priceData.markupPoints[0]?.id || 0;
            render();
        } else if (button && button.classList.contains('remove-item-btn') && row) {
            const category = row.dataset.category;
            if(category) {
                state.selection[category] = getInitialSelection()[category];
            }
            render();
        } else if (button && button.id === 'add-category-btn') {
            if (state.newCategory.trim()) {
                const newCat = state.newCategory.trim();
                 if (!state.customItems.some(item => item.category === newCat)) {
                    state.customItems.push({ id: Date.now(), category: newCat, model: '', quantity: 1 });
                }
                state.newCategory = '';
                render();
            }
        } else if (button && button.classList.contains('remove-custom-item-btn') && row) {
            state.customItems = state.customItems.filter(item => item.id !== Number(row.dataset.customId));
            render();
        } else if (button && button.id === 'match-config-btn') {
            handleMatchConfig();
        } else if (button && button.id === 'generate-quote-btn') {
            handleExportExcel();
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
                            render();
                        }
                    }
                });
            }
        } else if (button && button.id === 'add-tier-btn') {
            const newTier = { id: Date.now(), threshold: 0, rate: 0.98 };
            state.priceData.tieredDiscounts.push(newTier);
            state.priceData.tieredDiscounts.sort((a,b) => a.threshold - b.threshold);
            render();
        } else if (button && button.classList.contains('remove-tier-btn')) {
            const tierId = Number(button.dataset.id);
            state.priceData.tieredDiscounts = state.priceData.tieredDiscounts.filter(t => t.id !== tierId);
            render();
        } else if (button && button.id === 'add-markup-point-btn') {
            const newPoint = { id: Date.now(), alias: '', value: 0 };
            state.priceData.markupPoints.push(newPoint);
            render();
        } else if (button && button.classList.contains('remove-markup-point-btn')) {
            const pointId = Number(button.dataset.id);
            state.priceData.markupPoints = state.priceData.markupPoints.filter(p => p.id !== pointId);
            if (state.markupPoints === pointId && state.priceData.markupPoints.length > 0) {
                state.markupPoints = state.priceData.markupPoints[0].id;
            } else if (state.priceData.markupPoints.length === 0) {
                state.markupPoints = 0;
            }
            render();
        }


    });

    appContainer.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        const row = target.closest<HTMLTableRowElement>('tr');
        
        if (target.id === 'new-category-input') { state.newCategory = target.value; return; }
        
        const tierRow = target.closest<HTMLDivElement>('.tier-row');
        if (tierRow && tierRow.dataset.id) {
            const tierId = Number(tierRow.dataset.id);
            const tier = state.priceData.tieredDiscounts.find(t => t.id === tierId);
            if (tier) {
                if (target.classList.contains('tier-threshold-input')) {
                    tier.threshold = parseInt(target.value, 10) || 0;
                } else if (target.classList.contains('tier-rate-input')) {
                    tier.rate = parseFloat(target.value) || 0;
                }
            }
            return;
        }
        
        const markupRow = target.closest<HTMLDivElement>('.markup-point-row');
        if (markupRow && markupRow.dataset.id) {
            const pointId = Number(markupRow.dataset.id);
            const point = state.priceData.markupPoints.find(p => p.id === pointId);
            if (point) {
                if (target.classList.contains('markup-alias-input')) {
                    point.alias = target.value;
                } else if (target.classList.contains('markup-value-input')) {
                    point.value = parseInt(target.value, 10) || 0;
                }
            }
            return;
        }

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

        if (row && row.dataset.category && !row.dataset.model) {
            const category = row.dataset.category;
            if (target.classList.contains('quantity-input')) {
// FIX: Separated state update and render call to new lines to fix "expression is not callable" error and improve readability.
                state.selection[category].quantity = Math.max(0, parseInt(target.value, 10) || 0);
                render();
            }
        } else if (row && row.dataset.customId) {
            const item = state.customItems.find(i => i.id === Number(row.dataset.customId));
            if (item && target.classList.contains('custom-quantity-input')) {
                item.quantity = Math.max(0, parseInt(target.value, 10) || 0);
                render();
            }
        } else if (target.id === 'special-discount-input') {
            state.specialDiscount = Math.max(0, Number(target.value));
            render();
        }
    });
    
    appContainer.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement | HTMLSelectElement;
        const row = target.closest<HTMLTableRowElement>('tr');
        
        if (target.id === 'markup-points-select') {
            state.markupPoints = Number((target as HTMLSelectElement).value);
            render();
        } else if (row && row.dataset.category) {
            const category = row.dataset.category;
            if (target.classList.contains('model-select')) {
                state.selection[category].model = (target as HTMLSelectElement).value;
                render();
            }
        } else if (row && row.dataset.customId) {
            const item = state.customItems.find(i => i.id === Number(row.dataset.customId));
            if (item && target.classList.contains('custom-model-select')) {
                item.model = (target as HTMLSelectElement).value;
                render();
            }
        }
    });
}

// --- INITIALIZATION ---
function initializeApp() {
    render();
}

addEventListeners();
initializeApp();
