import type { User as AuthUser } from '@supabase/supabase-js';

export interface PriceDataItem { [model: string]: number; }
export interface Prices { [category:string]: PriceDataItem; }

// Database-first types matching your new schema
export interface DbQuoteItem { id: number; category: string; model: string; price: number; }
export interface DbDiscount { id: number; threshold: number; rate: number; }
export interface DbMarkupPoint { id: number; alias: string; value: number; }
export interface DbProfile { id: string; full_name: string | null; role: 'admin' | 'sales'; is_approved: boolean; }
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
    prices: Prices;
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
}

export interface AppState {
    appStatus: 'loading' | 'ready' | 'error';
    errorMessage: string | null;
    priceData: PriceData;
    profiles: DbProfile[];
    view: 'login' | 'quote' | 'admin' | 'userManagement' | 'loginLog';
    currentUser: CurrentUser | null;
    selection: SelectionState;
    customItems: CustomItem[];
    newCategory: string;
    specialDiscount: number;
    markupPoints: number;
    adminSearchTerm: string;
    showCustomModal: boolean;
    customModal: CustomModalState;
    syncStatus: 'idle' | 'saving' | 'saved' | 'error';
    hasAttemptedDbFix: boolean;
    lastUpdated: string | null;
    loginLogs: DbLoginLog[];
}