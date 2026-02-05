
import { state } from './state';
import { calculateTotals, getFinalConfigText } from './calculations';
import type { CustomItem, CustomModalState, AppState } from './types';
import { CONFIG_ROWS } from './config';

const appContainer = document.querySelector('#app')!;
const $ = (selector: string) => document.querySelector(selector);

// --- RENDER FUNCTIONS ---
export function renderApp() {
    let html = '';
    if (state.appStatus === 'loading') {
        html = `<div class="app-status-container"><div class="loading-spinner"></div><h2>正在加载...</h2></div>`;
    } else if (state.appStatus === 'error') {
        html = `<div class="app-status-container"><h2>出现错误</h2><div class="error-details">${state.errorMessage}</div></div>`;
    } else if (state.view === 'login') {
        html = renderLoginView();
    } else if (!state.currentUser) {
        html = renderLoginView(); // Fallback to login if no user
    } else if (state.view === 'quote') {
        html = renderQuoteTool();
    } else if (state.view === 'admin' && (state.currentUser.role === 'admin' || state.currentUser.role === 'manager')) {
        html = renderAdminPanel();
    } else if (state.view === 'userManagement' && state.currentUser.role === 'admin') {
        html = renderUserManagementPanel();
    } else if (state.view === 'loginLog' && state.currentUser.role === 'admin') {
        html = renderLoginLogPanel();
    } else {
        html = renderQuoteTool();
    }

    if (state.showCustomModal) {
        html += renderCustomModal();
    }
    appContainer.innerHTML = html;
}

function renderLoginView() {
    return `
       <div class="auth-container">
           <div class="auth-box">
               <h1>产品报价系统登录</h1>
               <div id="login-error" class="auth-error" style="display: none;"></div>
               <form id="login-form">
                   <div class="auth-input-group">
                       <label for="username">用户名</label>
                       <input type="text" id="username" name="username" required autocomplete="username">
                   </div>
                   <div class="auth-input-group">
                       <label for="password">密码</label>
                       <input type="password" id="password" name="password" required autocomplete="current-password">
                   </div>
                   <button type="submit" class="auth-button">登录</button>
               </form>
           </div>
       </div>
   `;
}

