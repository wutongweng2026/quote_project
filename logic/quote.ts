

import { state, supabase, getInitialSelection } from '../state';
import { renderApp, showModal, updateTotalsUI } from '../ui';
import { calculateTotals } from '../calculations';
import type { DbQuoteItem } from '../types';

declare var XLSX: any;
const $ = (selector: string) => document.querySelector(selector);

// --- 辅助函数：分词器 ---
const tokenize = (str: string) => str.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, ' ').split(/\s+/).filter(t => t.length > 0);

// --- 核心逻辑：解析配置清单文本 ---
function parseConfigInput(input: string) {
    // 1. 重置当前选择 (保留原有架构，清空数量)
    state.selection = getInitialSelection();
    Object.keys(state.selection).forEach(key => state.selection[key].quantity = 0); // 默认设为0，匹配到的才设为1
    state.customItems = []; // 清空自定义项
    state.selectedDiscountId = 'none';
    state.specialDiscount = 0;

    // 2. 预处理文本：支持 | 或 换行符 或 + 号 / \ 、以及 连续空格 作为分隔符
    // 移除行首行尾空白，统一分隔符
    const cleanInput = input.replace(/[\uff5c]/g, '|'); // 处理全角竖线
    // Split by: | or newline or + or / or \ or 、 OR 2+ spaces/tabs (soft delimiter)
    // NOTE: We don't split by single space to allow names like "RTX 3060"
    const segments = cleanInput.split(/[|\n+\/\\、]+|\s{2,}/).map(s => s.trim()).filter(s => s);

    let matchedCount = 0;
    let customCount = 0;
    
    // 硬盘计数器，用于分配 硬盘1, 硬盘2
    let hddCounter = 0;

    segments.forEach(segment => {
        if (!segment) return;

        // 3. 提取数量 (支持 *1, x1, ×1, * 1 等格式)
        let quantity = 1;
        // Regex look for * number at the end, or x number
        const qtyMatch = segment.match(/(?:[*x××]\s*(\d+))$/i) || segment.match(/(?:[*x××]\s*(\d+))\s/i);
        
        let modelName = segment;
        if (qtyMatch) {
            quantity = parseInt(qtyMatch[1], 10);
            // 从名称中移除数量部分
            modelName = segment.replace(qtyMatch[0], '').trim();
        }

        if (!modelName) return;

        // 4. 在数据库中查找最佳匹配
        // 评分机制：输入词的所有 token，在数据库 Item 的 token 中出现的比例
        const inputTokens = tokenize(modelName);
        let bestMatch: DbQuoteItem | null = null;
        let maxScore = 0;

        state.priceData.items.forEach(dbItem => {
            const dbTokens = tokenize(dbItem.model);
            const catTokens = tokenize(dbItem.category);
            // 合并 Category 和 Model 作为匹配源 (防止用户只输入 "3060" 而库里是 "显卡 RTX3060")
            const searchPool = [...dbTokens, ...catTokens];

            let hitCount = 0;
            inputTokens.forEach(token => {
                if (searchPool.some(dbToken => dbToken.includes(token) || token.includes(dbToken))) {
                    hitCount++;
                }
            });

            // 计算得分: 命中词数 / 输入词总数 (越接近 1 越好)
            // 额外加分: 如果输入完全包含在 DB model 中
            let score = hitCount / inputTokens.length;
            
            if (dbItem.model.toLowerCase() === modelName.toLowerCase()) score += 1; // 精确匹配加分
            else if (dbItem.model.toLowerCase().includes(modelName.toLowerCase())) score += 0.5; // 包含匹配加分

            if (score > maxScore && score > 0.4) { // 阈值 0.4，避免太离谱的匹配
                maxScore = score;
                bestMatch = dbItem;
            }
        });

        // 5. 应用匹配结果
        if (bestMatch) {
            const item = bestMatch as DbQuoteItem;
            let targetCategory = item.category;

            // 特殊处理硬盘的多插槽逻辑
            if (targetCategory === '硬盘') {
                hddCounter++;
                if (hddCounter === 1) targetCategory = '硬盘1';
                else if (hddCounter === 2) targetCategory = '硬盘2';
                else {
                    // 超过2个硬盘，添加到自定义项，或者覆盖硬盘2？
                    // 策略：添加到自定义项，名为 "额外硬盘"
                    const newId = state.customItems.length > 0 ? Math.max(...state.customItems.map(i => i.id)) + 1 : 1;
                    state.customItems.push({
                        id: newId,
                        category: '硬盘(额外)',
                        model: item.model,
                        quantity: quantity
                    });
                    matchedCount++;
                    return; 
                }
            }

            // 检查标准 Selection 是否有此分类
            if (state.selection[targetCategory]) {
                state.selection[targetCategory] = {
                    model: item.model,
                    quantity: quantity
                };
                matchedCount++;
            } else {
                // 如果是标准库里的配件，但当前 UI 没这个槽位 (比如 "声卡")，转为自定义
                 const newId = state.customItems.length > 0 ? Math.max(...state.customItems.map(i => i.id)) + 1 : 1;
                state.customItems.push({
                    id: newId,
                    category: item.category,
                    model: item.model,
                    quantity: quantity
                });
                matchedCount++;
            }
        } else {
            // 6. 未匹配 -> 添加到自定义列表 (保持原名)
            // 尝试猜测分类 (非常简单的猜测)
            let guessCategory = '其他配件';
            if (modelName.includes('显卡') || modelName.includes('GPU')) guessCategory = '显卡';
            else if (modelName.includes('CPU') || modelName.includes('处理器')) guessCategory = 'CPU';
            else if (modelName.includes('内存') || modelName.includes('DDR')) guessCategory = '内存';
            else if (modelName.includes('盘') || modelName.includes('SSD')) guessCategory = '硬盘';
            else if (modelName.includes('电') || modelName.includes('W')) guessCategory = '电源';
            
            const newId = state.customItems.length > 0 ? Math.max(...state.customItems.map(i => i.id)) + 1 : 1;
            state.customItems.push({
                id: newId,
                category: guessCategory,
                model: modelName, // 保留原始输入名称
                quantity: quantity
            });
            customCount++;
        }
    });

    state.showFinalQuote = true;
    renderApp();
    
    showModal({
        title: '配置解析完成',
        message: `
            <p>系统已根据您粘贴的文本自动生成配置：</p>
            <ul style="margin: 10px 0 10px 20px; color: var(--text-700);">
                <li>成功匹配标准库配件: <strong>${matchedCount}</strong> 项</li>
                <li>新增自定义配件: <strong>${customCount}</strong> 项</li>
            </ul>
            <p style="font-size: 0.9rem; color: var(--text-500);">对于未匹配的自定义配件，请手动补充单价。</p>
        `,
        confirmText: '查看报价'
    });
}

