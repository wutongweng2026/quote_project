
import { state, supabase, getInitialSelection } from './state';
import { renderApp, showModal, updateTotalsUI, setSyncStatus, renderAdminDataTableBody } from './ui';
import { getFinalConfigText, calculateTotals } from './calculations';
import type { PostgrestError } from '@supabase/supabase-js';
import type { DbQuoteItem } from './types';

declare var XLSX: any;
const $ = (selector: string) => document.querySelector(selector);

// --- HELPER FUNCTIONS ---

async function updateLastUpdatedTimestamp() {
    const newTimestamp = new Date().toISOString();
    localStorage.removeItem('qqs_price_data_cache_v1'); // Invalidate cache
    const { error } = await supabase.from('quote_meta').upsert({
        key: 'last_prices_updated',
        value: newTimestamp
    });
    if (error) {
        console.error("Failed to update timestamp:", error);
    } else {
        state.lastUpdated = newTimestamp;
    }
}


// --- LOGIC FUNCTIONS ---

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

    const combinations = (
        candidates['主机'] || [{model: '', price: 0}]).flatMap(h => 
        (candidates['内存'] || [{model: '', price: 0}]).flatMap(r => 
        (candidates['硬盘'] || [{model: '', price: 0}]).flatMap(d1 => 
        (candidates['显卡'] || [{model: '', price: 0}]).flatMap(g => 
        (candidates['电源'] || [{model: '', price: 0}]).flatMap(p => 
        (candidates['显示器'] || [{model: '', price: 0}]).map(m => {
            const combo = { '主机': h.model, '内存': r.model, '硬盘1': d1.model, '显卡': g.model, '电源': p.model, '显示器': m.model };
            const price = h.price + r.price + d1.price + g.price + p.price + m.price;
            return { combo, price };
        })
    )))));

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

async function withButtonLoading(button: HTMLButtonElement, action: () => Promise<any>) {
    const originalText = button.innerHTML;
    button.disabled = true; button.innerHTML = `<span class="spinner"></span>`;
    try {
        await action();
        button.innerHTML = '已保存 ✓'; button.style.backgroundColor = '#16a34a';
    } catch (error: any) {
        button.innerHTML = '失败!'; button.style.backgroundColor = '#ef4444';
        showModal({ title: '操作失败', message: error.message });
    } finally {
        setTimeout(() => {
            button.disabled = false; button.innerHTML = originalText; button.style.backgroundColor = '';
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


// --- EVENT LISTENERS ---
export function addEventListeners() {}

export function attachModalListeners() {
    $('#custom-modal-confirm-btn')?.addEventListener('click', () => state.customModal.onConfirm?.());
    $('#custom-modal-cancel-btn')?.addEventListener('click', () => { state.showCustomModal = false; renderApp(); });
    $('#custom-modal-overlay')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget && state.customModal.isDismissible !== false) {
            state.showCustomModal = false; renderApp();
        }
    });
}

export function attachLoginListeners() {
    $('#login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const target = e.target as HTMLFormElement;
        const username = (target.elements.namedItem('username') as HTMLInputElement).value;
        const password = (target.elements.namedItem('password') as HTMLInputElement).value;
        const loginButton = target.querySelector('.auth-button') as HTMLButtonElement;
        const errorDiv = $('#login-error') as HTMLDivElement;

        loginButton.disabled = true; loginButton.innerHTML = `<span class="spinner"></span> 正在登录`; errorDiv.style.display = 'none';

        try {
            const { data: email, error: rpcError } = await supabase.rpc('get_email_by_username', { p_username: username });
            if (rpcError || !email) throw new Error('用户名或密码错误。');
            const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
            if (signInError) throw signInError;
        } catch (err: any) {
            errorDiv.textContent = '用户名或密码错误。'; errorDiv.style.display = 'block';
            loginButton.disabled = false; loginButton.innerHTML = '登录';
        }
    });
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
    $('.config-table')?.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        const row = target.closest('tr');
        if (!row || !target.classList.contains('quantity-input')) return;
        const quantity = Math.max(0, parseInt(target.value, 10) || 0);
        const category = row.dataset.category;
        if (category && state.selection[category]) { state.selection[category].quantity = quantity; updateTotalsUI(); }
    });
    $('.config-table')?.addEventListener('change', (e) => {
        const target = e.target as HTMLSelectElement;
        const row = target.closest('tr');
        if (!row || !target.classList.contains('model-select')) return;
        const category = row.dataset.category;
        if (category && state.selection[category]) { state.selection[category].model = target.value; updateTotalsUI(); }
    });
    $('#discount-select, #markup-points-select')?.addEventListener('change', (e) => {
        const target = e.target as HTMLSelectElement;
        if (target.id === 'discount-select') state.selectedDiscountId = target.value === 'none' ? 'none' : parseInt(target.value, 10);
        else state.markupPoints = Number(target.value);
        updateTotalsUI();
    });
}

