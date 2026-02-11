
import { supabase, state } from '../state';
import { renderApp, showModal } from '../ui';
import { seedDataObject } from '../seedData';
import type { DbProfile, Prices, DbQuoteItem } from '../types';
import type { Session } from '@supabase/supabase-js';

const CACHE_KEY = 'qqs_price_data_cache_v1';

export async function seedDatabaseIfNeeded() {
    try {
        const { count, error: countError } = await supabase
            .from('quote_items')
            .select('*', { count: 'exact', head: true });

        if (countError) {
            console.error("Error checking for existing data:", countError);
            return;
        }

        if (count !== null && count > 0) {
            return; // Data exists, no need to seed
        }

        console.log("Database appears to be empty. Seeding initial data...");

        const itemsToInsert = Object.entries(seedDataObject.prices)
            .flatMap(([category, models]) =>
                Object.entries(models).map(([model, price]) => ({
                    category,
                    model,
                    price,
                    is_priority: false
                }))
            );

        const { error: itemsError } = await supabase.from('quote_items').insert(itemsToInsert);
        if (itemsError) console.error("Error seeding quote_items:", itemsError);

        const discountsToInsert = seedDataObject.tieredDiscounts;
        const { error: discountsError } = await supabase.from('quote_discounts').insert(discountsToInsert);
        if (discountsError) console.error("Error seeding quote_discounts:", discountsError);
    } catch (error) {
        console.error("An unexpected error occurred during the seeding process:", error);
    }
}


export async function loadAllData(): Promise<boolean> {
    try {
        const { data: metaData } = await supabase
            .from('quote_meta')
            .select('value')
            .eq('key', 'last_prices_updated')
            .maybeSingle();

        const remoteTimestamp = metaData?.value as string | null;
        const cachedStr = localStorage.getItem(CACHE_KEY);
        if (cachedStr && remoteTimestamp) {
            const cache = JSON.parse(cachedStr);
            if (cache.timestamp === remoteTimestamp) {
                console.log('⚡ Using local price data cache...');
                Object.assign(state.priceData, {
                    items: cache.items,
                    prices: cache.prices,
                    tieredDiscounts: cache.tieredDiscounts,
                    markupPoints: cache.markupPoints
                });
                state.lastUpdated = cache.timestamp;
                return true;
            }
        }

        console.log('🌐 Fetching fresh data from database...');
        const [{ data: itemsData, error: itemsError }, { data: discountsData, error: discountsError }, { data: markupsData, error: markupsError }] = await Promise.all([
            supabase.from('quote_items').select('*'),
            supabase.from('quote_discounts').select('*'),
            supabase.from('quote_markups').select('*')
        ]);

        if (itemsError || discountsError || markupsError) throw itemsError || discountsError || markupsError;

        state.priceData.items = (itemsData as DbQuoteItem[]) || [];
        state.priceData.prices = (itemsData || []).reduce((acc, item) => {
            if (!acc[item.category]) acc[item.category] = {};
            acc[item.category][item.model] = item.price;
            return acc;
        }, {} as Prices);
        state.priceData.tieredDiscounts = discountsData || [];
        state.priceData.markupPoints = markupsData || [];
        state.lastUpdated = remoteTimestamp;

        if (state.priceData.markupPoints.length > 0 && state.markupPoints === 0) {
            state.markupPoints = state.priceData.markupPoints[0].id;
        }

        localStorage.setItem(CACHE_KEY, JSON.stringify({ ...state.priceData, timestamp: remoteTimestamp }));
        return true;
    } catch (error: any) {
        // Handle AbortError gracefully (e.g., fast user navigation or logout)
        if (error.name === 'AbortError' || error.message?.includes('aborted')) {
            console.log('Data loading aborted.');
            return false;
        }
        
        state.appStatus = 'error';
        state.errorMessage = `<h3 style="color: #b91c1c;">数据加载失败</h3><p>无法初始化报价数据。</p><p>错误: ${error.message}</p>`;
        return false;
    }
}

export async function checkAndFixDbSchema() {
    if (state.hasAttemptedDbFix) return;
    state.hasAttemptedDbFix = true;

    try {
        const { error } = await supabase.from('quote_items').select('is_priority').limit(1);

        if (!error) return; // Column exists, no problem.

        const errMessage = error.message.toLowerCase();

        if (errMessage.includes('column "is_priority" does not exist')) {
            showModal({
                title: '数据库需更新',
                message: `
                    <p>系统检测到您的 "quote_items" 表缺少 <strong>is_priority</strong> 字段，这是“优先推荐”功能所必需的。</p>
                    <p>请按以下步骤在 Supabase 中添加该字段：</p>
                    <ol style="text-align: left; padding-left: 20px; line-height: 1.8;">
                        <li>登录 Supabase，进入项目的 "Table Editor"。</li>
                        <li>选择 "quote_items" 表。</li>
                        <li>点击 "+ Add column"。</li>
                        <li>名称: <strong>is_priority</strong></li>
                        <li>类型: <strong>bool</strong></li>
                        <li>默认值: <strong>false</strong></li>
                        <li>点击 "Save" 保存。</li>
                    </ol>
                    <p>添加成功后，请<strong>刷新本页面</strong>以应用更改。</p>
                `,
                confirmText: '好的',
                isDismissible: false,
            });
        } else if (errMessage.includes('could not find the')) {
            showModal({
                title: '数据库缓存问题',
                message: `
                    <p>应用无法访问 "is_priority" 字段，这可能是由于数据库的元数据缓存未更新。</p>
                    <p>请尝试在 Supabase 项目的 "API Docs" 页面，点击 "Reload schema" 按钮，然后刷新本页面。</p>
                    <p>如果问题仍存在，请检查 "quote_items" 表的行级安全策略 (RLS) 是否允许您的角色访问 "is_priority" 字段。</p>
                `,
                confirmText: '好的',
            });
        }
    } catch (e) {
        console.error("Error during DB schema check:", e);
    }
}


