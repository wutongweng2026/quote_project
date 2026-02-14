

import { state, supabase } from '../state';
import { renderApp, showModal, setSyncStatus, renderAdminDataTableBody } from '../ui';
import type { PostgrestError } from '@supabase/supabase-js';
import type { DbQuoteItem, Prices } from '../types';

declare var XLSX: any;
const $ = (selector: string) => document.querySelector(selector);

async function updateLastUpdatedTimestamp() {
    const newTimestamp = new Date().toISOString();
    localStorage.removeItem('qqs_price_data_cache_v2'); // Invalidate new cache key
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

// 辅助函数：重新获取配件数据并刷新界面 (替代 location.reload)
async function refreshItemsData() {
    const { data: itemsData, error } = await supabase.from('quote_items').select('*');
    if (error) {
        console.error("Error refreshing data:", error);
        return;
    }
    
    // 更新本地状态，并进行数据标准化 (处理 JSON 字符串)
    state.priceData.items = (itemsData as any[] || []).map(item => {
        let hosts = item.compatible_hosts;
        if (typeof hosts === 'string') {
            try { hosts = JSON.parse(hosts); } catch {}
        }
        return {
            ...item,
            compatible_hosts: Array.isArray(hosts) ? hosts : null
        };
    });

    // 重建价格映射表
    state.priceData.prices = (state.priceData.items || []).reduce((acc, item) => {
        if (!acc[item.category]) acc[item.category] = {};
        acc[item.category][item.model] = item.price;
        return acc;
    }, {} as Prices);

    renderApp();
}

// 辅助函数：处理数据库 RLS 权限错误
function handleRlsError(error: PostgrestError, actionName: string) {
    if (error.message.includes('row-level security') || error.message.includes('policy')) {
        showModal({
            title: '权限不足',
            message: `
                <p>当前用户（角色: ${state.currentUser?.role}）没有权限执行“${actionName}”操作。</p>
                <div style="background:#f1f5f9; padding:10px; border-radius:6px; font-size:0.85rem; margin-top:10px;">
                    <strong>给管理员的提示 (RLS Policy):</strong><br>
                    数据库当前的行级安全策略（RLS）可能仅允许 Admin 写入。<br>
                    请在 Supabase SQL 编辑器中运行以下命令以允许 Manager 角色修改数据：
                    <pre style="margin-top:5px; color:#d97706; white-space:pre-wrap;">
-- 1. 允许 Admin/Manager 插入
CREATE POLICY "Enable insert for managers" ON "public"."quote_items"
FOR INSERT WITH CHECK (
  auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'manager'))
);

-- 2. 允许 Admin/Manager 更新
CREATE POLICY "Enable update for managers" ON "public"."quote_items"
FOR UPDATE USING (
  auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'manager'))
);

-- 3. 允许 Admin/Manager 删除
CREATE POLICY "Enable delete for managers" ON "public"."quote_items"
FOR DELETE USING (
  auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'manager'))
);
                    </pre>
                </div>
            `,
            isDanger: true,
            confirmText: '知道了'
        });
    } else {
        showModal({ title: `${actionName}失败`, message: error.message, isDanger: true });
    }
}

async function withButtonLoading(button: HTMLButtonElement, action: () => Promise<any>) {
    const originalText = button.innerHTML;
    button.disabled = true; button.innerHTML = `<span class="spinner"></span>`;
    try {
        await action();
        button.innerHTML = '已保存 ✓';
        const originalBg = button.style.backgroundColor;
        button.style.backgroundColor = 'var(--primary-color-hover)';
        setTimeout(() => {
            button.disabled = false; button.innerHTML = originalText; button.style.backgroundColor = originalBg;
        }, 2000);
    } catch (error: any) {
        button.innerHTML = '失败!';
        const originalBg = button.style.backgroundColor;
        button.style.backgroundColor = 'var(--danger-color-hover)';
        // Check for generic errors passed up, usually handled inside, but good fallback
        if (!document.querySelector('.modal-overlay')) {
             showModal({ title: '操作失败', message: error.message, isDanger: true });
        }
        setTimeout(() => {
            button.disabled = false; button.innerHTML = originalText; button.style.backgroundColor = originalBg;
        }, 3000);
    }
}

function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
    let timeout: number;
    return (...args: Parameters<F>): void => {
        clearTimeout(timeout);
        timeout = window.setTimeout(() => func(...args), waitFor);
    };
}