function renderCustomModal() {
    if (!state.showCustomModal) return '';
    const { title, message, confirmText, cancelText, showCancel, isDanger, inputType, errorMessage } = state.customModal;
    return `
       <div class="modal-overlay" id="custom-modal-overlay">
           <div class="modal-content">
               <h2>${title}</h2>
               <div style="text-align: left; margin-bottom: 1.5rem;">${message}</div>
               ${inputType ? `<input type="${inputType}" id="modal-input" class="modal-input" autofocus />` : ''}
               <div class="modal-error">${errorMessage || ''}</div>
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
    const lastUpdatedDate = state.lastUpdated ? new Date(state.lastUpdated).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' }) : '暂无记录';

    // Visibility logic for the final price
    const finalPriceVisibility = state.showFinalQuote ? 'visible' : 'hidden';
    const finalPriceOpacity = state.showFinalQuote ? '1' : '0';

    const isAdmin = state.currentUser?.role === 'admin';
    const isManager = state.currentUser?.role === 'manager';

    return `
       <div class="quoteContainer">
           <header class="quoteHeader">
               <h1>产品报价系统 <span>v2.1 - 龙盛科技</span></h1>
                <div class="header-actions">
                   <span class="update-timestamp">数据更新于: ${lastUpdatedDate}</span>
                    ${isAdmin ? '<button class="admin-button" id="login-log-btn">登录日志</button>' : ''}
                    ${isAdmin ? '<button class="admin-button" id="user-management-btn">用户管理</button>' : ''}
                    ${(isAdmin || isManager) ? '<button class="admin-button" id="app-view-toggle-btn">后台管理</button>' : ''}
                   <button class="admin-button" id="logout-btn">退出</button>
               </div>
           </header>
           <main class="quoteBody">
               <div class="product-matcher-section">
                   <label for="matcher-input" style="font-size: 1.1rem; color: var(--primary-color-hover);">💡 智能配置推荐:</label>
                   <div class="matcher-input-group">
                       <input type="text" id="matcher-input" placeholder="在此输入需求，例如：“推荐一款8000元左右的电脑” “i5/8G/5060显卡”" style="padding: 0.8rem; border-radius: 6px; border: 1px solid var(--border-color); font-family: inherit; width: 100%; font-size: 1rem;">
                       <button id="match-config-btn" style="height: auto; white-space: nowrap;">智能生成<br>配置方案</button>
                   </div>
               </div>
               <table class="config-table">
                   <colgroup> <col style="width: 200px;"> <col> <col style="width: 80px;"> <col style="width: 60px;"> </colgroup>
                   <thead> <tr> <th>配置清单</th> <th>规格型号</th> <th>数量</th> <th>操作</th> </tr> </thead>
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
                       <label for="discount-select">折扣:</label>
                       <select id="discount-select">
                           <option value="none" ${state.selectedDiscountId === 'none' ? 'selected' : ''}>无折扣</option>
                           ${state.priceData.tieredDiscounts.sort((a, b) => b.threshold - a.threshold).map(tier => `
                               <option value="${tier.id}" ${state.selectedDiscountId === tier.id ? 'selected' : ''}>
                                   ${tier.threshold > 0 ? `满 ${tier.threshold} 件 - ${tier.rate} 折` : `固定折扣 - ${tier.rate} 折`}
                               </option>
                           `).join('')}
                       </select>
                   </div>
                   <div class="control-group">
                       <label for="markup-points-select">点位:</label>
                       <select id="markup-points-select">
                           ${state.priceData.markupPoints.map(point => `<option value="${point.id}" ${state.markupPoints === point.id ? 'selected' : ''}>${point.alias.split('(')[0].trim()}</option>`).join('')}
                       </select>
                   </div>
                   <div class="control-group">
                       <label for="special-discount-input">特别立减:</label>
                       <input type="number" id="special-discount-input" value="${state.specialDiscount}" placeholder="0" />
                   </div>
               </div>
           </main>
           <footer class="quoteFooter">
               <div class="final-price-display" style="text-align: left; visibility: ${finalPriceVisibility}; opacity: ${finalPriceOpacity}; transition: opacity 0.3s ease;">
                   <span>最终价格</span>
                   <strong>¥ ${totals.finalPrice.toFixed(2)}</strong>
               </div>
               <div class="footer-buttons">
                   <button class="reset-btn" id="reset-btn">重置</button>
                   <button id="generate-quote-btn" style="background-color: var(--secondary-color);">导出报价</button>
                   <button id="calc-quote-btn" style="background-color: var(--primary-color);">生成报价</button>
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
           <td> <input type="number" class="quantity-input" min="0" value="${currentSelection.quantity}" /> </td>
           <td class="config-row-action"> <button class="remove-item-btn" disabled>-</button> </td>
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
           <td> <input type="number" class="custom-quantity-input" min="0" value="${item.quantity}" /> </td>
           <td class="config-row-action"> <button class="remove-custom-item-btn">-</button> </td>
       </tr>
   `;
}

function renderAddCategoryRow() {
    return `
       <tr id="add-category-row">
           <td class="config-row-label">添加新类别</td>
           <td> <input type="text" id="new-category-input" placeholder="在此输入类别名称 (例如: 配件)" value="${state.newCategory}" /> </td>
           <td></td>
           <td class="config-row-action"> <button id="add-category-btn" style="background-color: var(--primary-color);">+</button> </td>
       </tr>
   `;
}

export function renderAdminDataTableBody() {
    const searchTerm = (state.adminSearchTerm || '').toLowerCase();
    
    // Sort items by category then model for display
    const filteredItems = state.priceData.items.filter(item =>
        item.category.toLowerCase().includes(searchTerm) ||
        item.model.toLowerCase().includes(searchTerm)
    ).sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.model.localeCompare(b.model);
    });

    if (filteredItems.length === 0) {
        return `<tr><td colspan="5" style="text-align:center;">未找到匹配项</td></tr>`;
    }

    return filteredItems.map(item => `
        <tr data-id="${item.id}" data-category="${item.category}" data-model="${item.model}">
            <td>${item.category}</td> 
            <td>${item.model}</td>
            <td><input type="number" class="price-input" value="${item.price}" /></td>
            <td style="text-align: center;">
                <input type="checkbox" class="priority-checkbox" ${item.is_priority ? 'checked' : ''} title="勾选后，智能推荐将优先选择此配件">
            </td>
            <td>
                <button class="admin-save-item-btn">保存</button>
                <button class="admin-delete-item-btn" data-category="${item.category}" data-model="${item.model}">删除</button>
            </td>
        </tr>`
    ).join('');
}

function renderAdminPanel() {
    const syncStatusMessages = {
        idle: '',
        saving: '正在保存...',
        saved: '已同步 ✓',
        error: '保存出错!'
    };

    return `
   <div class="adminContainer">
       <header class="adminHeader">
           <h2>系统管理后台</h2>
           <div class="header-actions-admin">
               <div id="sync-status" class="${state.syncStatus}">${syncStatusMessages[state.syncStatus]}</div>
               <button id="back-to-quote-btn" class="admin-button">返回报价首页</button>
           </div>
       </header>
       <div class="admin-content">
           <div class="admin-section">
               <h3 class="admin-section-header">点位管理</h3>
               <div class="admin-section-body">
                    <p style="color: var(--secondary-text-color); font-size: 0.9rem; margin-top: 0;">修改后将自动保存。</p>
                   <div id="markup-points-list">
                       ${state.priceData.markupPoints.sort((a, b) => a.value - b.value).map(point => `
                           <div class="markup-point-row" data-id="${point.id}">
                               <input type="text" class="markup-alias-input" value="${point.alias}" placeholder="别名">
                               <input type="number" class="markup-value-input" value="${point.value}" placeholder="点数">
                               <span>点</span>
                               <button class="remove-markup-point-btn" data-id="${point.id}">删除</button>
                           </div>
                       `).join('')}
                   </div>
                    <div class="markup-point-row" style="margin-top: 1rem;"> <button id="add-markup-point-btn" class="add-new-btn">添加新点位</button> </div>
               </div>
           </div>
           <div class="admin-section">
               <h3 class="admin-section-header">折扣阶梯管理</h3>
               <div class="admin-section-body">
                   <p style="color: var(--secondary-text-color); font-size: 0.9rem; margin-top: 0;">修改后将自动保存。</p>
                   <div id="tiered-discount-list">
                       ${state.priceData.tieredDiscounts.sort((a, b) => a.threshold - b.threshold).map(tier => `
                           <div class="tier-row" data-id="${tier.id}">
                               <span>满</span> <input type="number" class="tier-threshold-input" value="${tier.threshold}" placeholder="数量">
                               <span>件, 打</span> <input type="number" step="0.1" class="tier-rate-input" value="${tier.rate}" placeholder="折扣率">
                               <span>折</span> <button class="remove-tier-btn" data-id="${tier.id}">删除</button>
                           </div>
                       `).join('')}
                   </div>
                    <div class="tier-row" style="margin-top: 1rem;"> <button id="add-tier-btn" class="add-new-btn">添加新折扣阶梯</button> </div>
               </div>
           </div>
           <div class="admin-section">
               <h3 class="admin-section-header">快速录入配件</h3>
               <div class="admin-section-body">
                   <form id="quick-add-form" class="quick-add-form">
                        <input type="text" id="quick-add-category-input" placeholder="分类" />
                        <input type="text" id="quick-add-model" placeholder="型号名称" />
                        <input type="number" id="quick-add-price" placeholder="成本单价" />
                        <button type="submit" id="quick-add-btn">确认添加/更新</button>
                   </form>
                   <div class="import-section">
                       <input type="file" id="import-file-input" accept=".xlsx, .xls" style="display: none;" />
                       <button id="import-excel-btn">从Excel导入</button>
                       <span id="file-name-display"></span>
                   </div>
               </div>
           </div>
           <div class="admin-section">
               <h3 class="admin-section-header">现有数据维护</h3>
               <div class="admin-section-body">
                   <input type="search" id="admin-search-input" placeholder="输入型号或分类名称搜索..." value="${state.adminSearchTerm}" />
                   <div id="admin-data-table-container" style="max-height: 400px; overflow-y: auto;">
                       <table class="admin-data-table">
                            <thead>
                                <tr>
                                    <th>分类</th>
                                    <th>型号</th>
                                    <th>单价</th>
                                    <th style="text-align: center; color: #ef4444;">优先推荐</th>
                                    <th>操作</th>
                                </tr>
                            </thead>
                           <tbody>
                               ${renderAdminDataTableBody()}
                           </tbody>
                       </table>
                   </div>
               </div>
           </div>
       </div>
   </div>
   `;
}

function renderLoginLogPanel() {
    return `
   <div class="adminContainer">
       <header class="adminHeader">
           <h2>登录日志 (最近100条)</h2>
           <div class="header-actions-admin">
               <button id="back-to-quote-btn" class="admin-button">返回报价首页</button>
           </div>
       </header>
       <div class="admin-content">
           <div class="admin-section">
                <div class="admin-section-body">
                   <table class="admin-data-table">
                       <thead>
                           <tr>
                               <th>用户名</th>
                               <th>登录时间</th>
                           </tr>
                       </thead>
                       <tbody>
                           ${state.loginLogs.map(log => `
                               <tr>
                                   <td>${log.user_name || '未知用户'}</td>
                                   <td>${new Date(log.login_at).toLocaleString('zh-CN')}</td>
                               </tr>`).join('')}
                           ${state.loginLogs.length === 0 ? '<tr><td colspan="2" style="text-align: center;">没有日志记录。</td></tr>' : ''}
                       </tbody>
                   </table>
               </div>
           </div>
       </div>
   </div>
   `;
}

function renderUserManagementPanel() {
    return `
   <div class="adminContainer">
       <header class="adminHeader">
           <h2>用户账户管理</h2>
           <div class="header-actions-admin">
               <button id="add-new-user-btn" class="admin-button" style="background-color: var(--secondary-color);">添加新用户</button>
               <button id="back-to-quote-btn" class="admin-button">返回报价首页</button>
           </div>
       </header>
       <div class="admin-content">
           <div class="admin-section">
                <div class="admin-section-body">
                   <table class="admin-data-table">
                       <thead>
                           <tr>
                               <th>用户名</th>
                               <th>角色</th>
                               <th>状态</th>
                               <th style="text-align: right;">操作</th>
                           </tr>
                       </thead>
                       <tbody>
                            ${state.profiles.map(profile => {
                                let roleBadge = '';
                                if (profile.role === 'admin') {
                                    roleBadge = `<span class="status-badge" style="background-color: #bfdbfe; color: #1e40af;">管理员</span>`;
                                } else if (profile.role === 'manager') {
                                    roleBadge = `<span class="status-badge" style="background-color: #e9d5ff; color: #6b21a8;">后台管理</span>`;
                                } else {
                                    roleBadge = `<span class="status-badge" style="background-color: #e0e7ff; color: #3730a3;">销售</span>`;
                                }

                                const isCurrentUser = profile.id === state.currentUser?.id;
                                const isTargetAdminOrManager = profile.role === 'admin' || profile.role === 'manager';

                                return `
                               <tr data-user-id="${profile.id}">
                                   <td>${profile.full_name || `无名氏 (${profile.id.substring(0, 6)})`}</td>
                                   <td>${roleBadge}</td>
                                   <td>
                                       <span class="status-badge ${profile.is_approved ? 'approved' : 'pending'}">
                                           ${profile.is_approved ? '已批准' : '待审批'}
                                       </span>
                                   </td>
                                   <td class="user-actions">
                                       ${!profile.is_approved ? `<button class="approve-user-btn">批准</button>` : ''}
                                       ${!isCurrentUser 
                                           ? `
                                                ${isTargetAdminOrManager
                                                   ? `<button class="permission-toggle-btn" data-action="revoke">撤销后台权限</button>`
                                                   : `<button class="permission-toggle-btn" data-action="grant">授予后台权限</button>`
                                               }
                                               <button class="delete-user-btn">删除</button>
                                           ` 
                                           : '<span style="color: var(--secondary-text-color); font-style: italic;">(当前用户)</span>'
                                       }
                                   </td>
                                </tr>`;
                            }).join('')}
                       </tbody>
                   </table>
               </div>
           </div>
       </div>
   </div>
   `;
}

// --- UI HELPERS ---
export function showModal(options: Partial<CustomModalState>) {
    // Establish a default action for the confirm button, which is to close the modal.
    const defaultOnConfirm = () => {
        state.showCustomModal = false;
        renderApp();
    };

    state.customModal = {
        title: '提示', message: '',
        onConfirm: defaultOnConfirm, // Start with the default
        confirmText: '确定',
        cancelText: '取消', showCancel: false, isDanger: false, errorMessage: '',
        isDismissible: true,
        ...options // If `options` contains an `onConfirm`, it will correctly override the default.
    };
    state.showCustomModal = true;
    renderApp();
}

export function updateTotalsUI() {
    const totals = calculateTotals();
    const finalPriceEl = $('.final-price-display strong');
    const finalConfigEl = $('.final-config-display');

    if (finalPriceEl) {
        finalPriceEl.textContent = `¥ ${totals.finalPrice.toFixed(2)}`;
    }

    if (finalConfigEl) {
        (finalConfigEl as HTMLTextAreaElement).value = getFinalConfigText() || '未选择配件';
    }
}

export function setSyncStatus(status: AppState['syncStatus'], duration = 1500) {
    state.syncStatus = status;
    const statusEl = $('#sync-status');
    if (statusEl) {
        const syncStatusMessages = { idle: '', saving: '正在保存...', saved: '已同步 ✓', error: '保存出错!' };
        statusEl.className = status;
        statusEl.textContent = syncStatusMessages[status];
    }
    if (status === 'saved' || status === 'error') {
        setTimeout(() => {
            if (state.syncStatus === status) setSyncStatus('idle');
        }, duration);
    }
}
