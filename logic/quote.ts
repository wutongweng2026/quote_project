

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
    
    // --- 优先提取场景关键词 ---
    // 如果用户的输入包含了某些主机预设的 "应用场景" 标签，我们做特殊标记
    
    allCategories.forEach(catName => {
        const items = state.priceData.items.filter(i => i.category === catName);
        
        // 1. 尝试场景匹配 (优先匹配 application_scenarios)
        const scenarioMatches = items.filter(i => {
            if (!i.application_scenarios || i.application_scenarios.length === 0) return false;
            // 检查是否有任何场景标签包含在用户输入中 (模糊匹配)
            // 比如标签是 "机器学习", 用户输入 "我要做机器学习" -> 匹配
            return i.application_scenarios.some(tag => userInput.includes(tag.toLowerCase()));
        });

        // 2. 尝试模型/关键词匹配
        const keywordMatches = items.filter(i => i.model.toLowerCase().split(/[\s/+\-,]/).some(token => token && userInput.includes(token)));
        
        let selection: {model: string, price: number}[] = [];

        if (scenarioMatches.length > 0) {
            // 如果命中场景，优先使用场景匹配的项
            selection = scenarioMatches.map(i => ({ model: i.model, price: i.price }));
        } else if (keywordMatches.length > 0) {
            // 其次是关键词匹配
            selection = keywordMatches.map(i => ({ model: i.model, price: i.price }));
        } else {
            // 最后是优先勾选的项 (兜底)
            const priorityItems = items.filter(i => i.is_priority);
            const baseItems = priorityItems.length > 0 ? priorityItems : items;
            
            selection = baseItems.map(i => ({ model: i.model, price: i.price }));
            
            // 如果是可选配件（显卡/显示器），且用户没有明确指定关键词，则添加"无"选项
            if (optionalCategories.includes(catName)) {
                selection.unshift({ model: '', price: 0 });
            }
        }
        candidates[catName] = selection;
    });

    let bestCombo: Record<string, string> | null = null;
    
    // 如果没有预算限制，直接选每个分类的第一项（因为上面已经按 场景 > 关键词 > 优先 排序了筛选结果）
    // 这里为了简化，我们取第一个"有效"的组合。
    
    const combo: Record<string, string> = {};
    Object.keys(candidates).forEach(cat => {
        const opts = candidates[cat];
        if (opts.length > 0) {
            combo[cat] = opts[0].model;
        }
    });
    
    // 如果有预算逻辑，这里可以扩展为寻找最接近预算的组合
    // 目前版本先实现"最相关推荐"
    bestCombo = combo;

    if (bestCombo) {
        state.selection = getInitialSelection();
        // 清空默认数量
        Object.keys(state.selection).forEach(key => state.selection[key].quantity = 0);
        
        Object.entries(bestCombo).forEach(([cat, model]) => {
            if (!model) return; // 跳过空选项
            
            // 映射回 SelectionState
            if (cat === '硬盘') {
                // 简单处理：放入硬盘1
                if (state.selection['硬盘1']) state.selection['硬盘1'] = { model, quantity: 1 };
                else if (state.selection['硬盘']) state.selection['硬盘'] = { model, quantity: 1 };
            } else if (state.selection[cat]) {
                state.selection[cat] = { model, quantity: 1 };
            }
        });
        
        // Update View
        state.showFinalQuote = true;
        renderApp();
        showModal({ 
            title: 'AI 推荐完成', 
            message: `已为您生成最匹配"${userInput.substring(0, 10)}${userInput.length>10?'...':''}"的配置方案。${budget > 0 ? `<br>预算参考: ${budget}` : ''}`, 
            confirmText: '查看配置' 
        });
    } else {
        showModal({ title: '匹配失败', message: '未能找到合适的配置方案，请尝试更详细的描述。', isDanger: true });
    }
}

