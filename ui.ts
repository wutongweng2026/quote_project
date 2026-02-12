

import { state } from './state';
import { calculateTotals, getFinalConfigText } from './calculations';
import type { CustomItem, CustomModalState, AppState } from './types';
import { CONFIG_ROWS } from './config';
import { attachLoginListeners } from './logic/login';
import { attachQuoteToolListeners } from './logic/quote';
import { attachAdminPanelListeners } from './logic/admin';
import { attachUserManagementListeners } from './logic/userManagement';
import { attachLoginLogListeners } from './logic/loginLog';
import { attachModalListeners } from './logic/modal';


const appContainer = document.querySelector('#app')!;
const $ = (selector: string) => document.querySelector(selector);

// --- RENDER FUNCTIONS ---
export function renderApp() {
    let viewHtml = '';
    let attachListeners: (() => void) | null = null;

    if (state.appStatus === 'loading') {
        viewHtml = `<div class="app-status-container"><div class="loading-spinner"></div><h2 style="margin-top: 1.5rem; color: var(--text-color-secondary);">系统初始化中...</h2></div>`;
    } else if (state.appStatus === 'error') {
        viewHtml = `<div class="app-status-container"><h2 style="color:var(--danger-color)">系统遇到问题</h2><div class="error-details">${state.errorMessage}</div><button class="btn btn-primary" onclick="window.location.reload()" style="margin-top:1rem">刷新重试</button></div>`;
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
    
    if (attachListeners) attachListeners();
    if (state.showCustomModal) attachModalListeners();
}

function renderLoginView() {
    const isRegister = state.authMode === 'register';
    return `
       <div class="auth-container">
           <div class="auth-box">
               <h1>产品报价系统 ${isRegister ? '注册' : '登录'}</h1>
               <div id="login-error" class="auth-error" style="display: none;"></div>
               <form id="login-form">
                   <div class="auth-input-group">
                       <label for="username">用户名</label>
                       <input type="text" id="username" name="username" class="form-input" required autocomplete="username" placeholder="请输入用户名 (如: zhangsan)">
                   </div>
                   ${isRegister ? `
                   <div class="auth-input-group">
                       <label for="fullname">真实姓名</label>
                       <input type="text" id="fullname" name="fullname" class="form-input" required autocomplete="name" placeholder="请输入您的姓名">
                   </div>
                   ` : ''}
                   <div class="auth-input-group">
                       <label for="password">密码</label>
                       <input type="password" id="password" name="password" class="form-input" required autocomplete="${isRegister ? 'new-password' : 'current-password'}" placeholder="请输入密码">
                   </div>
                   <button type="submit" class="btn btn-primary auth-button">${isRegister ? '注册并自动登录' : '立即登录'}</button>
                   <div style="text-align: center; margin-top: 1.5rem;">
                       <a href="#" id="auth-mode-toggle" style="color: var(--secondary-text-color); text-decoration: none; font-size: 0.95rem; font-weight: 500;">
                           ${isRegister ? '已有账号？返回登录' : '没有账号？创建新账号'}
                       </a>
                   </div>
               </form>
           </div>
       </div>
   `;
}

function renderCustomModal() {
    const { title, message, confirmText, cancelText, showCancel, isDanger, errorMessage } = state.customModal;
    return `
       <div class="modal-overlay" id="custom-modal-overlay">
           <div class="modal-content">
                <div class="modal-header"><h2>${title}</h2></div>
                <div class="modal-body">
                    <div>${message}</div>
                    ${errorMessage ? `<div class="modal-error">${errorMessage}</div>` : ''}
                </div>
                <div class="modal-footer">
                   ${showCancel ? `<button class="btn btn-ghost" id="custom-modal-cancel-btn">${cancelText}</button>` : ''}
                   <button class="btn ${isDanger ? 'btn-danger' : 'btn-primary'}" id="custom-modal-confirm-btn">${confirmText}</button>
                </div>
           </div>
       </div>
   `;
}

function renderQuoteTool() {
    const totals = calculateTotals();
    const finalConfigText = getFinalConfigText();
    // Use full date format YYYY-MM-DD HH:mm for clarity
    const lastUpdatedDate = state.lastUpdated 
        ? new Date(state.lastUpdated).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(/\//g, '-') 
        : '无';
    
    const finalPriceVisibility = state.showFinalQuote ? 'visible' : 'hidden';
    const finalPriceOpacity = state.showFinalQuote ? '1' : '0';
    const isAdmin = state.currentUser?.role === 'admin';
    const isManager = state.currentUser?.role === 'manager';

    return `
       <div class="app-layout">
           <header class="app-header">
               <h1>产品报价系统 v3 <span class="header-subtext">--龙盛科技</span></h1>
                <div class="header-actions">
                   <span class="update-timestamp" title="上次数据同步时间">数据更新于: ${lastUpdatedDate}</span>
                    ${isAdmin ? '<button class="header-btn" id="login-log-btn" title="查看登录日志">登录日志</button>' : ''}
                    ${isAdmin ? '<button class="header-btn" id="user-management-btn" title="管理用户权限">用户管理</button>' : ''}
                    ${(isAdmin || isManager) ? '<button class="header-btn" id="app-view-toggle-btn" title="管理价格与配置">后台管理</button>' : ''}
                   <button class="header-btn" id="logout-btn">退出</button>
               </div>
           </header>
           <main class="app-body">
               <div class="product-matcher-section">
                   <label for="matcher-input" style="font-size: 1rem; font-weight: 600; color: var(--text-color-primary); display:flex; align-items:center; gap:0.5rem;">
                        <span style="font-size:1.2rem">💡</span> 智能配置推荐
                   </label>
                   <div class="matcher-input-group">
                       <input type="text" id="matcher-input" class="form-input" placeholder="请输入您的预算（如 8000）或具体需求（如 4060显卡），系统将自动匹配最佳方案..." style="padding: 0.8rem 1rem;">
                       <button id="match-config-btn" class="btn btn-primary" style="padding: 0 1.5rem;">生成方案</button>
                   </div>
               </div>
               <div class="data-table-container">
                   <table class="data-table">
                       <colgroup> <col style="width: 20%;"> <col style="width: 45%;"> <col style="width: 15%;"> <col style="width: 20%;"> </colgroup>
                       <thead> <tr> <th>配置清单</th> <th>规格型号</th> <th>数量</th> <th>操作</th> </tr> </thead>
                       <tbody>
                           ${CONFIG_ROWS.map(renderConfigRow).join('')}
                           ${state.customItems.map(renderCustomItemRow).join('')}
                           ${renderAddCategoryRow()}
                       </tbody>
                   </table>
                </div>
                <div class="final-config-section" style="margin-top: 2rem;">
                   <label for="final-config-display" style="font-weight: 600;">最终配置预览</label>
                   <textarea id="final-config-display" class="form-input" style="margin-top: 0.5rem; background-color: var(--secondary-color);" readonly placeholder="选择配件后在此处生成配置清单...">${finalConfigText}</textarea>
               </div>
               <div class="controls-grid">
                   <div class="control-group">
                       <label for="discount-select">折扣优惠</label>
                       <select id="discount-select" class="form-select">
                           <option value="none" ${state.selectedDiscountId === 'none' ? 'selected' : ''}>无折扣</option>
                           ${state.priceData.tieredDiscounts.sort((a, b) => b.threshold - a.threshold).map(tier => `
                               <option value="${tier.id}" ${state.selectedDiscountId === tier.id ? 'selected' : ''}>
                                   ${tier.threshold > 0 ? `满 ${tier.threshold} 件 - ${tier.rate} 折` : `固定折扣 - ${tier.rate} 折`}
                               </option>
                           `).join('')}
                       </select>
                   </div>
                   <div class="control-group">
                       <label for="markup-points-select">利润点位</label>
                       <select id="markup-points-select" class="form-select">
                           ${state.priceData.markupPoints.map(point => `<option value="${point.id}" ${state.markupPoints === point.id ? 'selected' : ''}>${point.alias.split('(')[0].trim()}</option>`).join('')}
                       </select>
                   </div>
                   <div class="control-group">
                       <label for="special-discount-input">特别立减 (元)</label>
                       <input type="number" id="special-discount-input" class="form-input" value="${state.specialDiscount > 0 ? state.specialDiscount : ''}" placeholder="0" />
                   </div>
               </div>
           </main>
           <footer class="app-footer">
               <div class="final-price-display" style="visibility: ${finalPriceVisibility}; opacity: ${finalPriceOpacity}; transition: opacity 0.3s ease;">
                   <span>最终报价:</span>
                   <strong>¥ ${totals.finalPrice.toFixed(2)}</strong>
               </div>
               <div class="footer-buttons">
                   <button class="btn btn-ghost" id="reset-btn">重置</button>
                   <button class="btn btn-secondary" id="generate-quote-btn">📥 导出 Excel</button>
                   <button class="btn btn-primary" id="calc-quote-btn">💰 生成报价</button>
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
           <td>${category}</td>
           <td>
               <select class="form-select model-select">
                   <option value="">-- 请选择 --</option>
                   ${Object.keys(models).sort().map(model => `<option value="${model}" ${currentSelection.model === model ? 'selected' : ''}>${model}</option>`).join('')}
               </select>
           </td>
           <td> <input type="number" class="form-input quantity-input" min="0" value="${currentSelection.quantity}" /> </td>
           <td> <button class="btn btn-ghost remove-item-btn" disabled style="opacity: 0.3;">&times;</button> </td>
       </tr>
   `;
}

function renderCustomItemRow(item: CustomItem) {
    const models = state.priceData.prices[item.category] || {};
    return `
       <tr data-custom-id="${item.id}">
           <td>${item.category}</td>
           <td>
               <select class="form-select custom-model-select">
                   <option value="">-- 请选择 --</option>
                   ${Object.keys(models).sort().map(model => `<option value="${model}" ${item.model === model ? 'selected' : ''}>${model}</option>`).join('')}
               </select>
           </td>
           <td> <input type="number" class="form-input custom-quantity-input" min="0" value="${item.quantity}" /> </td>
           <td> <button class="btn btn-danger remove-custom-item-btn" title="删除此行">&times;</button> </td>
       </tr>
   `;
}

function renderAddCategoryRow() {
    return `
       <tr id="add-category-row" style="background-color: var(--secondary-color);">
           <td style="color: var(--text-color-secondary); font-weight: 500;">+ 添加新类别</td>
           <td> <input type="text" id="new-category-input" class="form-input" placeholder="输入类别名称 (例如: 机箱风扇)" value="${state.newCategory}" /> </td>
           <td></td>
           <td> <button id="add-category-btn" class="btn btn-primary" style="width: 100%;">确认添加</button> </td>
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

    if (filteredItems.length === 0) return `<tr><td colspan="5" style="text-align:center; padding: 3rem; color: var(--text-color-secondary);">未找到匹配项</td></tr>`;

    return filteredItems.map(item => `
        <tr data-id="${item.id}" data-category="${item.category}" data-model="${item.model}">
            <td>${item.category}</td> 
            <td>${item.model}</td>
            <td><input type="number" class="form-input price-input" value="${item.price}" /></td>
            <td style="text-align: center;">
                <input type="checkbox" class="priority-checkbox" ${item.is_priority ? 'checked' : ''} title="勾选后，智能推荐将优先选择此配件">
            </td>
            <td class="actions-cell">
                <button class="btn btn-primary admin-save-item-btn">保存</button>
                <button class="btn btn-danger admin-delete-item-btn" data-category="${item.category}" data-model="${item.model}">删除</button>
            </td>
        </tr>`
    ).join('');
}

function renderAdminPanel() {
    return `
   <div class="app-layout">
       <header class="app-header">
           <h2>系统管理后台</h2>
           <div class="header-actions">
               <button id="back-to-quote-btn" class="header-btn">返回报价首页</button>
           </div>
       </header>
       <main class="app-body">
           <div class="admin-section">
               <div class="admin-section-header">点位管理</div>
               <div class="admin-section-body">
                    <p>设置不同的利润点位，报价时可快速切换。</p>
                   <div id="markup-points-list">
                       ${state.priceData.markupPoints.sort((a, b) => a.value - b.value).map(point => `
                           <div class="admin-row" data-id="${point.id}">
                               <input type="text" class="form-input" value="${point.alias}" placeholder="别名" style="flex-grow: 1;">
                               <input type="number" class="form-input" value="${point.value}" placeholder="点数" style="width: 80px;">
                               <span>%</span>
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
                   <p>设置数量阶梯折扣，系统将根据数量自动匹配或手动选择。</p>
                   <div id="tiered-discount-list">
                       ${state.priceData.tieredDiscounts.sort((a, b) => a.threshold - b.threshold).map(tier => `
                           <div class="admin-row" data-id="${tier.id}">
                               <span>满</span> <input type="number" class="form-input" value="${tier.threshold}" placeholder="数量" style="width: 80px;">
                               <span>件, 打</span> <input type="number" step="0.1" class="form-input" value="${tier.rate}" placeholder="折扣率" style="width: 80px;">
                               <span>折</span> <button class="btn btn-danger remove-tier-btn" data-id="${tier.id}">删除</button>
                           </div>
                       `).join('')}
                   </div>
                    <div id="add-tier-btn" class="add-new-placeholder" style="margin-top: 1rem;">+ 添加新折扣阶梯</div>
               </div>
           </div>
           <div class="admin-section">
                <div class="admin-section-header">快速录入</div>
               <div class="admin-section-body">
                   <form id="quick-add-form" class="admin-row" style="align-items: stretch;">
                        <input type="text" id="quick-add-category-input" class="form-input" placeholder="分类 (如: 显卡)" style="flex: 1; min-width: 100px;" />
                        <input type="text" id="quick-add-model" class="form-input" placeholder="型号名称" style="flex: 2; min-width: 200px;" />
                        <input type="number" id="quick-add-price" class="form-input" placeholder="成本价" style="width: 100px;" />
                        <button type="submit" id="quick-add-btn" class="btn btn-primary">添加</button>
                   </form>
                   <div class="import-section" style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px dashed var(--border-color);">
                       <input type="file" id="import-file-input" accept=".xlsx, .xls" style="display: none;" />
                       <button id="import-excel-btn" class="btn btn-ghost" style="border: 1px dashed var(--border-color); width: 100%;">📄 从 Excel 批量导入配件库</button>
                       <span id="file-name-display" style="margin-left: 1rem; color: var(--text-color-secondary);"></span>
                   </div>
               </div>
           </div>
           <div class="admin-section">
               <div class="admin-section-header">现有库存维护</div>
               <div class="admin-section-body">
                   <input type="search" id="admin-search-input" class="form-input" placeholder="🔍 输入型号或分类名称搜索..." value="${state.adminSearchTerm}" style="margin-bottom: 1.5rem;" />
                   <div class="data-table-container">
                       <table class="data-table">
                            <thead> <tr> <th>分类</th> <th>型号</th> <th>单价</th> <th style="text-align: center;">优先推荐</th> <th>操作</th> </tr> </thead>
                           <tbody id="admin-data-table-body">${renderAdminDataTableBody()}</tbody>
                       </table>
                   </div>
               </div>
           </div>
       </main>
   </div>
   `;
}

function renderLoginLogPanel() {
    return `
   <div class="app-layout">
       <header class="app-header">
           <h2>登录日志审计</h2>
           <div class="header-actions"> <button id="back-to-quote-btn" class="header-btn">返回报价首页</button> </div>
       </header>
       <main class="app-body">
            <div class="admin-section">
                <div class="admin-section-header">🤖 AI 智能日志分析</div>
                <div class="admin-section-body">
                    <div id="log-summary-loading" style="display: block; color: var(--text-color-secondary);"> <span class="spinner" style="border-color: #94a3b8; border-top-color: transparent;"></span> 正在分析最近的登录行为...</div>
                    <div id="log-summary-content" style="display: none; line-height: 1.7;"></div>
                </div>
            </div>
            <div class="admin-section">
                <div class="admin-section-header">详细记录 (最近100条)</div>
                <div class="admin-section-body" style="padding: 0;">
                    <div class="data-table-container" style="border: none; box-shadow: none;">
                       <table class="data-table">
                           <thead> <tr> <th>用户名</th> <th>登录时间</th> </tr> </thead>
                           <tbody>
                               ${state.loginLogs.map(log => `
                                   <tr>
                                       <td>${log.user_name || '未知用户'}</td>
                                       <td>${new Date(log.login_at).toLocaleString('zh-CN')}</td>
                                   </tr>`).join('')}
                               ${state.loginLogs.length === 0 ? '<tr><td colspan="2" style="text-align: center; padding: 2rem; color: #94a3b8;">暂无日志记录。</td></tr>' : ''}
                           </tbody>
                       </table>
                    </div>
                </div>
           </div>
       </main>
   </div>
   `;
}

function renderUserManagementPanel() {
    return `
   <div class="app-layout">
        <header class="app-header">
            <h2>用户账户管理</h2>
            <div class="header-actions">
                <button id="add-new-user-btn" class="header-btn-blue">添加新用户</button>
                <button id="back-to-quote-btn" class="header-btn">返回报价首页</button>
            </div>
        </header>
       <main class="app-body">
            <div class="data-table-container">
               <table class="data-table">
                   <thead> <tr> <th>员工姓名</th> <th>角色</th> <th>状态</th> <th>操作</th> </tr> </thead>
                   <tbody>
                        ${state.profiles.map(profile => {
                            let roleBadgeHtml = '';
                            switch(profile.role) {
                                case 'admin': roleBadgeHtml = `<span class="role-badge role-badge-admin">管理员</span>`; break;
                                case 'manager': roleBadgeHtml = `<span class="role-badge role-badge-manager">后台经理</span>`; break;
                                default: roleBadgeHtml = `<span class="role-badge" style="background:var(--secondary-color); color:#475569">销售人员</span>`;
                            }

                            const statusBadgeHtml = profile.is_approved ? `<span class="status-badge status-badge-approved">正常</span>` : `<span class="status-badge status-badge-pending">待审批</span>`;
                            const isCurrentUser = profile.id === state.currentUser?.id;
                            let actionsHtml = '';

                            if (isCurrentUser) {
                                actionsHtml = '<span style="color: var(--text-color-secondary); font-size: 0.85rem; padding: 0.4rem;">(当前登录)</span>';
                            } else {
                                const approveButton = !profile.is_approved ? `<button class="btn btn-primary approve-user-btn" style="font-size:0.8rem; padding:0.3rem 0.6rem;">批准</button>` : '';
                                const permissionButton = profile.role === 'manager'
                                    ? `<button class="btn btn-secondary permission-toggle-btn" data-action="revoke" style="font-size:0.8rem; padding:0.3rem 0.6rem;">降为销售</button>`
                                    : `<button class="btn btn-secondary permission-toggle-btn" data-action="grant" style="font-size:0.8rem; padding:0.3rem 0.6rem;">升为经理</button>`;
                                const deleteButton = `<button class="btn btn-danger delete-user-btn" style="font-size:0.8rem; padding:0.3rem 0.6rem;">删除</button>`;
                                const finalPermissionButton = profile.role !== 'admin' ? permissionButton : '';
                                actionsHtml = [approveButton, finalPermissionButton, deleteButton].filter(Boolean).join(' ');
                            }

                            return `
                            <tr data-user-id="${profile.id}" data-user-role="${profile.role}">
                                <td>
                                    <div style="font-weight:600; color:#334155">${profile.full_name || '未命名'}</div>
                                </td>
                                <td>${roleBadgeHtml}</td>
                                <td>${statusBadgeHtml}</td>
                                <td class="actions-cell">${actionsHtml}</td>
                            </tr>`;
                        }).join('')}
                        ${state.profiles.length === 0 ? '<tr><td colspan="4" style="text-align: center; padding: 3rem; color: #94a3b8;">暂无用户数据。</td></tr>' : ''}
                   </tbody>
               </table>
           </div>
       </main>
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