export function attachAdminPanelListeners() {
    $('#back-to-quote-btn')?.addEventListener('click', () => { state.view = 'quote'; renderApp(); });

    $('#quick-add-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const category = (form.querySelector('#quick-add-category-input') as HTMLInputElement)?.value.trim();
        const model = (form.querySelector('#quick-add-model') as HTMLInputElement)?.value.trim();
        const price = parseFloat((form.querySelector('#quick-add-price') as HTMLInputElement)?.value);
        if (!category || !model || isNaN(price)) return showModal({ title: '输入错误', message: '请填写所有字段并确保价格有效。' });

        const button = form.querySelector('button') as HTMLButtonElement;
        await withButtonLoading(button, async () => {
            const { data, error } = await supabase.from('quote_items').upsert({ category, model, price }, { onConflict: 'category,model' }).select().single();
            if (error) throw error;
            const existingIndex = state.priceData.items.findIndex(i => i.category === category && i.model === model);
            if (existingIndex > -1) state.priceData.items[existingIndex] = data;
            else state.priceData.items.push(data);
            await updateLastUpdatedTimestamp();
            form.reset();
            renderApp();
        });
    });

    const debouncedUpdate = debounce(async (target: HTMLInputElement) => {
        const row = target.closest('.tier-row, .markup-point-row');
        if (!row) return; const id = parseInt((row as HTMLElement).dataset.id || ''); if (isNaN(id)) return;
        setSyncStatus('saving'); let error: PostgrestError | null = null;
        if (row.classList.contains('tier-row')) {
            const threshold = parseFloat((row.querySelector('.tier-threshold-input') as HTMLInputElement)?.value || '0');
            const rate = parseFloat((row.querySelector('.tier-rate-input') as HTMLInputElement)?.value || '10');
            ({ error } = await supabase.from('quote_discounts').update({ threshold, rate }).eq('id', id));
        } else if (row.classList.contains('markup-point-row')) {
            const alias = (row.querySelector('.markup-alias-input') as HTMLInputElement)?.value || '';
            const value = parseFloat((row.querySelector('.markup-value-input') as HTMLInputElement)?.value || '0');
            ({ error } = await supabase.from('quote_markups').update({ alias, value }).eq('id', id));
        }
        if (!error) await updateLastUpdatedTimestamp();
        setSyncStatus(error ? 'error' : 'saved');
    }, 700);

    $('#markup-points-list, #tiered-discount-list')?.addEventListener('input', (e) => debouncedUpdate(e.target as HTMLInputElement));
    
    $('.admin-content')?.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const button = target.closest('button');

        if (target.id === 'add-markup-point-btn' || target.closest('#add-markup-point-btn')) {
            const { data, error } = await supabase.from('quote_markups').insert({ alias: '新点位', value: 0 }).select().single();
            if (error) return showModal({ title: '添加失败', message: error.message });
            state.priceData.markupPoints.push(data); renderApp();
        }
        if (target.id === 'add-tier-btn' || target.closest('#add-tier-btn')) {
            const { data, error } = await supabase.from('quote_discounts').insert({ threshold: 0, rate: 10 }).select().single();
            if (error) return showModal({ title: '添加失败', message: error.message });
            state.priceData.tieredDiscounts.push(data); renderApp();
        }
        if (button?.classList.contains('remove-markup-point-btn') || button?.classList.contains('remove-tier-btn')) {
            const id = parseInt(button.dataset.id || ''); if (isNaN(id)) return;
            const isMarkup = button.classList.contains('remove-markup-point-btn');
            const table = isMarkup ? 'quote_markups' : 'quote_discounts';
            const { error } = await supabase.from(table).delete().eq('id', id);
            if (error) return showModal({ title: '删除失败', message: error.message });
            if (isMarkup) state.priceData.markupPoints = state.priceData.markupPoints.filter(p => p.id !== id);
            else state.priceData.tieredDiscounts = state.priceData.tieredDiscounts.filter(t => t.id !== id);
            renderApp();
        }
    });

    $('#admin-data-table-container')?.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement; const button = target.closest('button');
        if (target.matches('.priority-checkbox')) {
            const checkbox = target as HTMLInputElement; const row = checkbox.closest('tr'); const id = parseInt(row?.dataset.id || ''); if (!id) return;
            setSyncStatus('saving');
            const { error } = await supabase.from('quote_items').update({ is_priority: checkbox.checked }).eq('id', id);
            if (error) {
                setSyncStatus('error'); checkbox.checked = !checkbox.checked;
                showModal({ title: '更新失败', message: `无法更新优先推荐状态。\n错误: ${error.message}` });
            } else { setSyncStatus('saved'); await updateLastUpdatedTimestamp(); }
        }
        if (button?.classList.contains('admin-save-item-btn')) {
            const row = button.closest('tr'); if (!row) return; const { id } = row.dataset; const newPrice = parseFloat((row.querySelector('.price-input') as HTMLInputElement).value);
            if (!id || isNaN(newPrice)) return;
            await withButtonLoading(button, async () => {
                const { error } = await supabase.from('quote_items').update({ price: newPrice }).eq('id', id); if (error) throw error;
                const item = state.priceData.items.find(i => i.id === parseInt(id)); if (item) item.price = newPrice;
                await updateLastUpdatedTimestamp();
            });
        }
        if (button?.classList.contains('admin-delete-item-btn')) {
            const { category, model } = button.dataset; if (!category || !model) return;
            showModal({
                title: '确认删除', message: `确定要删除 "${category} - ${model}" 吗？`, showCancel: true, isDanger: true, confirmText: '删除',
                onConfirm: async () => {
                    const { error } = await supabase.from('quote_items').delete().match({ category, model });
                    if (error) return showModal({ title: '删除失败', message: error.message, isDanger: true });
                    state.showCustomModal = false; state.priceData.items = state.priceData.items.filter(i => !(i.category === category && i.model === model));
                    await updateLastUpdatedTimestamp(); renderApp();
                }
            });
        }
    });

    $('#admin-search-input')?.addEventListener('input', (e) => {
        state.adminSearchTerm = (e.target as HTMLInputElement).value;
        const tableBody = $('.admin-data-table tbody'); if (tableBody) tableBody.innerHTML = renderAdminDataTableBody();
    });

    $('#import-excel-btn')?.addEventListener('click', () => ($('#import-file-input') as HTMLInputElement)?.click());
    $('#import-file-input')?.addEventListener('change', (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            const data = new Uint8Array(event.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(worksheet, { header: ["category", "model", "price"] });
            const itemsToUpsert = (json as Omit<DbQuoteItem, 'id'|'is_priority'>[]).slice(1).filter(i => i.category && i.model && !isNaN(Number(i.price)));
            if (itemsToUpsert.length === 0) return showModal({ title: "导入失败", message: "Excel文件格式不正确或没有有效数据。请确保A, B, C列分别为'分类', '型号', '单价'。" });
            
            showModal({
                title: `确认导入 ${itemsToUpsert.length} 条数据`, message: "这将更新或添加Excel中的所有配件。此操作不可逆。", showCancel: true, confirmText: "确认",
                onConfirm: async () => {
                    const { error } = await supabase.from('quote_items').upsert(itemsToUpsert, { onConflict: 'category,model' });
                    state.showCustomModal = false;
                    if (error) return showModal({ title: "导入失败", message: error.message });
                    await updateLastUpdatedTimestamp();
                    showModal({ title: "导入成功", message: `成功导入 ${itemsToUpsert.length} 条数据。`, onConfirm: () => location.reload() });
                }
            });
        };
        reader.readAsArrayBuffer(file);
    });
}