export function attachAdminPanelListeners() {
    $('#back-to-quote-btn')?.addEventListener('click', () => { state.view = 'quote'; renderApp(); });

    // --- Change Password Logic (Duplicated for Admin View) ---
    $('#admin-change-password-btn')?.addEventListener('click', () => {
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
                btn.disabled = true;
                btn.innerHTML = `<span class="spinner"></span> 处理中...`;

                const { error } = await supabase.auth.updateUser({ password: newPassword });
                
                if (error) {
                    state.customModal.errorMessage = `修改失败: ${error.message}`;
                    renderApp();
                } else {
                    state.showCustomModal = false;
                    showModal({ title: '修改成功', message: '您的密码已成功更新。', confirmText: '完成' });
                }
            }
        });
    });

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
            if (error) {
                handleRlsError(error, '添加配件');
                throw error; // Propagate to stop spinner
            }
            const existingIndex = state.priceData.items.findIndex(i => i.category === category && i.model === model);
            
            // Normalize data just in case
            const normalizedData = {
                ...data,
                compatible_hosts: typeof data.compatible_hosts === 'string' ? JSON.parse(data.compatible_hosts) : data.compatible_hosts
            };

            if (existingIndex > -1) state.priceData.items[existingIndex] = normalizedData;
            else state.priceData.items.push(normalizedData);
            
            await updateLastUpdatedTimestamp();
            form.reset();
            renderApp();
        });
    });

    const debouncedUpdate = debounce(async (target: HTMLInputElement) => {
        const row = target.closest('.admin-row');
        if (!row) return; const id = parseInt((row as HTMLElement).dataset.id || ''); if (isNaN(id)) return;
        setSyncStatus('saving'); let error: PostgrestError | null = null;
        
        if (target.closest('#tiered-discount-list')) {
            const threshold = parseFloat((row.querySelector('input:nth-of-type(1)') as HTMLInputElement)?.value || '0');
            const rate = parseFloat((row.querySelector('input:nth-of-type(2)') as HTMLInputElement)?.value || '10');
            ({ error } = await supabase.from('quote_discounts').update({ threshold, rate }).eq('id', id));
        } else if (target.closest('#markup-points-list')) {
            const alias = (row.querySelector('input:nth-of-type(1)') as HTMLInputElement)?.value || '';
            const value = parseFloat((row.querySelector('input:nth-of-type(2)') as HTMLInputElement)?.value || '0');
            ({ error } = await supabase.from('quote_markups').update({ alias, value }).eq('id', id));
        }
        
        if (error) {
            setSyncStatus('error');
            handleRlsError(error, '更新配置');
        } else {
            await updateLastUpdatedTimestamp();
            setSyncStatus('saved');
        }
    }, 700);

    // Use delegation on app-body for inputs to ensure it works for both lists
    $('.app-body')?.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.closest('#markup-points-list') || target.closest('#tiered-discount-list')) {
            debouncedUpdate(target);
        }
    });
    
    $('.app-body')?.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const safeTarget = (target.nodeType === 3 ? target.parentElement : target) as HTMLElement;
        if (!safeTarget) return;

        const button = safeTarget.closest('button');

        if (safeTarget.id === 'add-markup-point-btn' || safeTarget.closest('#add-markup-point-btn')) {
            // Enhanced unique alias generation to prevent conflicts
            const existingAliases = state.priceData.markupPoints.map(p => p.alias);
            let nextIndex = 1;
            while (existingAliases.includes(`新点位 ${nextIndex}`)) {
                nextIndex++;
            }
            const alias = `新点位 ${nextIndex}`;

            const { data, error } = await supabase.from('quote_markups').insert({ alias, value: 0 }).select().single();
            if (error) {
                return handleRlsError(error, '添加点位');
            }
            
            state.priceData.markupPoints.push(data);
            await updateLastUpdatedTimestamp(); // IMPORTANT: Update timestamp for cache invalidation
            renderApp();
        }
        
        if (safeTarget.id === 'add-tier-btn' || safeTarget.closest('#add-tier-btn')) {
            // Enhanced unique threshold generation
            const existingThresholds = state.priceData.tieredDiscounts.map(d => d.threshold);
            let newThreshold = 10;
            if (existingThresholds.length > 0) {
                 newThreshold = Math.max(...existingThresholds) + 10;
            }
            while (existingThresholds.includes(newThreshold)) {
                newThreshold += 10;
            }
            
            const { data, error } = await supabase.from('quote_discounts').insert({ threshold: newThreshold, rate: 10 }).select().single();
            if (error) {
                 return handleRlsError(error, '添加折扣阶梯');
            }
            
            state.priceData.tieredDiscounts.push(data);
            await updateLastUpdatedTimestamp(); // IMPORTANT: Update timestamp for cache invalidation
            renderApp();
        }

        if (button?.classList.contains('remove-markup-point-btn') || button?.classList.contains('remove-tier-btn')) {
            const id = parseInt(button.dataset.id || ''); if (isNaN(id)) return;
            const isMarkup = button.classList.contains('remove-markup-point-btn');
            const actualTable = isMarkup ? 'quote_markups' : 'quote_discounts';

            const { error } = await supabase.from(actualTable).delete().eq('id', id);
            if (error) return handleRlsError(error, '删除配置');
            
            if (isMarkup) {
                state.priceData.markupPoints = state.priceData.markupPoints.filter(p => p.id !== id);
                if (state.markupPoints === id) {
                    state.markupPoints = state.priceData.markupPoints[0]?.id || 0;
                }
            } else {
                state.priceData.tieredDiscounts = state.priceData.tieredDiscounts.filter(t => t.id !== id);
                if (state.selectedDiscountId === id) {
                    state.selectedDiscountId = 'none';
                }
            }
            
            await updateLastUpdatedTimestamp(); // IMPORTANT: Update timestamp to ensure delete persists on reload
            renderApp();
        }
    });

    $('#admin-data-table-body')?.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement; const button = target.closest('button');
        if (target.matches('.priority-checkbox')) {
            const checkbox = target as HTMLInputElement; const row = checkbox.closest('tr'); const id = parseInt(row?.dataset.id || ''); if (!id) return;
            setSyncStatus('saving');
            const { error } = await supabase.from('quote_items').update({ is_priority: checkbox.checked }).eq('id', id);
            if (error) {
                setSyncStatus('error'); checkbox.checked = !checkbox.checked;
                handleRlsError(error, '更新优先级');
            } else { setSyncStatus('saved'); await updateLastUpdatedTimestamp(); }
        }
        if (button?.classList.contains('admin-save-item-btn')) {
            const row = button.closest('tr'); if (!row) return; const { id } = row.dataset; const newPrice = parseFloat((row.querySelector('.price-input') as HTMLInputElement).value);
            if (!id || isNaN(newPrice)) return;
            await withButtonLoading(button, async () => {
                const { error } = await supabase.from('quote_items').update({ price: newPrice }).eq('id', id); 
                if (error) {
                    handleRlsError(error, '保存价格');
                    throw error;
                }
                const item = state.priceData.items.find(i => i.id === parseInt(id)); if (item) item.price = newPrice;
                await updateLastUpdatedTimestamp();
            });
        }

        // --- Adapter Logic ---
        if (button?.classList.contains('admin-adapter-btn')) {
            const row = button.closest('tr');
            if (!row) return;
            const itemId = parseInt(row.dataset.id || '');
            const category = row.dataset.category;
            const model = row.dataset.model;
            
            if (!itemId) return;

            const targetItem = state.priceData.items.find(i => i.id === itemId);
            if (!targetItem) return;

            const hostItems = state.priceData.items.filter(i => i.category === '主机').map(i => i.model).sort();

            if (hostItems.length === 0) {
                return showModal({ title: '无主机数据', message: '系统中尚未录入任何“主机”分类的配件，无法进行适配。' });
            }

            const checkedHosts = new Set(targetItem.compatible_hosts || []);

            const messageHtml = `
                <div style="max-height: 300px; overflow-y: auto; text-align: left;">
                    <p style="margin-bottom: 1rem; color: #666; font-size: 0.9rem;">
                        请勾选 <strong>${category} - ${model}</strong> 支持的主机型号。<br>
                        如果不勾选任何主机，则视为<strong>通用配件</strong>（所有主机均可见）。
                    </p>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                        ${hostItems.map(host => `
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input type="checkbox" class="adapter-host-checkbox" value="${host}" ${checkedHosts.has(host) ? 'checked' : ''}>
                                <span style="font-size: 0.9rem;">${host}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
            `;

            showModal({
                title: '选择适配主机',
                message: messageHtml,
                showCancel: true,
                confirmText: '保存适配',
                onConfirm: async () => {
                    const checkboxes = document.querySelectorAll('.adapter-host-checkbox') as NodeListOf<HTMLInputElement>;
                    const selectedHosts = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
                    
                    targetItem.compatible_hosts = selectedHosts.length > 0 ? selectedHosts : null;
                    
                    const { error } = await supabase.from('quote_items')
                        .update({ compatible_hosts: selectedHosts.length > 0 ? selectedHosts : null })
                        .eq('id', itemId);
                        
                    if (error) {
                        handleRlsError(error, '保存适配');
                    } else {
                        state.showCustomModal = false;
                        await updateLastUpdatedTimestamp();
                        renderApp();
                    }
                }
            });
        }

        if (button?.classList.contains('admin-delete-item-btn')) {
            const { category, model } = button.dataset; if (!category || !model) return;
            showModal({
                title: '确认删除', message: `确定要删除 "${category} - ${model}" 吗？`, showCancel: true, isDanger: true, confirmText: '删除',
                onConfirm: async () => {
                    const { error } = await supabase.from('quote_items').delete().match({ category, model });
                    if (error) return handleRlsError(error, '删除配件');
                    state.showCustomModal = false; state.priceData.items = state.priceData.items.filter(i => !(i.category === category && i.model === model));
                    await updateLastUpdatedTimestamp(); renderApp();
                }
            });
        }
    });

    $('#admin-search-input')?.addEventListener('input', (e) => {
        state.adminSearchTerm = (e.target as HTMLInputElement).value;
        const tableBody = $('#admin-data-table-body'); if (tableBody) tableBody.innerHTML = renderAdminDataTableBody();
    });

    // --- Export Logic ---
    $('#export-excel-btn')?.addEventListener('click', () => {
        try {
            // Updated Export: Include compatible_hosts
            const dataToExport = state.priceData.items.map(item => ({
                "category": item.category,
                "model": item.model,
                "price": item.price,
                // Fix: Check if it's an array before joining
                "compatible_hosts": Array.isArray(item.compatible_hosts) ? item.compatible_hosts.join(',') : ''
            }));

            dataToExport.sort((a, b) => {
                if (a.category !== b.category) return a.category.localeCompare(b.category);
                return a.model.localeCompare(b.model);
            });

            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
            // Updated column widths for 4 columns
            worksheet['!cols'] = [{ wch: 15 }, { wch: 40 }, { wch: 10 }, { wch: 40 }];
            
            // Rename headers locally in the worksheet for better readability if desired, 
            // but keeping keys simple helps import. Let's assume keys are fine as headers.
            // If we wanted chinese headers, we'd rename keys in map above.
            
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "配件明细");
            const dateStr = new Date().toISOString().slice(0, 10);
            XLSX.writeFile(workbook, `龙盛配件表_${dateStr}.xlsx`);
        } catch (e: any) {
            console.error(e);
            showModal({ title: '导出失败', message: e.message, isDanger: true });
        }
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
            
            // Updated Import: Look for 4th column 'compatible_hosts'
            // Header: A=category, B=model, C=price, D=compatible_hosts
            const json = XLSX.utils.sheet_to_json(worksheet, { header: ["category", "model", "price", "compatible_hosts"] });
            
            // Remove header row (index 0)
            // Process and Parse compatible_hosts string back to array
            const itemsToUpsert = (json as any[]).slice(1)
                .filter(i => i.category && i.model && !isNaN(Number(i.price)))
                .map(i => {
                    let hosts: string[] | null = null;
                    if (i.compatible_hosts) {
                        // Support both English and Chinese commas
                        hosts = i.compatible_hosts.toString().split(/[,，]/)
                            .map((s: string) => s.trim())
                            .filter((s: string) => s.length > 0);
                    }
                    
                    return {
                        category: i.category,
                        model: i.model,
                        price: i.price,
                        compatible_hosts: (hosts && hosts.length > 0) ? hosts : null
                    };
                });
            
            if (itemsToUpsert.length === 0) {
                return showModal({ title: "导入失败", message: "Excel文件格式不正确或没有有效数据。请确保A,B,C,D列分别为'分类', '型号', '单价', '适配主机(可选)'。" });
            }
            
            showModal({
                title: `确认导入 ${itemsToUpsert.length} 条数据`, 
                message: "这将更新或添加Excel中的所有配件。此操作不可逆。", 
                showCancel: true, 
                confirmText: "确认",
                onConfirm: async () => {
                    // Update DB
                    const { error } = await supabase.from('quote_items').upsert(itemsToUpsert, { onConflict: 'category,model' });
                    state.showCustomModal = false;
                    
                    if (error) return handleRlsError(error, '批量导入');
                    
                    await updateLastUpdatedTimestamp();
                    await refreshItemsData();
                    
                    showModal({ title: "导入成功", message: `成功导入 ${itemsToUpsert.length} 条数据。`, confirmText: '完成' });
                }
            });
        };
        reader.readAsArrayBuffer(file);
        // Clear input so same file can be selected again
        (e.target as HTMLInputElement).value = ''; 
    });
}
