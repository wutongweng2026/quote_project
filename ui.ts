
import { state } from './state';
import { calculateTotals, getFinalConfigText } from './calculations';
import type { CustomItem, CustomModalState, AppState } from './types';
import { CONFIG_ROWS } from './config';
import { attachLoginListeners, attachQuoteToolListeners, attachAdminPanelListeners, attachUserManagementListeners, attachLoginLogListeners, attachModalListeners } from './logic';

const appContainer = document.querySelector('#app')!;
const $ = (selector: string) => document.querySelector(selector);

// --- RENDER FUNCTIONS ---
export function renderApp() {
    let viewHtml = '';
    let attachListeners: (() => void) | null = null;

    if (state.appStatus === 'loading') {
        viewHtml = `<div class="app-status-container"><div class="loading-spinner"></div><h2 style="margin-top: 1.5rem; color: #64748b;">正在加载...</h2></div>`;
    } else if (state.appStatus === 'error') {
        viewHtml = `<div class="app-status-container"><h2>出现错误</h2><div class="error-details">${state.errorMessage}</div></div>`;
    } else if (state.view === 'login' || !state.currentUser) {
        viewHtml = renderLoginView();
        attachListeners = attachLoginListeners;
    } else if (state.view === 'quote') {
        viewHtml = renderQuoteTool();
        attachListeners = attachQuoteToolListeners;
    } else if (state.view === 'admin' && (state.currentUser.role === 'admin' || state.currentUser.role === 'manager')) {
        viewHtml = renderAdminPanel();
        attachListeners = attachAdminPanelListeners;
    } else if (state.view === 'userManagement' && state.currentUser.role === 'admin') {
        viewHtml = renderUserManagementPanel();
        attachListeners = attachUserManagementListeners;
    } else if (state.view === 'loginLog' && state.currentUser.role === 'admin') {
        viewHtml = renderLoginLogPanel();
        attachListeners = attachLoginLogListeners;
    } else {
        viewHtml = renderQuoteTool();
        attachListeners = attachQuoteToolListeners;
    }

    const modalHtml = state.showCustomModal ? renderCustomModal() : '';
    appContainer.innerHTML = viewHtml + modalHtml;
    
    // Attach listeners for the main view
    if (attachListeners) {
        attachListeners();
    }
    // Attach listeners for the modal if it's visible
    if (state.showCustomModal) {
        attachModalListeners();
    }
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
    const { title, message, confirmText, cancelText, showCancel, isDanger, inputType, errorMessage } = state.customModal;
    return `
       <div class="modal-overlay" id="custom-modal-overlay">
           <div class="modal-content">
               <h2>${title}</h2>
               <div>${message}</div>
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
                    ${isAdmin ? '<button class="header-btn" id="login-log-btn">登录日志</button>' : ''}
                    ${isAdmin ? '<button class="header-btn" id="user-management-btn">用户管理</button>' : ''}
                    ${(isAdmin || isManager) ? '<button class="header-btn" id="app-view-toggle-btn">后台管理</button>' : ''}
                   <button class="header-btn" id="logout-btn">退出</button>
               </div>
           </header>
           <main class="quoteBody">
               <div class="product-matcher-section">
                   <label for="matcher-input" style="font-size: 1.1rem; color: var(--primary-color-hover);">💡 智能配置推荐:</label>
                   <div class="matcher-input-group">
                       <input type="text" id="matcher-input" placeholder="在此输入需求，例如：“推荐一款8000元左右的电脑” “i5/8G/5060显卡”">
                       <button id="match-config-btn" class="btn btn-primary">智能生成<br>配置方案</button>
                   </div>
               </div>
               <table class="config-table">
                   <colgroup> <col style="width: 200px;"> <col> <col style="width: 80px;"> <col style="width: 60px;"> </colgroup>
                   <thead> <tr> <th>配置清单</th> <th>规格型号</th> <th>数量</th> <th>操作</th> </tr> </thead>
                   <tbody>
                       ${CONFIG_ROWS.map(renderConfigRow).join('')}
                       ${state.customItems.map(renderCustomItemRow).join('')}
                       ${renderAddCategoryRow()}
                   </tbody>
               </table>
                <div class="final-config-section">
                   <label for="final-config-display">最终配置:</label>
                   <textarea id="final-config-display" class="final-config-display" readonly>${finalConfigText || '未选择配件'}</textarea>
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
                   <button class="btn btn-danger" id="reset-btn">重置</button>
                   <button class="btn btn-secondary" id="generate-quote-btn">导出报价</button>
                   <button class="btn btn-primary" id="calc-quote-btn">生成报价</button>
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
           <td class="config-row-action"> <button id="add-category-btn">+</button> </td>
       </tr>
   `;
}

