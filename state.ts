import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';
import type { AppState, SelectionState } from './types';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    const appEl = document.querySelector('#app')!;
    appEl.innerHTML = `
        <div class="app-status-container">
            <h2>配置错误</h2>
            <div class="error-details">
                <p>无法连接到数据库。请确保您的 <strong>config.ts</strong> 文件中已设置好以下环境变量：</p>
                <ul>
                    <li><code>SUPABASE_URL</code>: 您的 Supabase 项目 URL</li>
                    <li><code>SUPABASE_ANON_KEY</code>: 您的 Supabase 项目 anon key</li>
                </ul>
            </div>
        </div>
    `;
    throw new Error("Supabase credentials are not configured in the config.ts file.");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const getInitialSelection = (): SelectionState => ({
    '主机': { model: '', quantity: 1 }, '内存': { model: '', quantity: 1 },
    '硬盘1': { model: '', quantity: 1 }, '硬盘2': { model: '', quantity: 0 },
    '显卡': { model: '', quantity: 1 }, '电源': { model: '', quantity: 1 },
    '显示器': { model: '', quantity: 1 }
});

export const state: AppState = {
    appStatus: 'loading', // Start as 'loading' to match initial HTML
    errorMessage: null,
    priceData: { prices: {}, tieredDiscounts: [], markupPoints: [] },
    profiles: [],
    view: 'login',
    currentUser: null,
    selection: getInitialSelection(),
    customItems: [],
    newCategory: '',
    specialDiscount: 0,
    markupPoints: 0,
    adminSearchTerm: '',
    showCustomModal: false,
    customModal: {
        title: '', message: '', onConfirm: null, confirmText: '确定',
        cancelText: '取消', showCancel: false, isDanger: false,
    },
    syncStatus: 'idle',
    lastUpdated: null,
    hasAttemptedDbFix: false,
    loginLogs: [],
};