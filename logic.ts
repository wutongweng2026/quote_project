import { state, supabase, getInitialSelection } from './state';
import { renderApp, showModal, updateTotalsUI, setSyncStatus } from './ui';
import { getFinalConfigText, calculateTotals } from './calculations';
import type { PostgrestError } from '@supabase/supabase-js';

declare var XLSX: any;
const $ = (selector: string) => document.querySelector(selector);

// --- LOGIC FUNCTIONS ---

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


// --- EVENT LISTENERS ---

export function addEventListeners() {
    const appContainer = $('#app')!;

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

        // --- MODAL CLICK HANDLER ---
        // This logic runs first to ensure modals can always be closed.
        if (state.showCustomModal) {
            const confirmButton = target.closest('#custom-modal-confirm-btn');
            const cancelButton = target.closest('#custom-modal-cancel-btn');
            const overlay = target.matches('.modal-overlay');

            if (confirmButton) {
                state.customModal.onConfirm?.(); // Execute callback if it exists
                state.showCustomModal = false;
                renderApp();
                return; // Stop further processing
            }
            if (cancelButton || overlay) {
                state.showCustomModal = false;
                renderApp();
                return; // Stop further processing
            }
            // If the click is inside the modal content but not a button, do nothing.
            if(target.closest('.modal-content')) {
                return;
            }
        }
        
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
             if (!error) {
                const tier = state.priceData.tieredDiscounts.find(t => t.id === id);
                if (tier) {
                    tier.threshold = threshold;
                    tier.rate = rate;
                }
            }
        } else if (row.classList.contains('markup-point-row')) {
            const alias = (row.querySelector('.markup-alias-input') as HTMLInputElement)?.value || '';
            const value = parseFloat((row.querySelector('.markup-value-input') as HTMLInputElement)?.value || '0');
            ({ error } = await supabase.from('quote_markups').update({ alias, value }).eq('id', id));
            if (!error) {
                const point = state.priceData.markupPoints.find(p => p.id === id);
                if (point) {
                    point.alias = alias;
                    point.value = value;
                }
            }
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
                    const modelIndex = headers.findIndex(h => ['型号', '型号名称', 'Model'].includes(h));
                    const priceIndex = headers.findIndex(h => ['单价', '成本', '成本单价', 'Price', 'Cost'].includes(h));

                    if (categoryIndex === -1 || modelIndex === -1 || priceIndex === -1) {
                        throw new Error('Excel文件必须包含 "分类", "型号"(或"型号名称"), 和 "单价"(或"成本单价") 这几列。');
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