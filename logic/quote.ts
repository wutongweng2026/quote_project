

import { state, supabase, getInitialSelection } from '../state';
import { renderApp, showModal, updateTotalsUI } from '../ui';
import { calculateTotals } from '../calculations';

declare var XLSX: any;
const $ = (selector: string) => document.querySelector(selector);

function handleSmartRecommendation() {
    const input = ($('#matcher-input') as HTMLTextAreaElement | HTMLInputElement).value;
    if (!input || !input.trim()) {
        showModal({ title: '请输入需求', message: '请在文本框中输入预算（如“8000元”）或特定配置需求（如“4060显卡”）。' });
        return;
    }

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
    
    allCategories.forEach(catName => {
        const items = state.priceData.items.filter(i => i.category === catName);
        const userMatches = items.filter(i => i.model.toLowerCase().split(/[\s/+\-,]/).some(token => token && userInput.includes(token)));
        
        if (userMatches.length > 0) {
            candidates[catName] = userMatches.map(i => ({ model: i.model, price: i.price }));
        } else {
            const priorityItems = items.filter(i => i.is_priority);
            candidates[catName] = (priorityItems.length > 0 ? priorityItems : items).map(i => ({ model: i.model, price: i.price }));
        }
    });

    let bestCombo: Record<string, string> | null = null;
    let minDiff = budget > 0 ? Infinity : -Infinity;

    // Updated combination logic to include CPU
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
            if (price <= budget && (budget - price) < minDiff) {
                minDiff = budget - price;
                bestCombo = combo;
            }
        } else {
            if (price > minDiff) {
                minDiff = price;
                bestCombo = combo;
            }
        }
    }

    if (bestCombo) {
        Object.keys(bestCombo).forEach(cat => { if (state.selection[cat]) state.selection[cat].model = bestCombo[cat]; });
        state.selectedDiscountId = 'none'; state.showFinalQuote = true; renderApp();
    } else {
        showModal({ title: '无法匹配', message: '未找到符合条件的配置组合，请尝试调整预算或描述。' });
    }
}

function handleExportExcel() {
    const totals = calculateTotals();
    const configParts = [...Object.values(state.selection), ...state.customItems]
        .filter(({ model, quantity }) => model && quantity > 0).map(({ model }) => model);
    if (configParts.length === 0) return showModal({ title: '无法导出', message: '请先选择至少一个配件再导出报价单。' });

    const mainframeModel = state.selection['主机']?.model || '';
    const modelCode = mainframeModel.split(' ')[0] || '自定义主机';
    const aoa = [
        ['型号', '配置', '数量', '单价', '总价', '备注'],
        [modelCode, configParts.join(' | '), 1, totals.finalPrice, totals.finalPrice, '含13%增值税发票'],
        [null, '总计', null, null, totals.finalPrice, null], [], [], [], [],
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
        state.showFinalQuote = false; state.selectedDiscountId = 'none'; renderApp();
    });
    $('#match-config-btn')?.addEventListener('click', handleSmartRecommendation);
    $('#generate-quote-btn')?.addEventListener('click', handleExportExcel);
    $('#calc-quote-btn')?.addEventListener('click', () => { state.showFinalQuote = true; renderApp(); });
    $('#special-discount-input')?.addEventListener('input', (e) => { state.specialDiscount = Math.max(0, Number((e.target as HTMLInputElement).value)); updateTotalsUI(); });

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
