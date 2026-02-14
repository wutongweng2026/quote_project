

import type { User as AuthUser } from '@supabase/supabase-js';

export interface PriceDataItem { [model: string]: number; }
export interface Prices { [category:string]: PriceDataItem; }

// Database-first types matching your new schema
export interface DbQuoteItem { 
    id: number; 
    category: string; 
    model: string; 
    price: number; 
    is_priority: boolean; // Added priority flag
    compatible_hosts?: string[] | null; // Added compatibility list
    application_scenarios?: string[] | null; // Added: AI matching scenarios
}
export interface DbDiscount { id: number; threshold: number; rate: number; }
export interface DbMarkupPoint { id: number; alias: string; value: number; }
export interface DbProfile { id: string; full_name: string | null; role: 'admin' | 'sales' | 'manager'; is_approved: boolean; }
export interface DbLoginLog {
    id: number;
    user_id: string | null;
    user_name: string | null;
    login_at: string;
}

// Combined user object
export interface CurrentUser extends DbProfile {
    auth: AuthUser;
}

export interface PriceData {
    prices: Prices; // Kept for backward compatibility and fast lookup
    items: DbQuoteItem[]; // Added for Admin UI and rich data (priority) access
    tieredDiscounts: DbDiscount[];
    markupPoints: DbMarkupPoint[];
}

export interface SelectionItem { model: string; quantity: number; }
export interface SelectionState { [category: string]: SelectionItem; }
export interface CustomItem { id: number; category: string; model: string; quantity: number; }

export interface CustomModalState {
    title: string;
    message: string;
    onConfirm: (() => void) | null;
    confirmText: string;
    cancelText: string;
    showCancel: boolean;
    isDanger: boolean;
    inputType?: 'text' | 'password';
    errorMessage?: string;
    isDismissible?: boolean;
}

export interface AppState {
    appStatus: 'loading' | 'ready' | 'error';
    errorMessage: string | null;
    priceData: PriceData;
    profiles: DbProfile[];
    view: 'login' | 'quote' | 'admin' | 'userManagement' | 'loginLog';
    authMode: 'login' | 'register'; // Added for login/register toggle
    currentUser: CurrentUser | null;
    selection: SelectionState;
    customItems: CustomItem[];
    newCategory: string;
    isNewCategoryCustom: boolean; // Added: toggle between select and custom input
    specialDiscount: number;
    markupPoints: number;
    adminSearchTerm: string;
    showCustomModal: boolean;
    customModal: CustomModalState;
    syncStatus: 'idle' | 'saving' | 'saved' | 'error';
    hasAttemptedDbFix: boolean;
    lastUpdated: string | null;
    loginLogs: DbLoginLog[];
    showFinalQuote: boolean;
    selectedDiscountId: number | 'none';
    isRestoringProfile: boolean; // 新增：防止注册恢复期间被强制登出
    globalQuantity: number; // 新增：全局设备数量
    loginFormUsername: string; // 新增：用于在登录失败重绘时保留用户名
}
