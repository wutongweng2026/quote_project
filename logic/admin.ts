
import { state, supabase } from '../state';
import { renderApp, showModal, setSyncStatus, renderAdminDataTableBody } from '../ui';
import type { PostgrestError } from '@supabase/supabase-js';
import type { DbQuoteItem } from '../types';

declare var XLSX: any;
const $ = (selector: string) => document.querySelector(selector);

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
        showModal({ title: '操作失败', message: error.message, isDanger: true });
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
        if (!error) await updateLastUpdatedTimestamp();
        setSyncStatus(error ? 'error' : 'saved');
    }, 700);

    // FIX: Use delegation on app-body for inputs to ensure it works for both lists (querySelector only selects first match)
    $('.app-body')?.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.closest('#markup-points-list') || target.closest('#tiered-discount-list')) {
            debouncedUpdate(target);
        }
    });
    
    // Fixed selector from .admin-content to .app-body to capture events correctly
    $('.app-body')?.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        // Safety check for text nodes if click lands on text
        const safeTarget = (target.nodeType === 3 ? target.parentElement : target) as HTMLElement;
        if (!safeTarget) return;

        const button = safeTarget.closest('button');

        if (safeTarget.id === 'add-markup-point-btn' || safeTarget.closest('#add-markup-point-btn')) {
            // FIX: Generate unique alias to avoid DB unique constraint errors
            const nextIndex = state.priceData.markupPoints.length + 1;
            const { data, error } = await supabase.from('quote_markups').insert({ alias: `新点位 ${nextIndex}`, value: 0 }).select().single();
            if (error) return showModal({ title: '添加失败', message: error.message });
            state.priceData.markupPoints.push(data); renderApp();
        }
        if (safeTarget.id === 'add-tier-btn' || safeTarget.closest('#add-tier-btn')) {
            // FIX: Generate unique threshold to avoid DB unique constraint errors
            const maxThreshold = state.priceData.tieredDiscounts.length > 0 
                ? Math.max(...state.priceData.tieredDiscounts.map(d => d.threshold)) 
                : 0;
            const newThreshold = maxThreshold + 10;
            
            const { data, error } = await supabase.from('quote_discounts').insert({ threshold: newThreshold, rate: 10 }).select().single();
            if (error) return showModal({ title: '添加失败', message: error.message });
            state.priceData.tieredDiscounts.push(data); renderApp();
        }
        if (button?.classList.contains('remove-markup-point-btn') || button?.classList.contains('remove-tier-btn')) {
            const id = parseInt(button.dataset.id || ''); if (isNaN(id)) return;
            const isMarkup = button.classList.contains('remove-markup-point-btn');
            const table = isMarkup ? 'quote_markups' : 'quote_discounts';
            const { error } = await supabase.from(table).delete().eq('id', id);
            if (error) return showModal({ title: '删除失败', message: error.message });
            
            if (isMarkup) {
                state.priceData.markupPoints = state.priceData.markupPoints.filter(p => p.id !== id);
                // Reset selected markup if it was the one deleted
                if (state.markupPoints === id) {
                    state.markupPoints = state.priceData.markupPoints[0]?.id || 0;
                }
            } else {
                state.priceData.tieredDiscounts = state.priceData.tieredDiscounts.filter(t => t.id !== id);
                // Reset selected discount if it was the one deleted
                if (state.selectedDiscountId === id) {
                    state.selectedDiscountId = 'none';
                }
            }
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
        const tableBody = $('#admin-data-table-body'); if (tableBody) tableBody.innerHTML = renderAdminDataTableBody();
    });

    $('#import-excel-btn')?.addEventListener('click', () => ($('#import-file-input') as HTMLInputElement)?.click());
    $('#import-file-input')?.addEventListener('change', (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            // FIX: Changed UintArray to Uint8Array to correctly handle the ArrayBuffer from FileReader.
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