export function attachUserManagementListeners() {
    $('#back-to-quote-btn')?.addEventListener('click', () => { state.view = 'quote'; renderApp(); });

    const container = $('.user-management-container');
    if (!container) return;

    container.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const button = target.closest('button');
        if (!button) return;

        const row = target.closest('tr');
        const userId = row?.dataset.userId;

        if (button.id === 'add-new-user-btn') {
            showModal({
                title: '添加新用户',
                message: `
                    <div class="auth-input-group">
                        <label for="new-email">邮箱</label>
                        <input type="email" id="new-email" required>
                    </div>
                    <div class="auth-input-group">
                        <label for="new-password">密码</label>
                        <input type="password" id="new-password" required>
                    </div>
                     <div class="auth-input-group">
                        <label for="new-fullname">用户名</label>
                        <input type="text" id="new-fullname" required>
                    </div>
                    <div class="auth-input-group">
                        <label for="new-role">角色</label>
                        <select id="new-role">
                            <option value="sales">销售</option>
                            <option value="manager">后台管理</option>
                            <option value="admin">管理员</option>
                        </select>
                    </div>
                `,
                showCancel: true,
                confirmText: '创建',
                onConfirm: async () => {
                    const email = ($('#new-email') as HTMLInputElement).value;
                    const password = ($('#new-password') as HTMLInputElement).value;
                    const fullName = ($('#new-fullname') as HTMLInputElement).value;
                    const role = ($('#new-role') as HTMLSelectElement).value;

                    if (!email || !password || !fullName) {
                        state.customModal.errorMessage = "所有字段均为必填项。";
                        return renderApp();
                    }
                    
                    try {
                        const { data: { user }, error: createError } = await supabase.auth.admin.createUser({
                            email, password, email_confirm: true,
                        });

                        if (createError) throw createError;
                        if (!user) throw new Error("未能创建用户。");

                        const { error: profileError } = await supabase.from('profiles').insert({
                            id: user.id, full_name: fullName, role, is_approved: true
                        });
                        
                        if (profileError) {
                            await supabase.auth.admin.deleteUser(user.id);
                            throw profileError;
                        }
                        
                        const { data: allProfiles } = await supabase.from('profiles').select('*');
                        state.profiles = allProfiles || [];
                        state.showCustomModal = false;
                        renderApp();
                    } catch (err: any) {
                        state.customModal.errorMessage = `创建失败: ${err.message}`;
                        renderApp();
                    }
                }
            });
        }

        if (!userId) return;

        if (button.classList.contains('approve-user-btn')) {
            const { error } = await supabase.from('profiles').update({ is_approved: true }).eq('id', userId);
            if (error) return showModal({ title: '错误', message: `批准用户失败: ${error.message}` });
            const profile = state.profiles.find(p => p.id === userId);
            if (profile) profile.is_approved = true;
            renderApp();
        }

        if (button.classList.contains('permission-toggle-btn')) {
            const action = button.dataset.action;
            const newRole = action === 'grant' ? 'manager' : 'sales';
            const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
            if (error) return showModal({ title: '错误', message: `更新权限失败: ${error.message}` });
            const profile = state.profiles.find(p => p.id === userId);
            if (profile) profile.role = newRole as 'sales' | 'manager';
            renderApp();
        }

        if (button.classList.contains('delete-user-btn')) {
            showModal({
                title: '确认删除',
                message: `确定要永久删除此用户吗？此操作无法撤销。`,
                showCancel: true, isDanger: true, confirmText: '确认删除',
                onConfirm: async () => {
                    try {
                        const { error: adminError } = await supabase.auth.admin.deleteUser(userId);
                        if (adminError) throw adminError;
                        
                        state.profiles = state.profiles.filter(p => p.id !== userId);
                        state.showCustomModal = false;
                        renderApp();
                    } catch(err: any) {
                        showModal({title: "删除失败", message: err.message, isDanger: true});
                    }
                }
            });
        }
    });
}


export function attachLoginLogListeners() {
    $('#back-to-quote-btn')?.addEventListener('click', () => { state.view = 'quote'; renderApp(); });
}