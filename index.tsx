
// --- DATA (Embedded) & CONFIG ---
const CONFIG_ROWS = ['主机', '内存', '硬盘1', '硬盘2', '显卡', '电源', '显示器'];

// --- STATE MANAGEMENT ---
const getInitialSelection = () => ({
    '主机': { model: '', quantity: 1 },
    '内存': { model: '', quantity: 1 },
    '硬盘1': { model: '', quantity: 1 },
    '硬盘2': { model: '', quantity: 0 },
    '显卡': { model: '', quantity: 1 },
    '电源': { model: '', quantity: 1 },
    '显示器': { model: '', quantity: 1 }
});

const state = {
    priceData: null, // Will be loaded from JSON
    isLoggedIn: false,
    view: 'quote', // 'quote' or 'admin'
    selection: getInitialSelection(),
    customItems: [],
    newCategory: '',
    specialDiscount: 0,
    discountRate: 1.0,
    selectedMargin: null,
    adminSearchTerm: '',
    pendingFile: null,
    showLoginModal: false,
    loginError: null,
};

function updateTimestamp() {
    if (state.priceData) {
        state.priceData.lastUpdated = new Date().toISOString();
    }
}

// --- DOM SELECTORS ---
const $ = (selector) => document.querySelector(selector);
const appContainer = $('#app');

