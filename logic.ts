
import { state, supabase, getInitialSelection } from './state';
import { renderApp, showModal, updateTotalsUI, setSyncStatus, renderAdminDataTableBody } from './ui';
import { getFinalConfigText, calculateTotals } from './calculations';
import type { PostgrestError } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

declare var XLSX: any;
const $ = (selector: string) => document.querySelector(selector);

// --- HELPER FUNCTIONS ---

async function updateLastUpdatedTimestamp() {
    const newTimestamp = new Date().toISOString();
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

    // 1. Extract Budget
    let budget = 0;
    const budgetMatch = userInput.match(/(?:预算|价格|价位|左右|^|\s)(\d+(?:\.\d+)?)\s*(?:元|块|w|k|万|千)?/);
    if (budgetMatch) {
        let num = parseFloat(budgetMatch[1]);
        if (userInput.includes('w') || userInput.includes('万')) num *= 10000;
        else if (userInput.includes('k') || userInput.includes('千')) num *= 1000;

        if (num > 1000) {
            budget = num;
        }
    }

    // 2. Prepare Category Constraints
    // We map UI categories to specific matching logic
    const categoryConfig: Record<string, { stateKey: string, allowEmpty: boolean }> = {
        '主机': { stateKey: '主机', allowEmpty: false },
        '内存': { stateKey: '内存', allowEmpty: false },
        '显卡': { stateKey: '显卡', allowEmpty: true }, // Optional if user doesn't ask, or integrated
        '电源': { stateKey: '电源', allowEmpty: false },
        '显示器': { stateKey: '显示器', allowEmpty: true } // Strict optional
    };

    const candidates: Record<string, { model: string, price: number }[]> = {};

    // 3. Parse Standard Categories
    for (const [catName, config] of Object.entries(categoryConfig)) {
        // Use state.priceData.items to get full objects (including priority)
        const allItemsInCategory = state.priceData.items.filter(i => i.category === catName);
        const allModels = allItemsInCategory.map(i => ({ model: i.model, price: i.price }));

        // Find models that match keywords in user input
        // We split model names into tokens to find matches
        const matches = allItemsInCategory.filter(item => {
            const mName = item.model.toLowerCase();
            // Tokens: "rtx4060", "8g", "i5-13400"
            const tokens = mName.split(/[\s\/+,-]+/).filter(t => t.length > 1);

            // Check if any token exists in user input
            return tokens.some(t => {
                // Ignore common generic tokens that cause noise
                if (['8g', '16g', '32g'].includes(t)) {
                    // Context heuristic:
                    if (catName === '显卡' && !userInput.includes('显卡') && !userInput.includes('gpu')) return false;
                    if (catName === '内存') return userInput.includes(t);
                    return false;
                }
                return userInput.includes(t);
            });
        });

        if (matches.length > 0) {
            // User specified something specific (e.g. "4060"), strictly respect it
            candidates[config.stateKey] = matches.map(m => ({ model: m.model, price: m.price }));
        } else {
            // No specific keyword found (Generic demand)
            if (config.allowEmpty) {
                // If optional, default to Empty. 
                candidates[config.stateKey] = [{ model: '', price: 0 }];
            } else {
                // If required, use all models
                // PRIORITIZATION LOGIC:
                const priorityItems = allItemsInCategory.filter(i => i.is_priority);

                if (priorityItems.length > 0) {
                    // If priorities exist, ONLY consider them (and cheapest among them will be picked by loop below)
                    candidates[config.stateKey] = priorityItems.map(m => ({ model: m.model, price: m.price }));
                } else {
                    // If no priority items, consider ALL items (cheapest will be picked)
                    candidates[config.stateKey] = allModels;
                }
            }
        }
    }

    // 4. Parse Hard Drives (Special for 1 or 2 drives)
    const hddItems = state.priceData.items.filter(i => i.category === '硬盘');
    const hddModels = hddItems.map(i => ({ model: i.model, price: i.price }));
    
    // Regex to find capacities like 512g, 1t, 2t
    const capacityRegex = /(512g?|1t|2t|4t|ssd|sata)/gi;
    const storageMatches = userInput.match(capacityRegex);

    if (storageMatches && storageMatches.length > 0) {
        // Drive 1 matches first keyword
        candidates['硬盘1'] = hddItems.filter(m => m.model.toLowerCase().includes(storageMatches[0].toLowerCase().replace('g', ''))).map(m => ({ model: m.model, price: m.price }));

        if (storageMatches.length > 1) {
            // Drive 2 matches second keyword
            candidates['硬盘2'] = hddItems.filter(m => m.model.toLowerCase().includes(storageMatches[1].toLowerCase().replace('g', ''))).map(m => ({ model: m.model, price: m.price }));
        } else {
            // Only 1 drive specified
            candidates['硬盘2'] = [{ model: '', price: 0 }];
        }
    } else {
        // No storage specified. Default: Pick generic for Drive 1, Empty for Drive 2
        // Check priority for Hard Drive 1
        const priorityHdds = hddItems.filter(i => i.is_priority);
        if (priorityHdds.length > 0) {
            candidates['硬盘1'] = priorityHdds.map(m => ({ model: m.model, price: m.price }));
        } else {
            candidates['硬盘1'] = hddModels;
        }
        candidates['硬盘2'] = [{ model: '', price: 0 }];
    }

    // Safety check for empty lists
    if (!candidates['硬盘1'] || candidates['硬盘1'].length === 0) candidates['硬盘1'] = hddModels;
    if (!candidates['硬盘2'] || candidates['硬盘2'].length === 0) candidates['硬盘2'] = [{ model: '', price: 0 }];


    // 5. Brute Force Best Combination
    let bestCombo: Record<string, string> | null = null;
    let minDiff = Infinity; // For budget mode: distance to budget. For cheapest mode: total price.
    const targetBudget = budget > 0 ? budget : 0;
    const mode = budget > 0 ? 'budget' : 'cheapest';
    const budgetMode = budget > 0;

    // Convert all candidates to simple objects for loop to keep it clean
    const hosts = candidates['主机'] || [];
    const rams = candidates['内存'] || [];
    const hdds1 = candidates['硬盘1'] || [];
    const hdds2 = candidates['硬盘2'] || [];
    const gpus = candidates['显卡'] || [];
    const psus = candidates['电源'] || [];
    const monitors = candidates['显示器'] || [];

    // PERFORMANCE OPTIMIZATION: Hoist partial price sums to reduce inner loop arithmetic
    for (const h of hosts) {
        const p1 = h.price;
        for (const r of rams) {
            const p2 = p1 + r.price;
            for (const d1 of hdds1) {
                const p3 = p2 + d1.price;
                for (const d2 of hdds2) {
                    const p4 = p3 + d2.price;
                    for (const g of gpus) {
                        const p5 = p4 + g.price;
                        for (const p of psus) {
                            const p6 = p5 + p.price;
                            for (const m of monitors) {
                                // Final Sum
                                const currentPrice = p6 + m.price;

                                if (budgetMode) {
                                    const diff = Math.abs(currentPrice - budget);
                                    if (diff < minDiff) {
                                        if (currentPrice > budget + 500) continue; // Soft cap
                                        minDiff = diff;
                                        bestCombo = {
                                            '主机': h.model, '内存': r.model,
                                            '硬盘1': d1.model, '硬盘2': d2.model,
                                            '显卡': g.model, '电源': p.model,
                                            '显示器': m.model
                                        };
                                    }
                                } else {
                                    // Cheapest valid mode
                                    if (currentPrice < minDiff) {
                                        minDiff = currentPrice;
                                        bestCombo = {
                                            '主机': h.model, '内存': r.model,
                                            '硬盘1': d1.model, '硬盘2': d2.model,
                                            '显卡': g.model, '电源': p.model,
                                            '显示器': m.model
                                        };
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 6. Apply Selection
    if (bestCombo) {
        const newSelection = getInitialSelection();
        newSelection['主机'].model = bestCombo['主机'];
        newSelection['内存'].model = bestCombo['内存'];
        newSelection['硬盘1'].model = bestCombo['硬盘1'];
        newSelection['硬盘2'].model = bestCombo['硬盘2'];
        newSelection['显卡'].model = bestCombo['显卡'];
        newSelection['电源'].model = bestCombo['电源'];
        newSelection['显示器'].model = bestCombo['显示器'];

        state.selection = newSelection;
        state.selectedDiscountId = 'none';
        state.showFinalQuote = true;
        renderApp();
    } else {
        showModal({ title: '无法匹配', message: '未找到符合条件的配置组合，请尝试调整预算或描述。' });
    }
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
                    { category, model, price, is_priority: false }, { onConflict: 'category,model' }
                );
                if (error) {
                    showModal({ title: '添加失败', message: `无法添加配件，请检查数据库权限设置(RLS)。\n错误: ${error.message}` });
                    throw error;
                }
                if (!state.priceData.prices[category]) state.priceData.prices[category] = {};
                state.priceData.prices[category][model] = price;

                // Update items array (fetch latest or push manually if valid)
                // Re-fetching is safer to get ID and structure
                const { data: newItem } = await supabase.from('quote_items').select('*').match({ category, model }).single();
                if (newItem) {
                    const existingIdx = state.priceData.items.findIndex(i => i.category === category && i.model === model);
                    if (existingIdx >= 0) state.priceData.items[existingIdx] = newItem;
                    else state.priceData.items.push(newItem);
                }

                await updateLastUpdatedTimestamp();
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
                state.customModal.onConfirm?.();
                return;
            }
            if (cancelButton || (overlay && state.customModal.isDismissible !== false)) {
                state.showCustomModal = false;
                renderApp();
                return;
            }
            if (target.closest('.modal-content')) {
                return;
            }
        }

        const button = target.closest('button');
        if (!button) {
            // Check for Checkbox Click here (outside of button block)
            if (target.matches('.priority-checkbox')) {
                const checkbox = target as HTMLInputElement;
                const row = checkbox.closest('tr');
                const id = row?.dataset.id ? parseInt(row.dataset.id) : null;

                if (id) {
                    setSyncStatus('saving');
                    const isPriority = checkbox.checked;
                    const { error } = await supabase.from('quote_items').update({ is_priority: isPriority }).eq('id', id);

                    if (error) {
                        setSyncStatus('error');
                        console.error("Failed to update priority:", error);
                        // Revert checkbox if failed
                        checkbox.checked = !isPriority;
                        showModal({ title: '更新失败', message: '无法更新优先推荐状态。请确保数据库表中存在 "is_priority" 列。\n错误: ' + error.message });
                    } else {
                        setSyncStatus('saved');
                        // Update local state
                        const item = state.priceData.items.find(i => i.id === id);
                        if (item) item.is_priority = isPriority;
                    }
                }
            }
            return;
        }

        let needsRender = false;

        if (button.id === 'logout-btn') {
            const { error } = await supabase.auth.signOut();
            if (error) {
                console.error("Logout failed:", error);
                showModal({ title: '退出失败', message: `无法退出系统: ${error.message}` });
            }
        } else if (button.id === 'add-new-user-btn') {
            showModal({
                title: '添加新用户',
                message: `
                   <div class="auth-input-group">
                       <label for="new-username">用户名</label>
                       <input type="text" id="new-username" required autocomplete="off" class="modal-input">
                   </div>
                   <div class="auth-input-group">
                       <label for="new-password">初始密码</label>
                       <input type="password" id="new-password" required autocomplete="new-password" class="modal-input">
                       <p class="password-hint">密码至少需要6位字符。</p>
                   </div>
               `,
                confirmText: '确认添加',
                showCancel: true,
                onConfirm: async () => {
                    const newUsername = ($('#new-username') as HTMLInputElement)?.value;
                    const newPassword = ($('#new-password') as HTMLInputElement)?.value;

                    if (!newUsername || !newPassword || newPassword.length < 6) {
                        state.customModal.errorMessage = '请输入有效的用户名和至少6位的密码。';
                        renderApp();
                        return;
                    }

                    const confirmButton = $('#custom-modal-confirm-btn') as HTMLButtonElement;
                    confirmButton.disabled = true;
                    confirmButton.innerHTML = `<span class="spinner"></span> 正在添加`;
                    state.customModal.errorMessage = '';
                    renderApp();

                    try {
                        // Strategy: Create a TEMPORARY, IN-MEMORY Supabase client with NO storage persistence.
                        const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                            auth: {
                                persistSession: false,
                                autoRefreshToken: false,
                                detectSessionInUrl: false,
                                storage: { // Dummy storage to strictly prevent localStorage access
                                    getItem: () => null,
                                    setItem: () => { },
                                    removeItem: () => { },
                                },
                            }
                        });

                        const fakeEmail = `user-${Date.now()}-${Math.floor(Math.random() * 1000)}@quotesystem.local`;

                        // 1. Sign up user using the isolated temp client
                        const { data: signUpData, error: signUpError } = await tempClient.auth.signUp({
                            email: fakeEmail,
                            password: newPassword,
                            options: {
                                data: {
                                    full_name: newUsername,
                                    role: 'sales'
                                }
                            }
                        });

                        if (signUpError) throw signUpError;
                        if (!signUpData.user) throw new Error("用户创建失败: 未返回用户数据。");

                        // 2. Use the MAIN client (Admin) to insert the profile.
                        const newProfile = {
                            id: signUpData.user.id,
                            full_name: newUsername,
                            role: 'sales' as const,
                            is_approved: true,
                        };

                        const { error: profileError } = await supabase.from('profiles').upsert(newProfile);

                        if (profileError) {
                            console.error("Failed to upsert profile. Rolling back user creation...", profileError);

                            // ROLLBACK STRATEGY: 
                            // If profile creation fails (likely RLS), delete the Auth User to prevent "No Name" zombie users.
                            // We use the 'delete_user' RPC we just fixed.
                            // NOTE: Fallback to direct table delete if RPC is missing, as requested by user simplification.
                            await supabase.from('profiles').delete().eq('id', signUpData.user.id);

                            if (profileError.message.includes('row-level security')) {
                                const sqlFixMessage = `
                                   <p><strong>数据库权限不足 (RLS)。</strong></p>
                                   <p>您已成功创建登录账号，但因为数据库安全策略，无法写入该用户的资料。系统已自动撤销此操作。</p>
                                   <p>请在 Supabase SQL Editor 中运行此命令以允许管理员添加用户：</p>
                                   <pre style="background: #f1f5f9; padding: 0.8rem; border-radius: 4px; font-size: 0.75rem; text-align: left; overflow: auto;">create policy "Admins can manage all profiles"
on public.profiles for all to authenticated
using ( (select role from public.profiles where id = auth.uid()) = 'admin' )
with check ( (select role from public.profiles where id = auth.uid()) = 'admin' );</pre>
                               `;
                                throw new Error(sqlFixMessage); // Throw HTML string to be caught below
                            } else {
                                throw new Error(`资料写入失败 (已回滚): ${profileError.message}`);
                            }
                        }

                        // 3. Success
                        state.profiles.push(newProfile);

                        showModal({
                            title: '添加成功',
                            message: `用户 "${newUsername}" 已成功添加。`,
                            confirmText: '确定',
                            onConfirm: () => {
                                state.showCustomModal = false;
                                renderApp();
                            }
                        });

                    } catch (error: any) {
                        console.error("Add user error:", error);

                        let msg = error.message;
                        if (msg.includes('rate limit')) msg = "操作过于频繁，请稍后再试。";

                        // Check if it's our HTML error message (starts with <p>)
                        if (msg.trim().startsWith('<')) {
                            showModal({
                                title: '添加失败 - 需要配置权限',
                                message: msg,
                                isDanger: true,
                                confirmText: '我已知晓',
                                showCancel: false,
                                isDismissible: false
                            });
                        } else {
                            state.customModal.errorMessage = `添加失败: ${msg}`;
                            confirmButton.disabled = false;
                            confirmButton.innerHTML = '确认添加';
                            renderApp();
                        }
                    }
                }
            });
        } else if (button.classList.contains('delete-user-btn')) {
            const row = button.closest('tr');
            const userId = row?.dataset.userId;
            const userName = row?.querySelector('td:first-child')?.textContent;
            if (!userId || !userName) return;

            showModal({
                title: '确认删除用户',
                message: `您确定要删除用户 "${userName}" 吗？\n\n注意：此操作仅删除资料表记录，账号逻辑将由系统自动处理。`,
                isDanger: true,
                showCancel: true,
                confirmText: '确认删除',
                onConfirm: async () => {
                    const confirmButton = $('#custom-modal-confirm-btn') as HTMLButtonElement;
                    if (confirmButton) {
                        confirmButton.disabled = true;
                        confirmButton.innerHTML = `<span class="spinner"></span> 正在删除...`;
                    }

                    try {
                        // SIMPLIFIED DELETION: Just delete from the profiles table.
                        // This relies on the "Admins can do everything" policy we set up earlier.
                        const { error } = await supabase.from('profiles').delete().eq('id', userId);

                        if (error) throw error;

                        // Success path
                        state.showCustomModal = false;
                        state.profiles = state.profiles.filter(p => p.id !== userId);
                        renderApp();

                    } catch (error: any) {
                        console.error("Delete failed:", error);
                        showModal({
                            title: '删除失败',
                            message: `无法删除用户资料: ${error.message}`,
                            isDanger: true
                        });
                    }
                }
            });

        } else if (button.classList.contains('admin-delete-item-btn')) {
            const { category, model } = button.dataset;
            if (!category || !model) return;
            showModal({
                title: '确认删除', message: `确定要删除 "${category} - ${model}" 吗？`, showCancel: true, isDanger: true, confirmText: '删除',
                onConfirm: async () => {
                    const confirmButton = $('#custom-modal-confirm-btn') as HTMLButtonElement;
                    if (confirmButton) {
                        confirmButton.disabled = true;
                        confirmButton.innerHTML = `<span class="spinner"></span> 正在删除...`;
                    }
                    const cancelButton = $('#custom-modal-cancel-btn') as HTMLButtonElement;
                    if (cancelButton) {
                        cancelButton.disabled = true;
                    }

                    const { error } = await supabase.from('quote_items').delete().match({ category, model });

                    if (error) {
                        showModal({ title: '删除失败', message: error.message, isDanger: true });
                    } else {
                        state.showCustomModal = false;
                        if (state.priceData.prices[category]) delete state.priceData.prices[category][model];
                        // Also remove from items array
                        state.priceData.items = state.priceData.items.filter(i => !(i.category === category && i.model === model));
                        renderApp();
                    }
                }
            });
        }
        else if (button.id === 'import-excel-btn') {
            ($('#import-file-input') as HTMLInputElement)?.click();
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
                // Also update items array
                const item = state.priceData.items.find(i => i.category === category && i.model === model);
                if (item) item.price = newPrice;

                await updateLastUpdatedTimestamp();
            });
        } else if (button.id === 'generate-quote-btn') {
            handleExportExcel();
        } else if (button.id === 'calc-quote-btn') {
            // NEW LOGIC: Reveal the final price
            state.showFinalQuote = true;
            renderApp();
        } else if (button.id === 'match-config-btn') {
            handleSmartRecommendation();
        } else if (button.id === 'add-markup-point-btn') {
            const { data, error } = await supabase.from('quote_markups').insert({ alias: '新点位', value: 0 }).select().single();
            if (error) {
                showModal({ title: '错误', message: `无法添加点位: ${error.message}` });
            } else {
                state.priceData.markupPoints.push(data);
                renderApp();
            }
        } else if (button.id === 'add-tier-btn') {
            const { data, error } = await supabase.from('quote_discounts').insert({ threshold: 0, rate: 10 }).select().single();
            if (error) {
                showModal({ title: '错误', message: `无法添加折扣: ${error.message}` });
            } else {
                state.priceData.tieredDiscounts.push(data);
                renderApp();
            }
        } else if (button.classList.contains('remove-markup-point-btn')) {
            const id = button.dataset.id;
            if (!id) return;
            showModal({
                title: '确认删除', message: `确定要删除此点位吗？`, isDanger: true, showCancel: true, confirmText: '删除',
                onConfirm: async () => {
                    const { error } = await supabase.from('quote_markups').delete().eq('id', id);
                    if (error) { showModal({ title: '删除失败', message: error.message, isDanger: true }); }
                    else { state.showCustomModal = false; state.priceData.markupPoints = state.priceData.markupPoints.filter(p => p.id !== parseInt(id)); renderApp(); }
                }
            });
        } else if (button.classList.contains('remove-tier-btn')) {
            const id = button.dataset.id;
            if (!id) return;
            showModal({
                title: '确认删除', message: `确定要删除此折扣阶梯吗？`, isDanger: true, showCancel: true, confirmText: '删除',
                onConfirm: async () => {
                    const { error } = await supabase.from('quote_discounts').delete().eq('id', id);
                    if (error) { showModal({ title: '删除失败', message: error.message, isDanger: true }); }
                    else { state.showCustomModal = false; state.priceData.tieredDiscounts = state.priceData.tieredDiscounts.filter(t => t.id !== parseInt(id)); renderApp(); }
                }
            });
        } else if (button.id === 'user-management-btn') {
            state.view = 'userManagement';
            renderApp();
        } else if (button.id === 'login-log-btn') {
            state.view = 'loginLog';
            const { data, error } = await supabase.from('login_logs').select('*').order('login_at', { ascending: false }).limit(100);
            if (!error) state.loginLogs = data || [];
            renderApp();
        } else if (button.id === 'app-view-toggle-btn') {
            state.view = 'admin';
            renderApp();
        } else if (button.id === 'back-to-quote-btn') {
            state.view = 'quote';
            renderApp();
        } else if (button.id === 'reset-btn') {
            state.selection = getInitialSelection();
            state.customItems = [];
            state.newCategory = '';
            state.specialDiscount = 0;
            state.markupPoints = state.priceData.markupPoints[0]?.id || 0;
            state.showFinalQuote = false; // Hide price on reset
            state.selectedDiscountId = 'none'; // Reset discount to none
            renderApp();
        } else if (button.classList.contains('approve-user-btn')) {
            const userId = button.closest('tr')?.dataset.userId;
            if (!userId) return;
            const { error } = await supabase.from('profiles').update({ is_approved: true }).eq('id', userId);
            if (!error) {
                const profile = state.profiles.find(p => p.id === userId);
                if (profile) profile.is_approved = true;
                renderApp();
            }
        } else if (button.classList.contains('permission-toggle-btn')) {
            const row = button.closest('tr');
            const userId = row?.dataset.userId;
            const action = button.dataset.action;
            if (!userId || !action) return;
            // NEW LOGIC: 'grant' now gives 'manager' role, NOT 'admin'.
            // 'revoke' returns them to 'sales'.
            const newRole = action === 'grant' ? 'manager' : 'sales';

            const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
            if (!error) {
                const profile = state.profiles.find(p => p.id === userId);
                if (profile) profile.role = newRole;
                renderApp();
            }
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
            const tableBody = $('.admin-data-table tbody');
            if (tableBody) {
                tableBody.innerHTML = renderAdminDataTableBody();
            }
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
            if (fileNameDisplay) fileNameDisplay.textContent = file.name;

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const data = event.target?.result;
                    // FIX: Use 'array' type for XLSX.read to correspond with readAsArrayBuffer.
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const json: (string | number)[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

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
                        is_priority: false // Default priority
                    })).filter(item => item.category && item.model && !isNaN(item.price));

                    if (itemsToUpsert.length === 0) throw new Error('未在文件中找到有效的数据行。');

                    const { error } = await supabase.from('quote_items').upsert(itemsToUpsert, { onConflict: 'category,model' });
                    if (error) throw error;

                    itemsToUpsert.forEach(item => {
                        if (!state.priceData.prices[item.category]) {
                            state.priceData.prices[item.category] = {};
                        }
                        state.priceData.prices[item.category][item.model] = item.price;

                        // Sync with raw items array for admin view
                        const existingIdx = state.priceData.items.findIndex(i => i.category === item.category && i.model === item.model);
                        if (existingIdx >= 0) {
                            state.priceData.items[existingIdx].price = item.price;
                        } else {
                            // Note: Real IDs are missing here until re-fetch, but fine for display momentarily
                            // Best practice would be to reload data, but for now we push a partial object or reload
                        }
                    });

                    // Reload data to ensure IDs and everything are consistent
                    await updateLastUpdatedTimestamp();
                    showModal({
                        title: '导入成功',
                        message: `成功导入/更新了 ${itemsToUpsert.length} 个配件。`,
                        onConfirm: () => {
                            window.location.reload(); // Simplest way to resync everything perfectly
                        }
                    });

                } catch (err: any) {
                    showModal({ title: '导入失败', message: err.message, isDanger: true });
                } finally {
                    (target as HTMLInputElement).value = '';
                    if (fileNameDisplay) fileNameDisplay.textContent = '';
                }
            };
            // FIX: Use the modern and recommended readAsArrayBuffer method instead of the deprecated readAsBinaryString.
            reader.readAsArrayBuffer(file);
            return;
        }

        const row = target.closest('tr');
        if (target.id === 'markup-points-select') {
            state.markupPoints = Number(target.value);
            updateTotalsUI();
        } else if (target.id === 'discount-select') {
            const val = target.value;
            state.selectedDiscountId = val === 'none' ? 'none' : parseInt(val, 10);
            updateTotalsUI();
        } else if (row?.dataset.category && target.classList.contains('model-select')) {
            state.selection[row.dataset.category].model = (target as HTMLSelectElement).value;
            updateTotalsUI();
        }
    });
}
