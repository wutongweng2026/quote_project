
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
    selection: SelectionState;
    customItems: CustomItem[];
    newCategory: string;
    specialDiscount: number;
    markupPoints: number;
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
    priceData: PRICE_DATA,
    selection: getInitialSelection(),
    customItems: [],
    newCategory: '',
    specialDiscount: 0,
    markupPoints: 15,
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
    let html = renderQuoteTool();
    if (state.showCustomModal) {
        html += renderCustomModal();
    }
    appContainer.innerHTML = html;
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
            state.showCustomModal = false; render();
        } else if (button && button.id === 'custom-modal-confirm-btn') {
            if (state.customModal.onConfirm) {
                state.customModal.onConfirm();
            }
            state.showCustomModal = false;
            render();
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
        }
    });

    appContainer.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        const row = target.closest<HTMLTableRowElement>('tr');
        
        if (target.id === 'new-category-input') { state.newCategory = target.value; return; }
        
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
function initializeApp() {
    render();
}

addEventListeners();
initializeApp();