export function renderAdminDataTableBody() {
    const searchTerm = (state.adminSearchTerm || '').toLowerCase();
    
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
                <button class="btn btn-primary admin-save-item-btn">保存</button>
                <button class="btn btn-danger admin-delete-item-btn" data-category="${item.category}" data-model="${item.model}">删除</button>
            </td>
        </tr>`
    ).join('');
}

function renderAdminPanel() {
    return `
   <div class="adminContainer">
       <header class="adminHeader">
           <h2>系统管理后台</h2>
           <div class="header-actions">
               <button id="back-to-quote-btn" class="header-btn">返回报价首页</button>
           </div>
       </header>
       <div class="admin-content" style="padding: 2rem;">
           <div class="admin-section">
               <div class="admin-section-header">点位管理</div>
               <div class="admin-section-body">
                    <p>修改后将自动保存。</p>
                   <div id="markup-points-list">
                       ${state.priceData.markupPoints.sort((a, b) => a.value - b.value).map(point => `
                           <div class="markup-point-row" data-id="${point.id}">
                               <input type="text" class="markup-alias-input" value="${point.alias}" placeholder="别名">
                               <input type="number" class="markup-value-input" value="${point.value}" placeholder="点数">
                               <span>点</span>
                               <button class="btn btn-danger remove-markup-point-btn" data-id="${point.id}">删除</button>
                           </div>
                       `).join('')}
                   </div>
                    <div id="add-markup-point-btn" class="add-new-placeholder" style="margin-top: 1rem;">+ 添加新点位</div>
               </div>
           </div>
           <div class="admin-section">
               <div class="admin-section-header">折扣阶梯管理</div>
               <div class="admin-section-body">
                   <p>修改后将自动保存。</p>
                   <div id="tiered-discount-list">
                       ${state.priceData.tieredDiscounts.sort((a, b) => a.threshold - b.threshold).map(tier => `
                           <div class="tier-row" data-id="${tier.id}">
                               <span>满</span> <input type="number" class="tier-threshold-input" value="${tier.threshold}" placeholder="数量">
                               <span>件, 打</span> <input type="number" step="0.1" class="tier-rate-input" value="${tier.rate}" placeholder="折扣率">
                               <span>折</span> <button class="btn btn-danger remove-tier-btn" data-id="${tier.id}">删除</button>
                           </div>
                       `).join('')}
                   </div>
                    <div id="add-tier-btn" class="add-new-placeholder" style="margin-top: 1rem;">+ 添加新折扣阶梯</div>
               </div>
           </div>
           <div class="admin-section">
                <div class="admin-section-header">快速录入配件</div>
               <div class="admin-section-body">
                   <form id="quick-add-form" class="quick-add-form">
                        <input type="text" id="quick-add-category-input" placeholder="分类" />
                        <input type="text" id="quick-add-model" placeholder="型号名称" />
                        <input type="number" id="quick-add-price" placeholder="成本单价" />
                        <button type="submit" id="quick-add-btn" class="btn btn-secondary">确认添加/更新</button>
                   </form>
                   <div class="import-section">
                       <input type="file" id="import-file-input" accept=".xlsx, .xls" style="display: none;" />
                       <button id="import-excel-btn" class="btn btn-secondary">从Excel导入</button>
                       <span id="file-name-display"></span>
                   </div>
               </div>
           </div>
           <div class="admin-section">
               <div class="admin-section-header">现有数据维护</div>
               <div class="admin-section-body">
                   <input type="search" id="admin-search-input" placeholder="输入型号或分类名称搜索..." value="${state.adminSearchTerm}" />
                   <div id="admin-data-table-container" style="max-height: 400px; overflow-y: auto;">
                       <table class="admin-data-table">
                            <thead>
                                <tr>
                                    <th>分类</th>
                                    <th>型号</th>
                                    <th>单价</th>
                                    <th style="text-align: center;">优先推荐</th>
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
           <div class="header-actions">
               <button id="back-to-quote-btn" class="header-btn">返回报价首页</button>
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
   <div class="user-management-container">
       <header class="user-management-header">
           <h2>用户账户管理</h2>
           <div class="header-actions">
               <button id="add-new-user-btn" class="btn btn-secondary">添加新用户</button>
               <button id="back-to-quote-btn" class="btn btn-primary">返回报价首页</button>
           </div>
       </header>
       <div class="user-table-card">
           <table class="user-table">
               <thead>
                   <tr>
                       <th>用户名</th>
                       <th>角色</th>
                       <th>状态</th>
                       <th>操作</th>
                   </tr>
               </thead>
               <tbody>
                    ${state.profiles.map(profile => {
                        let roleBadgeHtml = '';
                        switch(profile.role) {
                            case 'admin':
                                roleBadgeHtml = `<span class="role-badge role-badge-admin">管理员</span>`;
                                break;
                            case 'manager':
                                roleBadgeHtml = `<span class="role-badge role-badge-manager">后台管理</span>`;
                                break;
                            default:
                                roleBadgeHtml = `<span>销售</span>`;
                        }

                        const statusBadgeHtml = profile.is_approved
                            ? `<span class="status-badge status-badge-approved">已批准</span>`
                            : `<span class="status-badge status-badge-pending">待审批</span>`;
                        
                        const isCurrentUser = profile.id === state.currentUser?.id;
                        let actionsHtml = '';
                        if (isCurrentUser) {
                            actionsHtml = '<span style="color: var(--secondary-text-color); font-style: italic;">(当前用户)</span>';
                        } else {
                            const approveButton = !profile.is_approved ? `<button class="btn btn-primary approve-user-btn">批准</button>` : '';
                            const permissionButton = profile.role === 'manager'
                                ? `<button class="btn btn-secondary permission-toggle-btn" data-action="revoke">撤销后台权限</button>`
                                : `<button class="btn btn-secondary permission-toggle-btn" data-action="grant">授予后台权限</button>`;
                            const deleteButton = `<button class="btn btn-danger delete-user-btn">删除</button>`;
                            
                            const finalPermissionButton = profile.role !== 'admin' ? permissionButton : '';

                            actionsHtml = [approveButton, finalPermissionButton, deleteButton].filter(Boolean).join('');
                        }

                        return `
                        <tr data-user-id="${profile.id}" data-user-role="${profile.role}">
                            <td>${profile.full_name || '未命名'}</td>
                            <td>${roleBadgeHtml}</td>
                            <td>${statusBadgeHtml}</td>
                            <td class="user-actions">${actionsHtml}</td>
                        </tr>`;
                    }).join('')}
                    ${state.profiles.length === 0 ? '<tr><td colspan="4" style="text-align: center;">没有用户。</td></tr>' : ''}
               </tbody>
           </table>
       </div>
   </div>
   `;
}

export function showModal(options: Partial<CustomModalState>) {
    const defaultOnConfirm = () => {
        state.showCustomModal = false;
        renderApp();
    };

    state.customModal = {
        title: '提示', message: '',
        onConfirm: defaultOnConfirm,
        confirmText: '确定',
        cancelText: '取消', showCancel: false, isDanger: false, errorMessage: '',
        isDismissible: true,
        ...options
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