export function attachQuoteToolListeners() {
    $('#match-config-btn')?.addEventListener('click', () => {
        const input = ($('#matcher-input') as HTMLInputElement).value.trim();
        if (!input) return showModal({ title: '请输入需求', message: '请描述您的需求或粘贴配置清单。', isDanger: true });
        
        // Simple heuristic: if input contains "*" or "x" followed by number, or "|" separators, treat as config list.
        // Otherwise treat as natural language description.
        if (/[*x×]\s*\d+|[|\n]/.test(input)) {
            parseConfigInput(input);
        } else {
            handleBudgetRecommendation(input);
        }
    });

    // Global Quantity
    $('#qty-minus')?.addEventListener('click', () => {
        if (state.globalQuantity > 1) { state.globalQuantity--; renderApp(); }
    });
    $('#qty-plus')?.addEventListener('click', () => {
        state.globalQuantity++; renderApp();
    });
    $('#global-qty-input')?.addEventListener('change', (e) => {
        const val = parseInt((e.target as HTMLInputElement).value);
        if (val > 0) { state.globalQuantity = val; renderApp(); }
    });

    // Reset
    $('#reset-btn')?.addEventListener('click', () => {
        state.selection = getInitialSelection();
        state.customItems = [];
        state.showFinalQuote = false;
        state.globalQuantity = 1;
        state.selectedDiscountId = 'none';
        state.specialDiscount = 0;
        state.isNewCategoryCustom = false;
        state.newCategory = '';
        renderApp();
    });

    // Calculate (Toggle View)
    $('#calc-quote-btn')?.addEventListener('click', () => {
        state.showFinalQuote = true;
        renderApp();
        // Scroll to bottom
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    });
    
    // Generate Excel
    $('#generate-quote-btn')?.addEventListener('click', () => {
         generateQuoteExcel();
    });

    // Model Selects
    document.querySelectorAll('.model-select').forEach(el => {
        el.addEventListener('change', (e) => {
            const target = e.target as HTMLSelectElement;
            const category = target.closest('tr')?.dataset.category;
            if (category && state.selection[category]) {
                state.selection[category].model = target.value;
                state.showFinalQuote = false; // Reset quote view on change
                renderApp();
            }
        });
    });

    // Quantity Inputs
    document.querySelectorAll('.quantity-input').forEach(el => {
        el.addEventListener('input', (e) => {
            const target = e.target as HTMLInputElement;
            const category = target.closest('tr')?.dataset.category;
            if (category && state.selection[category]) {
                state.selection[category].quantity = parseInt(target.value) || 0;
                renderApp(); // Re-render to update totals
            }
        });
    });

    // Add Category Logic
    $('#new-category-select')?.addEventListener('change', (e) => {
        const val = (e.target as HTMLSelectElement).value;
        if (val === 'custom') {
            state.isNewCategoryCustom = true;
            state.newCategory = '';
        } else {
            state.isNewCategoryCustom = false;
            state.newCategory = val;
        }
        renderApp();
        // Focus input if custom
        if (state.isNewCategoryCustom) ($('#new-category-input') as HTMLElement)?.focus();
    });

    $('#new-category-input')?.addEventListener('input', (e) => {
        state.newCategory = (e.target as HTMLInputElement).value;
    });

    $('#add-category-btn')?.addEventListener('click', () => {
        if (!state.newCategory) return;
        const newId = state.customItems.length > 0 ? Math.max(...state.customItems.map(i => i.id)) + 1 : 1;
        state.customItems.push({
            id: newId,
            category: state.newCategory,
            model: '',
            quantity: 1
        });
        state.newCategory = '';
        state.isNewCategoryCustom = false;
        renderApp();
    });
    
    // Custom Items Listeners (Delete, Model, Qty)
    document.querySelectorAll('.remove-custom-item-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const row = (e.target as HTMLElement).closest('tr');
            const id = parseInt(row?.dataset.customId || '');
            if (id) {
                state.customItems = state.customItems.filter(i => i.id !== id);
                renderApp();
            }
        });
    });
    
    document.querySelectorAll('.custom-model-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const row = (e.target as HTMLElement).closest('tr');
            const id = parseInt(row?.dataset.customId || '');
            if (id) {
                const item = state.customItems.find(i => i.id === id);
                if (item) item.model = (e.target as HTMLInputElement).value;
            }
        });
    });
    
     document.querySelectorAll('.custom-model-select').forEach(input => {
        input.addEventListener('change', (e) => {
            const row = (e.target as HTMLElement).closest('tr');
            const id = parseInt(row?.dataset.customId || '');
            if (id) {
                const item = state.customItems.find(i => i.id === id);
                if (item) item.model = (e.target as HTMLSelectElement).value;
            }
        });
    });

    document.querySelectorAll('.custom-quantity-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const row = (e.target as HTMLElement).closest('tr');
            const id = parseInt(row?.dataset.customId || '');
            if (id) {
                const item = state.customItems.find(i => i.id === id);
                if (item) {
                     item.quantity = parseInt((e.target as HTMLInputElement).value) || 0;
                     renderApp();
                }
            }
        });
    });
    
    // Discounts
    $('#discount-select')?.addEventListener('change', (e) => {
        const val = (e.target as HTMLSelectElement).value;
        state.selectedDiscountId = val === 'none' ? 'none' : parseInt(val);
        renderApp();
    });

    $('#markup-points-select')?.addEventListener('change', (e) => {
        state.markupPoints = parseInt((e.target as HTMLSelectElement).value);
        renderApp();
    });

    $('#special-discount-input')?.addEventListener('input', (e) => {
        state.specialDiscount = parseFloat((e.target as HTMLInputElement).value) || 0;
        updateTotalsUI(); // Optimize: don't full render, just update totals
    });
    
    // Nav
    $('#app-view-toggle-btn')?.addEventListener('click', () => { state.view = 'admin'; renderApp(); });
    $('#login-log-btn')?.addEventListener('click', () => { state.view = 'loginLog'; renderApp(); });
    $('#user-management-btn')?.addEventListener('click', () => { state.view = 'userManagement'; renderApp(); });
    $('#logout-btn')?.addEventListener('click', async () => {
        await supabase.auth.signOut();
        // Listener in appController will handle state update
    });
    $('#change-password-btn')?.addEventListener('click', () => {
        showModal({
            title: '修改密码',
            message: `
                <div class="auth-input-group">
                    <label>新密码</label>
                    <input type="password" id="new-pwd" class="form-input" placeholder="至少6位字符">
                </div>
            `,
            showCancel: true,
            confirmText: '确认修改',
            onConfirm: async () => {
                const pwd = ($('#new-pwd') as HTMLInputElement).value.trim();
                if (pwd.length < 6) return showModal({ title: '错误', message: '密码长度不能少于6位', isDanger: true });
                const { error } = await supabase.auth.updateUser({ password: pwd });
                if (error) showModal({ title: '修改失败', message: error.message, isDanger: true });
                else {
                    state.showCustomModal = false;
                    showModal({ title: '成功', message: '密码已修改。' });
                }
            }
        });
    });
}

function generateQuoteExcel() {
    // Generate data rows
    const rows = [];
    rows.push(['配件类型', '型号/规格', '数量', '单价', '总价']);
    
    // Standard items
    Object.entries(state.selection).forEach(([cat, { model, quantity }]) => {
        if (model && quantity > 0) {
            const dataCategory = cat.startsWith('硬盘') ? '硬盘' : cat;
            const unitPrice = state.priceData.prices[dataCategory]?.[model] || 0;
            rows.push([cat, model, quantity, unitPrice, unitPrice * quantity]);
        }
    });
    
    // Custom items
    state.customItems.forEach(item => {
        if (item.model && item.quantity > 0) {
             const unitPrice = state.priceData.prices[item.category]?.[item.model] || 0;
             rows.push([item.category, item.model, item.quantity, unitPrice, unitPrice * item.quantity]);
        }
    });
    
    const totals = calculateTotals();
    rows.push(['', '', '', '', '']);
    rows.push(['', '', '数量小计', state.globalQuantity, '']);
    rows.push(['', '', '最终报价', '', totals.finalPrice]);
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "报价单");
    XLSX.writeFile(wb, `报价单_${new Date().toISOString().slice(0,10)}.xlsx`);
}