// --- 原有的预算推荐逻辑 (增强版) ---
function handleBudgetRecommendation(input: string) {
    const userInput = input.toLowerCase();
    let budget = 0;
    const budgetMatch = userInput.match(/(?:预算|价格|价位|左右|^|\s)(\d+(?:\.\d+)?)\s*(?:元|块|w|k|万|千)?/);
    if (budgetMatch) {
        let num = parseFloat(budgetMatch[1]);
        if (userInput.includes('w') || userInput.includes('万')) num *= 10000;
        else if (userInput.includes('k') || userInput.includes('千')) num *= 1000;
        if (num > 1000) budget = num;
    }

    const candidates: Record<string, { model: string, price: number }[]> = {};
    const allCategories = [...new Set(state.priceData.items.map(i => i.category))];
    const optionalCategories = ['显卡', '显示器'];
    
    allCategories.forEach(catName => {
        const items = state.priceData.items.filter(i => i.category === catName);
        const userMatches = items.filter(i => i.model.toLowerCase().split(/[\s/+\-,]/).some(token => token && userInput.includes(token)));
        
        let selection: {model: string, price: number}[] = [];

        if (userMatches.length > 0) {
            selection = userMatches.map(i => ({ model: i.model, price: i.price }));
        } else {
            const priorityItems = items.filter(i => i.is_priority);
            const baseItems = priorityItems.length > 0 ? priorityItems : items;
            
            selection = baseItems.map(i => ({ model: i.model, price: i.price }));
            
            // 如果是可选配件（显卡/显示器），且用户没有明确指定关键词，则添加"无"选项
            // 这样算法就可以选择"不配显卡"以节省预算
            if (optionalCategories.includes(catName)) {
                selection.unshift({ model: '', price: 0 });
            }
        }
        candidates[catName] = selection;
    });

    let bestCombo: Record<string, string> | null = null;
    let minDiff = budget > 0 ? Infinity : -Infinity;

    // 组合遍历：尝试找到性价比最高的组合
    // 注意：如果显卡选了 {model: '', price: 0}，即代表不配显卡
    const combinations = (
        candidates['主机'] || [{model: '', price: 0}]).flatMap(h => 
        (candidates['CPU'] || [{model: '', price: 0}]).flatMap(cpu => 
        (candidates['内存'] || [{model: '', price: 0}]).flatMap(r => 
        (candidates['硬盘'] || [{model: '', price: 0}]).flatMap(d1 => 
        (candidates['显卡'] || [{model: '', price: 0}]).flatMap(g => 
        (candidates['电源'] || [{model: '', price: 0}]).flatMap(p => 
        (candidates['显示器'] || [{model: '', price: 0}]).map(m => {
            const combo = { '主机': h.model, 'CPU': cpu.model, '内存': r.model, '硬盘1': d1.model, '显卡': g.model, '电源': p.model, '显示器': m.model };
            const price = h.price + cpu.price + r.price + d1.price + g.price + p.price + m.price;
            return { combo, price };
        })
    ))))));

    for (const { combo, price } of combinations) {
        if (budget > 0) {
            // 在预算范围内，寻找价格最高的组合（即性能最强的，或包含显卡的）
            if (price <= budget && (budget - price) < minDiff) {
                minDiff = budget - price;
                bestCombo = combo;
            }
        } else {
            // 如果没预算限制，找最贵的（通常也是配置最好的）
            if (price > minDiff) {
                minDiff = price;
                bestCombo = combo;
            }
        }
    }

    if (bestCombo) {
        // 先重置所有
        Object.keys(state.selection).forEach(key => {
             if (state.selection[key]) {
                 state.selection[key].model = '';
                 state.selection[key].quantity = 0;
             }
        });
        
        // 填入最佳组合
        Object.keys(bestCombo).forEach(cat => { 
            if (state.selection[cat]) {
                const model = bestCombo[cat];
                state.selection[cat].model = model;
                // 如果模型为空（例如没选显卡），数量设为0；否则设为1
                state.selection[cat].quantity = model ? 1 : 0;
            } 
        });
        
        state.selectedDiscountId = 'none'; 
        state.showFinalQuote = true; 
        renderApp();
    } else {
        showModal({ title: '无法匹配', message: '未找到符合条件的配置组合，请尝试调整预算或描述。' });
    }
}