// --- RENDER FUNCTIONS ---
function render() {
    if (!state.priceData) {
        appContainer.innerHTML = `<div class="loading-container"><h2>正在加载价格数据...</h2></div>`;
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

    appContainer.innerHTML = html;
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


function renderQuoteTool() {
    const totals = calculateTotals();
    const finalConfigText = getFinalConfigText();
    const lastUpdated = state.priceData.lastUpdated;
    const formattedDate = lastUpdated ? `价格更新: ${new Date(lastUpdated).toLocaleString('zh-CN')}` : '';


    return `
        <div class="quoteContainer">
            <header class="quoteHeader">
                <h1>产品报价系统 <span>v1.01 -- 龙盛科技</span></h1>
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
                        <label for="discount-select">折扣选择:</label>
                        <select id="discount-select">
                            ${state.priceData.discounts.map(d => `<option value="${d.rate}" ${state.discountRate === d.rate ? 'selected' : ''}>${d.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="control-group">
                        <label for="margin-select">点位选择:</label>
                        <select id="margin-select">
                            ${state.priceData.marginOptions.map(opt => `<option value="${opt.value}" ${state.selectedMargin === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
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

function renderConfigRow(category) {
    const models = state.priceData.prices[category] || {};
    const currentSelection = state.selection[category];
    return `
        <tr data-category="${category}">
            <td class="config-row-label">${category}</td>
            <td>
                <select class="model-select">
                    <option value="">-- 请选择 --</option>
                    ${Object.keys(models).map(model => `<option value="${model}" ${currentSelection.model === model ? 'selected' : ''}>${model}</option>`).join('')}
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

function renderCustomItemRow(item) {
    const models = state.priceData.prices[item.category] || {};
    return `
        <tr data-custom-id="${item.id}">
            <td class="config-row-label">${item.category}</td>
            <td>
                <select class="custom-model-select">
                    <option value="">-- 请选择 --</option>
                    ${Object.keys(models).map(model => `<option value="${model}" ${item.model === model ? 'selected' : ''}>${model}</option>`).join('')}
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
                <input type="text" id="new-category-input" placeholder="在此输入类别名称 (例如: 机箱)" value="${state.newCategory}" />
            </td>
            <td></td>
            <td class="config-row-action">
                <button id="add-category-btn" style="background-color: var(--primary-color);">+</button>
            </td>
        </tr>
    `;
}

function renderAdminPanel() {
    const allCategories = Object.keys(state.priceData.prices);
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
            <button id="back-to-quote-btn" class="admin-button">返回报价首页</button>
        </header>

        <div class="admin-section">
            <h3 class="admin-section-header">1. 核心计算参数与折扣</h3>
            <div class="admin-section-body">
                <div class="margin-options-section">
                    <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">预留加价倍率设置 (选择默认值):</label>
                    <div id="margin-options-list">
                    ${(state.priceData.marginOptions || []).map((opt, index) => `
                        <div class="margin-option-row" data-index="${index}">
                            <input type="radio" name="default-margin" class="margin-default-radio" value="${opt.value}" ${state.priceData.settings.margin === opt.value ? 'checked' : ''} />
                            <input type="text" class="margin-label-input" value="${opt.label}" placeholder="标签" />
                            <input type="number" step="0.01" class="margin-value-input" value="${opt.value}" placeholder="倍率" />
                            <button class="remove-margin-btn">删除</button>
                        </div>
                    `).join('')}
                    </div>
                    <button id="add-margin-btn" class="add-margin-btn">+ 添加倍率</button>
                </div>
                <div class="tiered-discount-section">
                    <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">N件N折阶梯价设置:</label>
                    <div id="tier-list">
                    ${(state.priceData.tieredDiscounts || []).map(tier => `
                        <div class="tier-row" data-tier-id="${tier.id}">
                            <span>满</span> <input type="number" class="tier-threshold" value="${tier.threshold}" placeholder="数量" /> <span>件, 打</span>
                            <input type="number" class="tier-rate" step="0.01" value="${tier.rate}" placeholder="折扣" /> <span>折</span>
                            <button class="remove-tier-btn">删除</button>
                        </div>
                    `).join('')}
                    </div>
                    <button id="add-tier-btn" class="add-tier-btn">+ 添加阶梯</button>
                </div>
                 <button id="save-params-btn" class="admin-save-section-btn">保存倍率与阶梯折扣</button>
            </div>
        </div>

        <div class="admin-section">
            <h3 class="admin-section-header" style="background-color: #3b82f6;">2. 快速录入配件</h3>
            <div class="admin-section-body">
                <div class="quick-add-form">
                     <select id="quick-add-category">
                        ${allCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
                        <option value="--new--">-- 添加新分类 --</option>
                     </select>
                     <input type="text" id="quick-add-new-category" style="display:none;" placeholder="新分类名" />
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
                        <input type="file" id="import-file-input" accept=".txt,.csv" />
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
                <div style="max-height: 400px; overflow-y: auto;">
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

        <button id="save-config-btn" class="generate-btn" style="width: 100%; padding: 0.8rem; margin-top: 1rem;">保存全部配置并下载</button>
    </div>
    `;
}


// --- LOGIC & EVENT HANDLERS ---
function calculateTotals() {
    const standardCost = Object.entries(state.selection).reduce((acc, [category, { model, quantity }]) => {
        if (model && quantity > 0) {
            const cost = state.priceData.prices[category]?.[model] ?? 0;
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
    const priceBeforeDiscount = costTotal * state.selectedMargin;
    let finalPrice = priceBeforeDiscount * state.discountRate - state.specialDiscount;
    
    finalPrice = Math.max(0, finalPrice);

    // Apply custom rounding logic as per user request
    if (finalPrice > 0) {
        const intPrice = Math.floor(finalPrice);
        const lastTwoDigits = intPrice % 100;
        
        if (lastTwoDigits !== 0) {
            const basePrice = Math.floor(intPrice / 100) * 100;
            if (lastTwoDigits > 50) {
                finalPrice = basePrice + 99;
            } else { // This covers numbers where last two digits are 1-50
                finalPrice = basePrice + 50;
            }
        } else {
            finalPrice = intPrice; // If ends in .00, just take the integer part
        }
    }

    return { finalPrice: finalPrice };
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
    const input = ($('#matcher-input')).value;
    if (!input) return;

    // 1. Prepare data
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

    // 2. Handle Hard Drive '+' case specifically
    const plusIndex = processedInput.indexOf('+');
    if (plusIndex > -1) {
        const components = processedInput.split(/[\\/|]/);
        const hddComponent = components.find(c => c.includes('+'));

        if (hddComponent) {
            const [part1Str, part2Str] = hddComponent.split('+').map(p => p.trim());
            const hddModels = allModels.filter(m => m.category.startsWith('硬盘'));

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

    // 3. Main loop for all other components
    let tempInput = processedInput.toLowerCase();
    const hddFillOrder = ['硬盘1', '硬盘2'];

    for (const { model, category, normalizedModel } of allModels) {
        if (tempInput.replace(/\s/g, '').includes(normalizedModel)) {
            let targetCategory = category;

            if (hddFillOrder.includes(category)) {
                const availableSlot = hddFillOrder.find(cat => newSelection[cat].model === '');
                if (availableSlot) {
                    targetCategory = availableSlot;
                } else {
                    continue; 
                }
            }

            if (newSelection[targetCategory] && newSelection[targetCategory].model === '') {
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
        ...state.customItems.map(item => [item.category, item])
    ];

    allItems.forEach(([category, { model, quantity }]) => {
        if (model && quantity > 0) {
            const cost = state.priceData.prices[category]?.[model] ?? 0;
            const subtotal = cost * quantity;
            costTotal += subtotal;
// FIX: Changed number to string conversion from `String(value)` to `value.toString()`
// to avoid potential issues with the global `String` object being shadowed.
            rows.push([category, model, cost.toString(), quantity.toString(), subtotal.toString()]);
        }
    });

    rows.push([]); 
// FIX: Changed number to string conversion from `String(value)` to `value.toString()`
// to avoid potential issues with the global `String` object being shadowed.
    rows.push(['', '', '', '总成本', costTotal.toString()]);
    rows.push(['', '', '', '点位', state.selectedMargin.toString()]);
    rows.push(['', '', '', '折扣', state.discountRate.toString()]);
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


function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) {
        $('#file-name-display').textContent = '未选择文件';
        state.pendingFile = null;
        return;
    }
    $('#file-name-display').textContent = file.name;
    state.pendingFile = file;
}

function handleLogin() {
    const passwordInput = ($('#password-input'));
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

function addEventListeners() {
    appContainer.addEventListener('click', (e) => {
        const target = e.target;
        if (!target) return;
        
        const button = target.closest('button');
        const row = target.closest('tr');
        const tierRow = target.closest('.tier-row');
        const marginRow = target.closest('.margin-option-row');

        if (target.id === 'modal-overlay' || (button && button.id === 'modal-cancel-btn')) {
             state.showLoginModal = false;
             state.loginError = null;
             render();
             return;
        }

        if (!button) return;

        if (button.id === 'app-view-toggle-btn') {
            if (state.isLoggedIn) {
                state.view = 'admin';
                render();
            } else {
                state.showLoginModal = true;
                render();
            }
        } else if (button.id === 'modal-confirm-btn') {
            handleLogin();
        } else if (button.id === 'back-to-quote-btn') {
            state.view = 'quote'; render();
        } else if (button.id === 'reset-btn') {
            state.selection = getInitialSelection();
            state.customItems = [];
            state.newCategory = '';
            state.specialDiscount = 0;
            state.discountRate = 1.0;
            state.selectedMargin = state.priceData.settings.margin;
            render();
        } else if (button.classList.contains('remove-item-btn') && row) {
            const category = row.dataset.category;
            if(category) state.selection[category] = getInitialSelection()[category];
            render();
        } else if (button.id === 'add-category-btn') {
            if (state.newCategory.trim()) {
                const newCat = state.newCategory.trim();
                 if (!state.customItems.some(item => item.category === newCat)) {
                    state.customItems.push({ id: Date.now(), category: newCat, model: '', quantity: 1 });
                }
                state.newCategory = ''; render();
            }
        } else if (button.classList.contains('remove-custom-item-btn') && row) {
            state.customItems = state.customItems.filter(item => item.id !== Number(row.dataset.customId));
            render();
        } else if (button.id === 'match-config-btn') {
            handleMatchConfig();
        } else if (button.id === 'generate-quote-btn') {
            handleExportExcel();
        } else if (button.id === 'save-config-btn') {
            const dataStr = JSON.stringify(state.priceData, null, 2);
            const blob = new Blob([dataStr], {type: "application/json"});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'prices_data.json'; a.click();
            URL.revokeObjectURL(url);
        } else if (button.id === 'quick-add-btn') {
            let category = $('#quick-add-category').value;
            if (category === '--new--') category = $('#quick-add-new-category').value.trim();
            const model = $('#quick-add-model').value.trim();
            const price = parseFloat($('#quick-add-price').value);
            if (category && model && !isNaN(price)) {
                if (!state.priceData.prices[category]) state.priceData.prices[category] = {};
                state.priceData.prices[category][model] = price;
                updateTimestamp();
                render();
            } else { alert('请确保分类、型号和价格都已正确填写。'); }
        } else if (button.classList.contains('admin-save-item-btn') && row) {
            const { category, model } = row.dataset;
            const newPrice = parseFloat(row.querySelector('.price-input').value);
            if (!isNaN(newPrice)) {
                state.priceData.prices[category][model] = newPrice;
                updateTimestamp();
                button.style.backgroundColor = '#16a34a';
                setTimeout(() => { button.style.backgroundColor = ''; }, 1000);
            }
        } else if (button.classList.contains('admin-delete-item-btn') && row) {
            const { category, model } = row.dataset;
            if (confirm(`确定要删除 "${category} - ${model}" 吗？`)) {
                delete state.priceData.prices[category][model];
                if (Object.keys(state.priceData.prices[category]).length === 0) delete state.priceData.prices[category];
                updateTimestamp();
                render();
            }
        } else if (button.id === 'add-tier-btn') {
            state.priceData.tieredDiscounts.push({ id: Date.now(), threshold: 0, rate: 0 });
            render();
        } else if (button.classList.contains('remove-tier-btn') && tierRow) {
            const tierId = Number(tierRow.dataset.tierId);
            state.priceData.tieredDiscounts = state.priceData.tieredDiscounts.filter(t => t.id !== tierId);
            render();
        } else if (button.id === 'add-margin-btn') {
            state.priceData.marginOptions.push({ label: '新倍率', value: 1.0 });
            render();
        } else if (button.classList.contains('remove-margin-btn') && marginRow) {
            const index = parseInt(marginRow.dataset.index, 10);
            const wasDefault = state.priceData.marginOptions[index].value === state.priceData.settings.margin;
            state.priceData.marginOptions.splice(index, 1);
            if (wasDefault && state.priceData.marginOptions.length > 0) {
                state.priceData.settings.margin = state.priceData.marginOptions[0].value;
            } else if (state.priceData.marginOptions.length === 0) {
                state.priceData.settings.margin = 1.0;
            }
            render();
        } else if (button.id === 'save-params-btn') {
            alert('参数已在输入时自动保存，可直接下载全部配置。');
        } else if (button.id === 'import-btn') {
            if (state.pendingFile) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const text = e.target.result;
                    if (typeof text !== 'string') {
                        alert('文件读取失败，内容格式不正确。');
                        return;
                    }
                    const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
                    let updatedCount = 0;
                    let addedCount = 0;
                    let importHappened = false;
                    lines.forEach(line => {
                        const parts = line.split(/[,，\t]/).map(p => p.trim());
                        if (parts.length === 3) {
                            const [category, model, priceStr] = parts;
                            const price = parseFloat(priceStr);
                            if (category && model && !isNaN(price)) {
                                if (!state.priceData.prices[category]) {
                                    state.priceData.prices[category] = {};
                                }
                                if (!state.priceData.prices[category][model]) addedCount++;
                                else updatedCount++;
                                state.priceData.prices[category][model] = price;
                                importHappened = true;
                            }
                        }
                    });

                    if (importHappened) {
                        updateTimestamp();
                    }
                    alert(`导入完成！\n更新: ${updatedCount} 条\n新增: ${addedCount} 条`);
                    state.pendingFile = null;
                    render();
                };
                reader.readAsText(state.pendingFile);
            } else {
                alert('请先选择一个文件。');
            }
        }
    });

    appContainer.addEventListener('input', (e) => {
        const { target } = e;
        const row = target.closest('tr');
        const tierRow = target.closest('.tier-row');
        
        if (target.id === 'new-category-input') { state.newCategory = target.value; return; }
        if (target.id === 'admin-search-input') { state.adminSearchTerm = target.value; render(); return; }

        if (tierRow) {
            const tierId = Number(tierRow.dataset.tierId);
            const tier = state.priceData.tieredDiscounts.find(t => t.id === tierId);
            if (!tier) return;
            if (target.classList.contains('tier-threshold')) tier.threshold = Number(target.value);
            if (target.classList.contains('tier-rate')) tier.rate = Number(target.value);
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
        }
    });
    
    appContainer.addEventListener('change', (e) => {
        const { target } = e;
        const row = target.closest('tr');
        const marginRow = target.closest('.margin-option-row');

        if (target.id === 'import-file-input') { handleFileSelect(e); return; }
        
        if (target.classList.contains('margin-default-radio')) {
            state.priceData.settings.margin = Number(target.value);
        } else if (marginRow && (target.classList.contains('margin-label-input') || target.classList.contains('margin-value-input'))) {
            const index = parseInt(marginRow.dataset.index, 10);
            const option = state.priceData.marginOptions[index];
            const oldValue = option.value;
            
            option.label = marginRow.querySelector('.margin-label-input').value;
            const newValue = parseFloat(marginRow.querySelector('.margin-value-input').value);
            option.value = isNaN(newValue) ? 0 : newValue;

            if (state.priceData.settings.margin === oldValue) {
                state.priceData.settings.margin = option.value;
            }
            render();
        } else if (target.id === 'quick-add-category') {
            $('#quick-add-new-category').style.display = target.value === '--new--' ? 'block' : 'none';
        } else if (row && row.dataset.category) {
            const category = row.dataset.category;
            if (target.classList.contains('model-select')) { state.selection[category].model = target.value; render(); }
        } else if (row && row.dataset.customId) {
            const item = state.customItems.find(i => i.id === Number(row.dataset.customId));
            if (item && target.classList.contains('custom-model-select')) { item.model = target.value; render(); }
        } else if (target.id === 'discount-select') {
            state.discountRate = Number(target.value); render();
        } else if (target.id === 'margin-select') {
            state.selectedMargin = Number(target.value); render();
        }
    });

    // Add keydown listener for the modal
    appContainer.addEventListener('keydown', (e) => {
        if (state.showLoginModal && e.key === 'Enter') {
            e.preventDefault();
            handleLogin();
        }
    });
}

// --- INITIALIZATION ---
async function initializeApp() {
    render(); // Initial render to show loading message
    try {
        const response = await fetch('./prices_data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const priceData = await response.json();
        state.priceData = priceData;
        
        if (!state.priceData || !state.priceData.prices) {
             throw new Error("Price data is malformed or missing.");
        }
        if (state.priceData.discounts && state.priceData.discounts.length > 0) {
            state.discountRate = state.priceData.discounts[0].rate;
        }
        state.selectedMargin = state.priceData.settings.margin;
    } catch (error) {
        console.error("Could not load price data:", error);
        appContainer.innerHTML = `<div class="loading-container error"><h1>加载价格数据失败</h1><p>请检查 'prices_data.json' 文件是否存在且格式正确。</p></div>`;
        return;
    }
    render(); // Re-render with the loaded data
}

addEventListeners();
initializeApp();