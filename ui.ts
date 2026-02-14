


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
    
    const isLoginView = state.view === 'login' || !state.currentUser;
    
    // Toggle body class for centering login view
    if (isLoginView && state.appStatus !== 'loading') {
        document.body.classList.add('login-body');
        // Remove app-layout wrapper styles for login
        appContainer.className = '';
    } else {
        document.body.classList.remove('login-body');
        appContainer.className = 'app-layout';
    }

    if (state.appStatus === 'loading') {
        viewHtml = `
            <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center;">
                <div class="loading-spinner"></div>
                <h2 style="margin-top: 1.5rem; color: var(--text-500); font-weight: 500; font-size: 0.9rem;">系统初始化中...</h2>
            </div>`;
    } else if (state.appStatus === 'error') {
        viewHtml = `
            <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; padding: 2rem; text-align: center;">
                <span class="material-symbols-outlined" style="font-size: 3rem; color: var(--danger-text); margin-bottom: 1rem;">error</span>
                <h2 style="color: var(--text-900); margin-bottom: 0.5rem;">系统错误</h2>
                <div class="error-details" style="color: var(--text-500); max-width: 400px; margin-bottom: 1.5rem;">${state.errorMessage}</div>
                <button class="btn btn-primary" onclick="window.location.reload()">刷新页面</button>
            </div>`;
    } else if (isLoginView) {
        viewHtml = renderLoginView();
        attachListeners = attachLoginListeners;
    } else if (state.view === 'quote') {
        viewHtml = renderQuoteTool();
        attachListeners = attachQuoteToolListeners;
    } else if (state.view === 'admin' && state.currentUser && (state.currentUser.role === 'admin' || state.currentUser.role === 'manager')) {
        viewHtml = renderAdminPanel();
        attachListeners = attachAdminPanelListeners;
    } else if (state.view === 'userManagement' && state.currentUser && state.currentUser.role === 'admin') {
        viewHtml = renderUserManagementPanel();
        attachListeners = attachUserManagementListeners;
    } else if (state.view === 'loginLog' && state.currentUser && state.currentUser.role === 'admin') {
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
       <div class="auth-card">
           <div style="display: flex; flex-direction: column; align-items: center; margin-bottom: 2rem;">
               <div style="background: var(--primary-light); padding: 0.75rem; border-radius: 0.75rem; color: var(--primary); margin-bottom: 1rem;">
                    <svg width="32" height="32" viewBox="0 0 48 48" fill="currentColor"><path d="M4 42.4379C4 42.4379 14.0962 36.0744 24 41.1692C35.0664 46.8624 44 42.2078 44 42.2078L44 7.01134C44 7.01134 35.068 11.6577 24.0031 5.96913C14.0971 0.876274 4 7.27094 4 7.27094L4 42.4379Z"></path></svg>
               </div>
               <div style="display: flex; flex-direction: column; align-items: flex-end;">
                   <h1 style="font-size: 1.5rem; font-weight: 700; color: var(--text-900); letter-spacing: -0.025em; margin: 0;">快速报价系统 v5</h1>
                   <p style="color: var(--text-500); font-size: 0.875rem; margin-top: 0.25rem;">--龙盛科技</p>
               </div>
           </div>

           <div id="login-error" style="background: var(--danger-bg); color: var(--danger-text); padding: 0.75rem; border-radius: var(--radius-md); font-size: 0.875rem; margin-bottom: 1.5rem; display: none;"></div>
           
           <form id="login-form">
               <div style="margin-bottom: 1.25rem;">
                   <label for="username" style="display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.875rem; color: var(--text-700);">用户名</label>
                   <input type="text" id="username" name="username" class="form-input" required autocomplete="username" placeholder="用户名如：zhangsan" value="${state.loginFormUsername || ''}">
                   ${isRegister ? `<small style="color: var(--text-500); font-size: 0.75rem; margin-top: 4px; display: block;">* 仅支持英文字母、数字或下划线</small>` : ''}
               </div>
               
               ${isRegister ? `
               <div style="margin-bottom: 1.25rem;">
                   <label for="fullname" style="display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.875rem; color: var(--text-700);">真实姓名</label>
                   <input type="text" id="fullname" name="fullname" class="form-input" required autocomplete="name" placeholder="请输入姓名">
               </div>
               ` : ''}
               
               <div style="margin-bottom: 1.5rem;">
                   <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                        <label for="password" style="font-weight: 500; font-size: 0.875rem; color: var(--text-700);">密码</label>
                   </div>
                   <input type="password" id="password" name="password" class="form-input" required autocomplete="${isRegister ? 'new-password' : 'current-password'}" placeholder="••••••••">
               </div>
               
               <button type="submit" class="btn btn-primary" style="width: 100%; height: 3rem;">${isRegister ? '注册' : '登录'}</button>
               
               <div style="text-align: center; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border-color);">
                   <p style="font-size: 0.875rem; color: var(--text-500);">
                       ${isRegister ? '已有账号？ ' : "没有账号？ "}
                       <a href="#" id="auth-mode-toggle" style="color: var(--primary); text-decoration: none; font-weight: 600;">
                           ${isRegister ? '去登录' : '申请账号'}
                       </a>
                   </p>
               </div>
           </form>
           
            <div style="margin-top: 2rem; display: flex; justify-content: center; gap: 1.5rem;">
                <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; color: var(--text-400);">
                    <span class="status-pulse" style="width: 6px; height: 6px;"></span> 系统运行正常
                </div>
                 <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; color: var(--text-400);">
                    <span class="material-symbols-outlined" style="font-size: 14px;">lock</span> 安全加密传输
                </div>
            </div>
       </div>
   `;
}

function renderCustomModal() {
    const { title, message, confirmText, cancelText, showCancel, isDanger, errorMessage } = state.customModal;
    return `
       <div class="modal-overlay" id="custom-modal-overlay">
           <div class="modal-content">
                <div style="padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--border-color);">
                    <h2 style="margin: 0; font-size: 1.125rem; font-weight: 600; color: var(--text-900);">${title}</h2>
                </div>
                <div style="padding: 1.5rem; color: var(--text-700); font-size: 0.95rem; line-height: 1.6;">
                    <div>${message}</div>
                    ${errorMessage ? `<div style="background:var(--danger-bg); color:var(--danger-text); padding:0.75rem; border-radius:var(--radius-md); margin-top:1rem; font-size:0.875rem;">${errorMessage}</div>` : ''}
                </div>
                <div style="padding: 1rem 1.5rem; background: var(--bg-alt); display: flex; justify-content: flex-end; gap: 0.75rem; border-top: 1px solid var(--border-color);">
                   ${showCancel ? `<button class="btn btn-ghost" id="custom-modal-cancel-btn">${cancelText}</button>` : ''}
                   <button class="btn ${isDanger ? 'btn-primary' : 'btn-primary'}" style="${isDanger ? 'background: #ef4444; box-shadow:none;' : ''}" id="custom-modal-confirm-btn">${confirmText}</button>
                </div>
           </div>
       </div>
   `;
}

function renderQuoteTool() {
    const totals = calculateTotals();
    const finalConfigText = getFinalConfigText();
    const lastUpdatedDate = state.lastUpdated 
        ? new Date(state.lastUpdated).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '-') 
        : '--';
    
    const finalPriceVisibility = state.showFinalQuote ? 'visible' : 'hidden';
    const finalPriceOpacity = state.showFinalQuote ? '1' : '0';
    const isAdmin = state.currentUser?.role === 'admin';
    const isManager = state.currentUser?.role === 'manager';

    return `
       <header class="glass-header">
           <div class="header-brand">
               <div class="header-icon-box">
                    <span class="material-symbols-outlined">eco</span>
               </div>
               <div style="display: flex; flex-direction: column; align-items: flex-end;">
                    <div class="header-title">快速报价系统 v5</div>
                    <span class="header-subtitle">--龙盛科技</span>
               </div>
           </div>
           
           <nav class="header-nav">
               <div class="system-status-badge">
                   <span class="status-pulse"></span>
                   <span class="status-text">系统状态：优选模式</span>
               </div>
               <div style="height: 24px; width: 1px; background: var(--border-color);"></div>
                ${isAdmin ? '<button class="btn btn-ghost" id="login-log-btn" style="font-size:0.8rem; padding: 0.4rem 0.8rem;">日志</button>' : ''}
                ${isAdmin ? '<button class="btn btn-ghost" id="user-management-btn" style="font-size:0.8rem; padding: 0.4rem 0.8rem;">用户</button>' : ''}
                ${(isAdmin || isManager) ? '<button class="btn btn-ghost" id="app-view-toggle-btn" style="font-size:0.8rem; padding: 0.4rem 0.8rem;">后台</button>' : ''}
               
               <button class="btn btn-ghost" id="change-password-btn" style="font-size:0.8rem; padding: 0.4rem 0.8rem;">修改密码</button>
               
               <button class="btn btn-icon" id="logout-btn" title="退出">
                    <span class="material-symbols-outlined">logout</span>
               </button>
           </nav>
       </header>

       <main class="app-body">
           <!-- AI Matcher Card -->
           <div class="eco-card ai-feature">
               <div style="display: flex; flex-direction: column; gap: 1rem;">
                   <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                       <div class="badge badge-green" style="width: fit-content; gap: 4px;">
                            <span class="material-symbols-outlined" style="font-size: 14px;">auto_awesome</span> 
                            AI 智能配置优化
                       </div>
                       <h2 style="font-size: 1.5rem; font-weight: 800; color: var(--text-900); letter-spacing: -0.03em;">自动生成最适合您的硬件配置方案</h2>
                       <p style="color: var(--text-500); font-size: 0.95rem; max-width: 800px;">描述您的项目需求（例如：“6000元以内的4060游戏主机”）；或者直接粘贴配置清单，支持 <strong>| / \ 、</strong> 及 <strong>空格</strong> 分隔。例如：ThinkStationK-C3 * 1 | I5-13400 * 1 / 8G DDR5 5600 * 1</p>
                   </div>
                   
                   <div style="position: relative; margin-top: 1rem;">
                       <input type="text" id="matcher-input" style="width: 100%; height: 4rem; padding-left: 1.5rem; padding-right: 9rem; border-radius: 1rem; border: 1px solid var(--border-color); font-size: 1rem; box-shadow: 0 2px 5px rgba(0,0,0,0.02);" placeholder="">
                       <button id="match-config-btn" class="btn btn-primary" style="position: absolute; right: 0.5rem; top: 0.5rem; bottom: 0.5rem; padding: 0 1.5rem; border-radius: 0.75rem;">
                            一键生成 <span class="material-symbols-outlined" style="font-size: 1.1rem; margin-left: 4px;">bolt</span>
                       </button>
                   </div>
               </div>
           </div>

           <!-- Data Table Card -->
           <div class="eco-card">
               <div class="section-header" style="margin-bottom: 0; padding: 1.5rem; border-bottom: 1px solid var(--border-color);">
                   <div class="section-title">
                       <div class="section-icon green">
                           <span class="material-symbols-outlined">memory</span>
                       </div>
                       硬件配置清单
                   </div>
                   <span class="text-xs-bold text-muted">上次更新: ${lastUpdatedDate}</span>
               </div>
               
               <table class="data-table">
                   <colgroup> <col style="width: 20%;"> <col style="width: 45%;"> <col style="width: 15%;"> <col style="width: 20%;"> </colgroup>
                   <thead> <tr> <th style="text-align: center;">配件类型</th> <th>规格 / 型号</th> <th style="text-align: right;">数量</th> <th style="text-align: center;">操作</th> </tr> </thead>
                   <tbody>
                       ${CONFIG_ROWS.map(renderConfigRow).join('')}
                       ${state.customItems.map(renderCustomItemRow).join('')}
                       ${renderAddCategoryRow()}
                   </tbody>
               </table>
            </div>

            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 2rem; margin-bottom: 4rem;">
                <div class="eco-card" style="margin: 0; display: flex; flex-direction: column;">
                    <div style="padding: 1rem 1.5rem; background: var(--bg-alt); border-bottom: 1px solid var(--border-color);">
                        <label for="final-config-display" class="text-xs-bold text-muted">最终配置预览</label>
                    </div>
                    <textarea id="final-config-display" style="flex: 1; width: 100%; resize: none; border: none; padding: 1.5rem; font-family: monospace; font-size: 0.9rem; line-height: 1.6; outline: none; background: white;" readonly placeholder="配置清单将在此处生成...">${finalConfigText}</textarea>
                </div>

                <div class="eco-card" style="margin: 0; padding: 1.5rem;">
                    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                        <div>
                            <label for="discount-select" class="text-xs-bold text-muted" style="display: block; margin-bottom: 0.5rem;">折扣优惠</label>
                            <select id="discount-select" class="form-select">
                                <option value="none" ${state.selectedDiscountId === 'none' ? 'selected' : ''}>无折扣</option>
                                ${state.priceData.tieredDiscounts.sort((a, b) => b.threshold - a.threshold).map(tier => `
                                    <option value="${tier.id}" ${state.selectedDiscountId === tier.id ? 'selected' : ''}>
                                        ${tier.threshold > 0 ? `满 ${tier.threshold} 台 (${tier.rate}折)` : `固定折扣: ${tier.rate}折`}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div>
                            <label for="markup-points-select" class="text-xs-bold text-muted" style="display: block; margin-bottom: 0.5rem;">利润点位</label>
                            <select id="markup-points-select" class="form-select">
                                ${state.priceData.markupPoints.map(point => `<option value="${point.id}" ${state.markupPoints === point.id ? 'selected' : ''}>${point.alias}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label for="special-discount-input" class="text-xs-bold text-muted" style="display: block; margin-bottom: 0.5rem;">额外立减 (¥)</label>
                            <input type="number" id="special-discount-input" class="form-input" value="${state.specialDiscount > 0 ? state.specialDiscount : ''}" placeholder="0" />
                        </div>
                    </div>
                </div>
            </div>
       </main>

       <footer class="glass-footer">
           <div style="display: flex; align-items: center; gap: 2rem;">
               <div style="display: flex; flex-direction: column; gap: 0.25rem; visibility: ${finalPriceVisibility}; opacity: ${finalPriceOpacity}; transition: opacity 0.3s ease;">
                   <span class="text-xs-bold text-muted">预估总报价 ${state.globalQuantity > 1 ? `<span style="font-weight:normal; color:var(--text-400);">(共 ${state.globalQuantity} 台)</span>` : ''}</span>
                   <div style="display: flex; align-items: baseline; gap: 0.75rem;">
                       <strong style="font-size: 2.25rem; color: var(--text-900); line-height: 1;">¥ ${totals.finalPrice.toFixed(2)}</strong>
                       <span class="badge badge-green">
                            <span class="material-symbols-outlined" style="font-size: 12px; margin-right: 2px;">trending_down</span> 
                            已优化
                       </span>
                   </div>
               </div>
           </div>
           
           <div class="footer-buttons" style="display: flex; gap: 1rem; align-items: center;">
               
               <!-- Quantity Control -->
               <div style="display: flex; align-items: center; background: white; border: 1px solid var(--border-color); border-radius: 0.75rem; padding: 2px; margin-right: 1rem;">
                   <span class="text-xs-bold text-muted" style="padding-left: 0.75rem; padding-right: 0.5rem; font-size: 0.7rem;">数量</span>
                   <button class="btn btn-icon" id="qty-minus" style="width: 2rem; height: 2rem; border-radius: 0.5rem;"><span class="material-symbols-outlined" style="font-size: 1rem;">remove</span></button>
                   <input type="number" id="global-qty-input" value="${state.globalQuantity}" min="1" style="width: 3rem; text-align: center; border: none; font-weight: 600; color: var(--text-900); background: transparent; outline: none; -moz-appearance: textfield;">
                   <button class="btn btn-icon" id="qty-plus" style="width: 2rem; height: 2rem; border-radius: 0.5rem;"><span class="material-symbols-outlined" style="font-size: 1rem;">add</span></button>
               </div>

               <button class="btn btn-ghost" id="reset-btn">
                    <span class="material-symbols-outlined">restart_alt</span> 重置
               </button>
               <button class="btn btn-secondary" id="generate-quote-btn">
                    <span class="material-symbols-outlined">file_download</span> 导出 Excel
               </button>
               <button class="btn btn-primary" id="calc-quote-btn" style="padding: 0.75rem 2rem; font-size: 1rem;">
                    计算报价 <span class="material-symbols-outlined">payments</span>
               </button>
           </div>
       </footer>
   `;
}

function renderConfigRow(category: string) {
    const dataCategory = category.startsWith('硬盘') ? '硬盘' : category;
    const allItems = state.priceData.items.filter(i => i.category === dataCategory);
    const selectedHostModel = state.selection['主机']?.model;
    const filteredItems = allItems.filter(item => {
        if (dataCategory === '主机') return true;
        if (!selectedHostModel) return true;
        if (!item.compatible_hosts || item.compatible_hosts.length === 0) return true;
        return item.compatible_hosts.includes(selectedHostModel);
    });

    const availableModels = filteredItems.map(i => i.model).sort();
    const currentSelection = state.selection[category];
    return `
       <tr data-category="${category}">
           <td style="text-align: center;">
               <div style="display: flex; align-items: center; justify-content: center; gap: 0.75rem;">
                   <div style="width: 6px; height: 6px; border-radius: 50%; background: var(--border-color);"></div>
                   <strong>${category}</strong>
               </div>
           </td>
           <td>
               <select class="form-select model-select">
                   <option value="">-- 请选择 --</option>
                   ${availableModels.map(model => `<option value="${model}" ${currentSelection.model === model ? 'selected' : ''}>${model}</option>`).join('')}
               </select>
           </td>
           <td style="text-align: right;"> <input type="number" class="form-input quantity-input" min="0" value="${currentSelection.quantity}" style="text-align: right;" /> </td>
           <td style="text-align: center;"> 
               <button class="btn btn-icon remove-item-btn" disabled style="opacity: 0.3;">
                    <span class="material-symbols-outlined" style="font-size: 1.25rem;">close</span>
               </button> 
           </td>
       </tr>
   `;
}

function renderCustomItemRow(item: CustomItem) {
    const models = state.priceData.prices[item.category] || {};
    const modelKeys = Object.keys(models);
    const hasModels = modelKeys.length > 0;

    return `
       <tr data-custom-id="${item.id}" style="background: var(--bg-alt);">
           <td style="text-align: center;">
               <div style="display: flex; align-items: center; justify-content: center; gap: 0.75rem;">
                   <div style="width: 6px; height: 6px; border-radius: 50%; background: var(--primary);"></div>
                   <strong>${item.category}</strong>
                   <span class="badge badge-gray">自定义</span>
               </div>
           </td>
           <td>
               ${hasModels ? `
               <select class="form-select custom-model-select">
                   <option value="">-- 请选择 --</option>
                   ${modelKeys.sort().map(model => `<option value="${model}" ${item.model === model ? 'selected' : ''}>${model}</option>`).join('')}
               </select>
               ` : `
               <input type="text" class="form-input custom-model-input" placeholder="输入规格参数..." value="${item.model}" />
               `}
           </td>
           <td style="text-align: right;"> <input type="number" class="form-input custom-quantity-input" min="0" value="${item.quantity}" style="text-align: right;" /> </td>
           <td style="text-align: center;"> 
               <button class="btn btn-icon remove-custom-item-btn" style="color: var(--danger-text);" title="删除">
                    <span class="material-symbols-outlined" style="font-size: 1.25rem;">delete</span>
               </button> 
           </td>
       </tr>
   `;
}

function renderAddCategoryRow() {
    const standardCategories = ['主机', 'CPU', '内存', '硬盘', '显卡', '电源', '显示器'];
    const allCategories = Array.from(new Set(state.priceData.items.map(i => i.category)));
    const extraCategories = allCategories.filter(c => !standardCategories.includes(c));
    const hasExtras = extraCategories.length > 0;
    const showInput = !hasExtras || state.isNewCategoryCustom;

    let selectorHtml = '';
    if (hasExtras) {
        selectorHtml = `
            <select id="new-category-select" class="form-select" style="flex: 1; min-width: 140px; margin-right: 0.5rem; background: white;">
                <option value="">-- 选择分类 --</option>
                ${extraCategories.map(c => `<option value="${c}" ${(!state.isNewCategoryCustom && state.newCategory === c) ? 'selected' : ''}>${c}</option>`).join('')}
                <option value="custom" ${state.isNewCategoryCustom ? 'selected' : ''}>+ 自定义输入...</option>
            </select>
        `;
    }

    return `
       <tr id="add-category-row">
           <td colspan="4" style="padding: 1rem 1.5rem;">
               <div style="display: flex; align-items: center; gap: 1rem; background: var(--bg-alt); padding: 0.75rem; border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
                   <span class="text-xs-bold text-muted" style="white-space: nowrap;">添加新配件</span>
                   <div style="height: 24px; width: 1px; background: var(--border-color);"></div>
                   <div style="flex: 1; display: flex; gap: 0.5rem;">
                       ${selectorHtml}
                       ${showInput ? `<input type="text" id="new-category-input" class="form-input" placeholder="类别名称 (如: 机箱风扇)" value="${state.newCategory}" style="flex: 1; background: white;" />` : ''}
                   </div>
                   <button id="add-category-btn" class="btn btn-secondary" style="height: 2.25rem;">
                       <span class="material-symbols-outlined">add</span> 添加
                   </button>
               </div>
           </td>
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

    if (filteredItems.length === 0) return `<tr><td colspan="5" style="text-align:center; padding: 3rem; color: var(--text-500);">未找到匹配的商品。</td></tr>`;

    return filteredItems.map(item => `
        <tr data-id="${item.id}" data-category="${item.category}" data-model="${item.model}">
            <td><strong>${item.category}</strong></td> 
            <td style="color: var(--text-500);">${item.model}</td>
            <td><input type="number" class="form-input price-input" value="${item.price}" style="width: 100px;" /></td>
            <td style="text-align: center;">
                <input type="checkbox" class="priority-checkbox" ${item.is_priority ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--primary); cursor: pointer;">
            </td>
            <td class="actions-cell" style="text-align: right;">
                <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                    ${item.category === '主机' ? `<button class="btn btn-secondary admin-scenario-btn" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; background-color: #f3e8ff; border-color: #d8b4fe; color: #6b21a8;">场景</button>` : ''}
                    <button class="btn btn-secondary admin-adapter-btn" data-id="${item.id}" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">适配</button>
                    <button class="btn btn-secondary admin-save-item-btn" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">保存</button>
                    <button class="btn btn-icon admin-delete-item-btn" data-category="${item.category}" data-model="${item.model}" style="color: var(--danger-text);">
                        <span class="material-symbols-outlined" style="font-size: 1.2rem;">delete</span>
                    </button>
                </div>
            </td>
        </tr>`
    ).join('');
}

function renderAdminPanel() {
    return `
       <header class="glass-header">
           <div class="header-brand">
               <div class="header-icon-box" style="background: var(--text-900);">
                    <span class="material-symbols-outlined">admin_panel_settings</span>
               </div>
               <div>
                    <div class="header-title">后台管理</div>
                    <span class="header-subtitle">配置与库存管理</span>
               </div>
           </div>
           
           <nav class="header-nav">
               <button class="btn btn-secondary" id="back-to-quote-btn">
                    <span class="material-symbols-outlined">arrow_back</span> 返回报价
               </button>
           </nav>
       </header>

       <main class="app-body">
           <!-- Metrics Grid for Config -->
           <div class="admin-metrics-grid">
               <div class="eco-card" style="margin: 0; padding: 0;">
                   <div class="section-header" style="margin: 0; padding: 1.25rem; border-bottom: 1px solid var(--border-color);">
                        <div class="section-title" style="font-size: 1rem;">利润点位管理</div>
                   </div>
                   <div style="padding: 1.25rem;">
                       <div id="markup-points-list" style="display: flex; flex-direction: column; gap: 0.75rem;">
                           ${state.priceData.markupPoints.sort((a, b) => a.value - b.value).map(point => `
                               <div class="admin-row" data-id="${point.id}" style="display: flex; gap: 0.5rem; align-items: center;">
                                   <input type="text" class="form-input" value="${point.alias}" style="flex: 1; height: 2.25rem;">
                                   <div style="display: flex; align-items: center; gap: 0.25rem;">
                                       <input type="number" class="form-input" value="${point.value}" style="width: 60px; height: 2.25rem; text-align: right;">
                                       <span style="font-size: 0.8rem; color: var(--text-500);">%</span>
                                   </div>
                                   <button class="btn btn-icon remove-markup-point-btn" data-id="${point.id}" style="width: 24px; height: 24px;">
                                       <span class="material-symbols-outlined" style="font-size: 1.1rem;">close</span>
                                   </button>
                               </div>
                           `).join('')}
                       </div>
                       <button id="add-markup-point-btn" class="btn btn-ghost" style="width: 100%; margin-top: 1rem; border: 1px dashed var(--border-color); font-size: 0.8rem;">+ 添加点位</button>
                   </div>
               </div>

               <div class="eco-card" style="margin: 0; padding: 0;">
                   <div class="section-header" style="margin: 0; padding: 1.25rem; border-bottom: 1px solid var(--border-color);">
                        <div class="section-title" style="font-size: 1rem;">批量折扣管理</div>
                   </div>
                   <div style="padding: 1.25rem;">
                       <div id="tiered-discount-list" style="display: flex; flex-direction: column; gap: 0.75rem;">
                           ${state.priceData.tieredDiscounts.sort((a, b) => a.threshold - b.threshold).map(tier => `
                               <div class="admin-row" data-id="${tier.id}" style="display: flex; gap: 0.5rem; align-items: center; font-size: 0.9rem;">
                                   <span class="text-muted">满</span> 
                                   <input type="number" class="form-input" value="${tier.threshold}" style="width: 60px; height: 2.25rem;">
                                   <span class="text-muted">件</span> 
                                   <input type="number" step="0.1" class="form-input" value="${tier.rate}" style="width: 60px; height: 2.25rem;">
                                   <span class="text-muted">折</span>
                                   <button class="btn btn-icon remove-tier-btn" data-id="${tier.id}" style="width: 24px; height: 24px; margin-left: auto;">
                                       <span class="material-symbols-outlined" style="font-size: 1.1rem;">close</span>
                                   </button>
                               </div>
                           `).join('')}
                       </div>
                       <button id="add-tier-btn" class="btn btn-ghost" style="width: 100%; margin-top: 1rem; border: 1px dashed var(--border-color); font-size: 0.8rem;">+ 添加折扣阶梯</button>
                   </div>
               </div>
               
               <div class="eco-card" style="margin: 0; padding: 0; grid-column: 1 / -1;">
                    <div class="section-header" style="margin: 0; padding: 1.25rem; border-bottom: 1px solid var(--border-color);">
                        <div class="section-title" style="font-size: 1rem;">快速添加配件</div>
                   </div>
                   <div style="padding: 1.25rem;">
                        <form id="quick-add-form" style="display: flex; gap: 1rem; flex-wrap: wrap;">
                            <input type="text" id="quick-add-category-input" class="form-input" placeholder="分类 (如: 显卡)" style="flex: 1; min-width: 150px;" />
                            <input type="text" id="quick-add-model" class="form-input" placeholder="型号名称" style="flex: 2; min-width: 200px;" />
                            <input type="number" id="quick-add-price" class="form-input" placeholder="成本价" style="width: 120px;" />
                            <button type="submit" id="quick-add-btn" class="btn btn-primary">添加商品</button>
                       </form>
                        <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px dashed var(--border-color); display: flex; gap: 1rem;">
                           <input type="file" id="import-file-input" accept=".xlsx, .xls" style="display: none;" />
                           <button id="import-excel-btn" class="btn btn-secondary" style="flex: 1;">
                                <span class="material-symbols-outlined">upload_file</span> 导入 Excel
                           </button>
                           <button id="export-excel-btn" class="btn btn-secondary" style="flex: 1;">
                                <span class="material-symbols-outlined">download</span> 导出 Excel
                           </button>
                       </div>
                   </div>
               </div>
           </div>

           <!-- Inventory Table -->
           <div class="eco-card">
               <div class="section-header" style="padding: 1.5rem; margin: 0; border-bottom: 1px solid var(--border-color);">
                   <div class="section-title">
                       <div class="section-icon purple">
                           <span class="material-symbols-outlined">inventory_2</span>
                       </div>
                       配件管理
                   </div>
                   <div style="position: relative; width: 300px;">
                        <span class="material-symbols-outlined" style="position: absolute; left: 10px; top: 10px; color: var(--text-400);">search</span>
                        <input type="search" id="admin-search-input" class="form-input" placeholder="搜索配件..." value="${state.adminSearchTerm}" style="padding-left: 2.5rem;" />
                   </div>
               </div>
               
               <table class="data-table">
                    <thead> <tr> <th>分类</th> <th>型号</th> <th>单价</th> <th style="text-align: center;">优先</th> <th style="text-align: right;">操作</th> </tr> </thead>
                   <tbody id="admin-data-table-body">${renderAdminDataTableBody()}</tbody>
               </table>
           </div>
       </main>
   `;
}

function renderLoginLogPanel() {
    return `
       <header class="glass-header">
           <div class="header-brand">
               <div class="header-icon-box" style="background: var(--text-900);">
                    <span class="material-symbols-outlined">security</span>
               </div>
               <div class="header-title">安全日志</div>
           </div>
           <nav class="header-nav">
               <button class="btn btn-secondary" id="back-to-quote-btn">返回</button>
           </nav>
       </header>

       <main class="app-body">
            <div class="eco-card ai-feature">
                <div class="section-header" style="margin-bottom: 1rem; padding: 0;">
                    <div class="section-title">AI 智能分析</div>
                </div>
                <div id="log-summary-loading" style="display: block; color: var(--text-500);"> 
                    <div class="loading-spinner" style="width:20px; height:20px; display:inline-block; vertical-align:middle; border-width: 2px;"></div> 
                    正在分析数据模式...
                </div>
                <div id="log-summary-content" style="display: none; line-height: 1.7; color: var(--text-700);"></div>
            </div>

            <div class="eco-card">
                <div class="section-header" style="padding: 1.5rem; margin: 0; border-bottom: 1px solid var(--border-color);">
                    <div class="section-title">最近访问记录</div>
                </div>
                <table class="data-table">
                   <thead> <tr> <th>用户</th> <th>访问时间</th> </tr> </thead>
                   <tbody>
                       ${state.loginLogs.map(log => `
                           <tr>
                               <td><strong>${log.user_name || '未知'}</strong></td>
                               <td class="text-muted">${new Date(log.login_at).toLocaleString('zh-CN')}</td>
                           </tr>`).join('')}
                       ${state.loginLogs.length === 0 ? '<tr><td colspan="2" style="text-align: center; padding: 2rem; color: var(--text-500);">暂无日志记录。</td></tr>' : ''}
                   </tbody>
               </table>
           </div>
       </main>
   `;
}

function renderUserManagementPanel() {
    return `
       <header class="glass-header">
           <div class="header-brand">
               <div class="header-icon-box" style="background: var(--text-900);">
                    <span class="material-symbols-outlined">group</span>
               </div>
               <div class="header-title">用户管理</div>
           </div>
           <nav class="header-nav">
               <button id="add-new-user-btn" class="btn btn-primary">+ 新建用户</button>
               <button class="btn btn-secondary" id="back-to-quote-btn">返回</button>
           </nav>
       </header>

       <main class="app-body">
            <div class="eco-card">
               <table class="data-table">
                   <thead> <tr> <th>姓名</th> <th>角色</th> <th>状态</th> <th style="text-align: right;">操作</th> </tr> </thead>
                   <tbody>
                        ${state.profiles.map(profile => {
                            let roleBadgeHtml = '';
                            switch(profile.role) {
                                case 'admin': roleBadgeHtml = `<span class="badge" style="background:#dcfce7; color:#166534;">ADMIN</span>`; break;
                                case 'manager': roleBadgeHtml = `<span class="badge" style="background:#f3e8ff; color:#6b21a8;">MANAGER</span>`; break;
                                default: roleBadgeHtml = `<span class="badge badge-gray">SALES</span>`;
                            }

                            const statusBadgeHtml = profile.is_approved ? 
                                `<span class="badge badge-green">正常</span>` : 
                                `<span class="badge badge-orange">待审核</span>`;
                                
                            const isCurrentUser = profile.id === state.currentUser?.id;
                            let actionsHtml = '';

                            if (isCurrentUser) {
                                actionsHtml = '<span class="text-muted text-xs-bold">(您)</span>';
                            } else {
                                const approveButton = !profile.is_approved ? `<button class="btn btn-secondary approve-user-btn" style="height: 2rem; font-size: 0.75rem;">批准</button>` : '';
                                const permissionButton = profile.role === 'manager'
                                    ? `<button class="btn btn-ghost permission-toggle-btn" data-action="revoke" style="height: 2rem; font-size: 0.75rem;">降级</button>`
                                    : `<button class="btn btn-ghost permission-toggle-btn" data-action="grant" style="height: 2rem; font-size: 0.75rem;">提升</button>`;
                                const deleteButton = `<button class="btn btn-icon delete-user-btn" style="color: var(--danger-text); width: 2rem; height: 2rem;"><span class="material-symbols-outlined" style="font-size: 1.1rem;">delete</span></button>`;
                                const finalPermissionButton = profile.role !== 'admin' ? permissionButton : '';
                                actionsHtml = `<div style="display:flex; justify-content:flex-end; gap:0.5rem; align-items:center;">${approveButton}${finalPermissionButton}${deleteButton}</div>`;
                            }

                            return `
                            <tr data-user-id="${profile.id}" data-user-role="${profile.role}">
                                <td>
                                    <div style="font-weight:600;">${profile.full_name || '未命名'}</div>
                                </td>
                                <td>${roleBadgeHtml}</td>
                                <td>${statusBadgeHtml}</td>
                                <td class="actions-cell">${actionsHtml}</td>
                            </tr>`;
                        }).join('')}
                        ${state.profiles.length === 0 ? '<tr><td colspan="4" style="text-align: center; padding: 3rem; color: var(--text-500);">未找到用户。</td></tr>' : ''}
                   </tbody>
               </table>
           </div>
       </main>
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
    const finalPriceEl = $('.glass-footer strong'); // Updated selector
    const finalConfigEl = $('#final-config-display');

    if (finalPriceEl) {
        finalPriceEl.textContent = `¥ ${totals.finalPrice.toFixed(2)}`;
    }

    if (finalConfigEl) {
        (finalConfigEl as HTMLTextAreaElement).value = getFinalConfigText() || '未选择任何配件。';
    }
}

export function setSyncStatus(status: AppState['syncStatus'], duration = 1500) {
    state.syncStatus = status;
}