function handleSmartRecommendation() {
    const input = ($('#matcher-input') as HTMLTextAreaElement | HTMLInputElement).value;
    if (!input || !input.trim()) {
        showModal({ title: '请输入需求', message: '请在文本框中输入预算（如“8000元”）或粘贴配置清单（如“CPU * 1 | 显卡 * 1”）。' });
        return;
    }

    // 智能判断：如果包含 * (数量) 或 | (分隔) 或 x数量，则认为是配置清单模式
    // 否则认为是 预算/关键词 推荐模式
    const isConfigList = /[*x×]\s*\d+|\|/.test(input) || input.split('\n').length > 1;

    if (isConfigList) {
        console.log("Detecting Config List Mode");
        parseConfigInput(input);
    } else {
        console.log("Detecting Budget Mode");
        handleBudgetRecommendation(input);
    }
}

function handleExportExcel() {
    const totals = calculateTotals();
    const configParts = [...Object.values(state.selection), ...state.customItems]
        .filter(({ model, quantity }) => model && quantity > 0).map(({ model }) => model);
    if (configParts.length === 0) return showModal({ title: '无法导出', message: '请先选择至少一个配件再导出报价单。' });

    const mainframeModel = state.selection['主机']?.model || '';
    const modelCode = mainframeModel.split(' ')[0] || '自定义主机';
    
    // Updated Excel structure: Removed '单价' (Unit Price) column
    const aoa = [
        ['型号', '配置', '数量', '总价', '备注'],
        [modelCode, configParts.join(' | '), state.globalQuantity, totals.finalPrice, '含13%增值税发票'],
        [null, '总计', null, totals.finalPrice, null], [], [], [], [],
        [null, null, '北京龙盛天地科技有限公司报价表', null, null],
        [null, null, '地址: 北京市海淀区清河路164号1号院', null, null],
        [null, null, '电话: 010-51654433-8013 传真: 010-82627270', null, null],
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    // Adjusted widths for 5 columns
    worksheet['!cols'] = [{ wch: 15 }, { wch: 60 }, { wch: 8 }, { wch: 12 }, { wch: 25 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '报价单');
    XLSX.writeFile(workbook, '龙盛科技报价单.xlsx');
}

export function attachQuoteToolListeners() {
    $('#logout-btn')?.addEventListener('click', () => supabase.auth.signOut());
    $('#user-management-btn')?.addEventListener('click', () => { state.view = 'userManagement'; renderApp(); });
    $('#login-log-btn')?.addEventListener('click', async () => {
        state.view = 'loginLog';
        const { data } = await supabase.from('login_logs').select('*').order('login_at', { ascending: false }).limit(100);
        state.loginLogs = data || []; renderApp();
    });
    $('#app-view-toggle-btn')?.addEventListener('click', () => { state.view = 'admin'; renderApp(); });
    $('#reset-btn')?.addEventListener('click', () => {
        state.selection = getInitialSelection(); state.customItems = []; state.specialDiscount = 0;
        state.markupPoints = state.priceData.markupPoints[0]?.id || 0;
        state.showFinalQuote = false; state.selectedDiscountId = 'none'; 
        state.globalQuantity = 1; // Reset global quantity
        renderApp();
    });
    $('#match-config-btn')?.addEventListener('click', handleSmartRecommendation);
    $('#generate-quote-btn')?.addEventListener('click', handleExportExcel);
    $('#calc-quote-btn')?.addEventListener('click', () => { state.showFinalQuote = true; renderApp(); });
    $('#special-discount-input')?.addEventListener('input', (e) => { state.specialDiscount = Math.max(0, Number((e.target as HTMLInputElement).value)); updateTotalsUI(); });

    // --- Global Quantity Logic ---
    const updateQuantity = (newQty: number) => {
        const qty = Math.max(1, newQty);
        state.globalQuantity = qty;
        
        // Auto Discount Trigger Logic
        const sortedDiscounts = state.priceData.tieredDiscounts.sort((a, b) => b.threshold - a.threshold);
        // Find the best matching tier (threshold <= qty)
        const applicableTier = sortedDiscounts.find(t => t.threshold <= qty);
        
        // Auto-select the tier if found, otherwise reset to 'none' if user hasn't manually locked something else (optional behavior: strict auto-switch)
        // Strict auto-switch:
        if (applicableTier) {
            state.selectedDiscountId = applicableTier.id;
        } else {
            // Only reset if the current selection was an auto-tier that no longer applies?
            // For simplicity, let's reset to none if no threshold is met, effectively automating the dropdown
            state.selectedDiscountId = 'none';
        }

        renderApp();
    };

    $('#qty-minus')?.addEventListener('click', () => updateQuantity(state.globalQuantity - 1));
    $('#qty-plus')?.addEventListener('click', () => updateQuantity(state.globalQuantity + 1));
    $('#global-qty-input')?.addEventListener('change', (e) => updateQuantity(parseInt((e.target as HTMLInputElement).value) || 1));


    // --- Change Password Logic ---
    $('#change-password-btn')?.addEventListener('click', () => {
        showModal({
            title: '修改密码',
            message: `
                <div class="auth-input-group">
                    <label style="display:block; margin-bottom:0.5rem; font-weight:500;">新密码</label>
                    <input type="password" id="new-password" class="form-input" placeholder="请输入新密码 (至少6位)">
                </div>
                <div class="auth-input-group">
                    <label style="display:block; margin-bottom:0.5rem; font-weight:500;">确认密码</label>
                    <input type="password" id="confirm-password" class="form-input" placeholder="请再次输入新密码">
                </div>
            `,
            showCancel: true,
            confirmText: '确认修改',
            onConfirm: async () => {
                const newPassword = ($('#new-password') as HTMLInputElement).value.trim();
                const confirmPassword = ($('#confirm-password') as HTMLInputElement).value.trim();
                
                if (!newPassword || !confirmPassword) {
                    state.customModal.errorMessage = "请输入新密码。";
                    return renderApp();
                }
                
                if (newPassword.length < 6) {
                    state.customModal.errorMessage = "新密码长度至少需要 6 位。";
                    return renderApp();
                }
                
                if (newPassword !== confirmPassword) {
                    state.customModal.errorMessage = "两次输入的密码不一致。";
                    return renderApp();
                }
                
                const btn = $('#custom-modal-confirm-btn') as HTMLButtonElement;
                const originalText = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = `<span class="spinner"></span> 处理中...`;

                const { error } = await supabase.auth.updateUser({ password: newPassword });
                
                if (error) {
                    state.customModal.errorMessage = `修改失败: ${error.message}`;
                    renderApp(); // Re-render to show error message (and reset button state via full re-render)
                } else {
                    state.showCustomModal = false;
                    showModal({ title: '修改成功', message: '您的密码已成功更新。', confirmText: '完成' });
                }
            }
        });
    });

    // Consolidated listeners for the data table
    const dataTable = $('.data-table');
    if (dataTable) {
        dataTable.addEventListener('input', (e) => {
            const target = e.target as HTMLInputElement;
            const row = target.closest('tr');
            if (!row) return;

            if (target.id === 'new-category-input') {
                state.newCategory = target.value;
                return;
            }

            // Also support direct text input for custom model (if no models in DB)
            if (target.classList.contains('custom-model-input')) {
                const customId = Number(row.dataset.customId);
                const item = state.customItems.find(i => i.id === customId);
                if (item) { item.model = target.value; }
            }

            const quantity = Math.max(0, parseInt(target.value, 10) || 0);

            if (target.classList.contains('quantity-input')) {
                const category = row.dataset.category;
                if (category && state.selection[category]) { state.selection[category].quantity = quantity; }
            } else if (target.classList.contains('custom-quantity-input')) {
                const customId = Number(row.dataset.customId);
                const item = state.customItems.find(i => i.id === customId);
                if (item) { item.quantity = quantity; }
            }
            updateTotalsUI();
        });

        dataTable.addEventListener('change', (e) => {
            const target = e.target as HTMLSelectElement;
            const row = target.closest('tr');
            if (!row) return;

            if (target.id === 'new-category-select') {
                const val = target.value;
                if (val === 'custom') {
                    state.isNewCategoryCustom = true;
                    state.newCategory = ''; // Clear for user to type
                } else {
                    state.isNewCategoryCustom = false;
                    state.newCategory = val; // Set the selected category
                }
                renderApp(); // Re-render to show/hide input
                return;
            }

            if (target.classList.contains('model-select')) {
                const category = row.dataset.category;
                if (category && state.selection[category]) { 
                    state.selection[category].model = target.value; 

                    // 关键修复: 当选择"主机"时，强制重绘应用
                    // 目的: 触发 ui.ts 中的 renderConfigRow 逻辑，使其他配件列表根据新主机的 compatible_hosts 进行过滤
                    if (category === '主机') {
                        const newHost = target.value;
                        
                        // 额外优化: 如果切换了主机，检查当前已选的其他配件是否还兼容
                        // 如果不兼容，自动重置该配件的选择，防止"幽灵数据" (UI上看不见但计入了总价)
                        Object.keys(state.selection).forEach(key => {
                            if (key === '主机') return;
                            const currentModel = state.selection[key].model;
                            if (!currentModel) return;

                            const dataCat = key.startsWith('硬盘') ? '硬盘' : key;
                            const item = state.priceData.items.find(i => i.category === dataCat && i.model === currentModel);

                            if (item && item.compatible_hosts && item.compatible_hosts.length > 0) {
                                // 如果该配件有兼容性限制，且新选的主机不在兼容列表中 -> 重置
                                if (newHost && !item.compatible_hosts.includes(newHost)) {
                                    state.selection[key].model = '';
                                }
                            }
                        });

                        renderApp();
                        return; // renderApp 会重新生成DOM，不需要后续的 updateTotalsUI
                    }
                }
            } else if (target.classList.contains('custom-model-select')) {
                const customId = Number(row.dataset.customId);
                const item = state.customItems.find(i => i.id === customId);
                if (item) { item.model = target.value; }
            }
            updateTotalsUI();
        });

        dataTable.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const button = target.closest('button');
            if (!button) return;

            if (button.id === 'add-category-btn') {
                const categoryName = state.newCategory.trim();
                if (!categoryName) {
                    return showModal({ title: '输入错误', message: '请选择或输入新类别的名称。' });
                }
                const newId = state.customItems.length > 0 ? Math.max(...state.customItems.map(item => item.id)) + 1 : 1;
                state.customItems.push({ id: newId, category: categoryName, model: '', quantity: 1 });
                
                // Reset add row state
                state.newCategory = '';
                state.isNewCategoryCustom = false;
                
                renderApp();
            } else if (button.classList.contains('remove-custom-item-btn')) {
                const row = button.closest('tr');
                if (!row) return;
                const customId = Number(row.dataset.customId);
                if (!isNaN(customId)) {
                    state.customItems = state.customItems.filter(item => item.id !== customId);
                    renderApp();
                }
            }
        });
    }

    $('#discount-select, #markup-points-select')?.addEventListener('change', (e) => {
        const target = e.target as HTMLSelectElement;
        if (target.id === 'discount-select') state.selectedDiscountId = target.value === 'none' ? 'none' : parseInt(target.value, 10);
        else state.markupPoints = Number(target.value);
        updateTotalsUI();
    });
}