export async function handleUserSession(session: Session | null) {
    // 关键：如果是正在恢复Profile（注册流程中），跳过检查，防止被强制踢下线
    if (state.isRestoringProfile) {
        console.log("正在恢复用户资料，跳过会话检查...");
        return;
    }

    if (!session?.user) {
        state.currentUser = null;
        state.view = 'login';
        state.appStatus = 'ready';
        state.showCustomModal = false; // 关键修复：确保登出时清除任何残留的模态框
        renderApp();
        return;
    }

    // Prevent re-fetching data if user is already logged in and data is present
    if (state.currentUser?.id === session.user.id && state.priceData.items.length > 0) {
        state.appStatus = 'ready';
        renderApp();
        return;
    }
    
    state.appStatus = 'loading';
    renderApp();

    let profile: DbProfile | null = null;
    let error: any = null;

    try {
        const result = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        profile = result.data;
        error = result.error;
    } catch (e: any) {
        // Catch network aborts or other fetch exceptions
        if (e.name === 'AbortError' || e.message?.includes('aborted')) {
            console.log('Profile loading aborted.');
            return;
        }
        error = e;
    }

    // --- 超级管理员自愈机制 ---
    // 如果登录邮箱以 admin 开头，则强制视为超级管理员。
    // 这解决了“先有鸡还是先有蛋”的问题：确保 Admin 永远不会被“待审批”卡住。
    const isAdminEmail = session.user.email?.startsWith('admin');

    if (isAdminEmail) {
        // 如果 Profile 不存在，或者权限不对，或者未批准 -> 立即修复数据库
        if (error || !profile || profile.role !== 'admin' || !profile.is_approved) {
            console.log("⚠️ 检测到 Admin 账号状态异常，正在执行自动修复...");
            const fixedProfile = {
                id: session.user.id,
                full_name: profile?.full_name || 'System Administrator',
                role: 'admin',
                is_approved: true
            };

            const { error: fixError } = await supabase.from('profiles').upsert(fixedProfile);
            
            if (!fixError) {
                profile = fixedProfile as any;
                error = null;
                console.log("✅ Admin 账号修复成功");
            } else {
                console.error("❌ Admin 账号修复失败:", fixError);
            }
        }
    }
    // -------------------------

    if (error || !profile) {
        console.error("Profile load error:", error);
        state.view = 'login';
        state.appStatus = 'ready';
        await supabase.auth.signOut(); // Log out corrupted session
        return;
    }

    if (!profile.is_approved && profile.role !== 'admin') {
        showModal({ 
            title: '账户待审批', 
            message: '您的账户正在等待管理员批准，请稍后再试。', 
            onConfirm: async () => {
                state.showCustomModal = false; // 关键修复：先关闭模态框
                renderApp();
                await supabase.auth.signOut(); 
            }
        });
        state.appStatus = 'ready';
        renderApp();
        return;
    }

    if (await loadAllData()) {
        state.currentUser = { ...profile, auth: session.user };
        state.view = 'quote';
        if (profile.role === 'admin') {
            const { data: allProfiles } = await supabase.from('profiles').select('*');
            state.profiles = allProfiles || [profile];
            if (state.priceData.items.length === 0) {
                await seedDatabaseIfNeeded();
                await loadAllData(); // Reload after seeding
            }
            await checkAndFixDbSchema();
        } else {
            state.profiles = [profile];
        }
        supabase.from('login_logs').insert({ user_id: profile.id, user_name: profile.full_name }).then();
        
        // Success path
        state.appStatus = 'ready';
    } else {
        // Data load failed (aborted or error)
        // If it was a real error, state.appStatus is 'error'
        // If aborted, state.appStatus is still 'loading' (or whatever it was)
        if ((state.appStatus as string) !== 'error') {
            state.view = 'login';
            state.appStatus = 'ready';
        }
    }
    
    renderApp();
}


export async function initializeApp() {
    // Listen for future auth changes (login/logout)
    supabase.auth.onAuthStateChange(async (event, session) => {
        // We only care about SIGNED_IN and SIGNED_OUT events to avoid redundant runs
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
            await handleUserSession(session);
        }
    });

    // Check the initial session state on page load
    const { data: { session } } = await supabase.auth.getSession();
    await handleUserSession(session);
}
