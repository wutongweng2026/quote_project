import { supabase, state } from './state';
import { renderApp, showModal } from './ui';
import { addEventListeners } from './logic';
import { seedDataObject } from './seedData';
import type { DbProfile, Prices } from './types';

async function seedDatabaseIfNeeded() {
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

        // 1. Seed Prices (quote_items)
        const itemsToInsert = Object.entries(seedDataObject.prices)
            .flatMap(([category, models]) =>
                Object.entries(models).map(([model, price]) => ({
                    category,
                    model,
                    price,
                }))
            );

        const { error: itemsError } = await supabase.from('quote_items').insert(itemsToInsert);
        if (itemsError) {
            console.error("Error seeding quote_items:", itemsError);
        } else {
            console.log(`Seeded ${itemsToInsert.length} items successfully.`);
        }

        // 2. Seed Discounts (quote_discounts)
        const discountsToInsert = seedDataObject.tieredDiscounts;
        const { error: discountsError } = await supabase.from('quote_discounts').insert(discountsToInsert);
        if (discountsError) {
            console.error("Error seeding quote_discounts:", discountsError);
        } else {
            console.log(`Seeded ${discountsToInsert.length} discounts successfully.`);
        }
    } catch (error) {
        console.error("An unexpected error occurred during the seeding process:", error);
    }
}


async function loadAllData(): Promise<boolean> {
    try {
        const { data: itemsData, error: itemsError } = await supabase.from('quote_items').select('*');
        if (itemsError) throw itemsError;

        const { data: discountsData, error: discountsError } = await supabase.from('quote_discounts').select('*');
        if (discountsError) throw discountsError;

        const { data: markupsData, error: markupsError } = await supabase.from('quote_markups').select('*');
        if (markupsError) throw markupsError;
        
        const { data: metaData, error: metaError } = await supabase
            .from('quote_meta')
            .select('value')
            .eq('key', 'last_prices_updated')
            .single();

        if (metaError && metaError.code !== 'PGRST116') { // Ignore 'range not found' error if key doesn't exist
            throw metaError;
        }

        state.priceData.prices = (itemsData || []).reduce((acc, item) => {
            if (!acc[item.category]) acc[item.category] = {};
            acc[item.category][item.model] = item.price;
            return acc;
        }, {} as Prices);

        state.priceData.tieredDiscounts = discountsData || [];
        state.priceData.markupPoints = markupsData || [];
        state.lastUpdated = metaData?.value as string | null;

        
        if (state.priceData.markupPoints.length > 0 && state.markupPoints === 0) {
            state.markupPoints = state.priceData.markupPoints[0].id;
        }

        state.appStatus = 'ready';
        return true;
    } catch (error: any) {
        state.appStatus = 'error';
        state.errorMessage = `
            <h3 style="color: #b91c1c; margin-top:0;">无法加载应用数据</h3>
            <p>登录成功，但无法获取报价所需的核心数据。这通常是由于数据库权限问题导致的。</p>
            <h4>解决方案：</h4>
            <p>请确保已为 <strong>登录用户</strong> 开启了读取 <code>quote_items</code>, <code>quote_discounts</code>, 和 <code>quote_markups</code> 这三个表的权限。</p>
            <p style="margin-top: 1rem;">原始错误: ${error.message}</p>`;
        state.currentUser = null;
        return false;
    }
}

supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('id, full_name, role, is_approved')
            .eq('id', session.user.id)
            .single();

        if (error) {
            console.error("Profile load error:", error);
            state.currentUser = null;
            state.appStatus = 'error';
            
            // Special handling for the recursion error
            if (error.message.includes('infinite recursion')) {
                state.errorMessage = `
                    <div style="text-align: left;">
                        <h3 style="color: #b91c1c; margin-top:0;">数据库策略错误 (无限递归)</h3>
                        <p>检测到 RLS 策略导致的死循环。这是因为权限检查逻辑在查询自身。</p>
                        <p>请<strong>立即</strong>在 Supabase SQL Editor 中运行以下修复脚本：</p>
                        <pre style="background: #f1f5f9; padding: 10px; border-radius: 4px; overflow: auto; font-family: monospace; font-size: 0.8rem; border: 1px solid #e2e8f0;">
-- 1. 创建安全检查函数 (绕过RLS)
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public
as $$ select exists (select 1 from profiles where id = auth.uid() and role = 'admin'); $$;

-- 2. 清理旧策略
drop policy if exists "Admins can insert and update all profiles" on profiles;
drop policy if exists "Admins can manage all profiles" on profiles;
drop policy if exists "Users can read own profile" on profiles;

-- 3. 创建新策略
create policy "Users can read own profile" on profiles 
for select to authenticated using ( auth.uid() = id );

create policy "Admins can do everything" on profiles 
for all to authenticated using ( public.is_admin() ) with check ( public.is_admin() );</pre>
                    </div>
                `;
            } else {
                state.errorMessage = `无法获取您的用户资料: ${error.message}. <br/><br/>这可能是数据库权限问题。请确保您为 'profiles' 表启用了RLS，并设置了允许用户读取自己的数据。`;
            }
            
            renderApp();
            return;
        }

        if (profile) {
            if (!profile.is_approved && profile.role !== 'admin') {
                state.appStatus = 'ready';
                showModal({
                    title: '账户待审批',
                    message: '您的账户正在等待管理员批准，请稍后再试。',
                    onConfirm: async () => {
                        state.showCustomModal = false;
                        renderApp();
                        await supabase.auth.signOut();
                    }
                });
                return;
            }
            
            // FIX: Explicitly hide any stale modals if the user is approved or an admin.
            state.showCustomModal = false;

            const loadedSuccessfully = await loadAllData(); 

            if (loadedSuccessfully) {
                state.currentUser = { ...profile, auth: session.user };
                if (profile.role === 'admin') {
                    const { data: allProfiles, error: profilesError } = await supabase.from('profiles').select('*');
                    state.profiles = profilesError ? [profile] : (allProfiles || []);
                } else {
                    state.profiles = [profile];
                }
                state.view = 'quote';
                
                // Insert a record into the login log without blocking the UI
                supabase.from('login_logs').insert({
                    user_id: profile.id,
                    user_name: profile.full_name
                }).then(({ error }) => {
                    if (error) {
                        console.error("Login logging failed:", error);
                    }
                });
            }
        } else {
            state.appStatus = 'ready';
            showModal({
                title: '登录错误',
                message: '您的账户存在，但未能找到对应的用户资料。请联系管理员。',
                onConfirm: async () => { await supabase.auth.signOut(); }
            });
            return;
        }
    } else {
        state.appStatus = 'ready';
        state.currentUser = null;
        state.profiles = [];
        state.view = 'login';
    }
    
    renderApp();
});


(async () => {
    await seedDatabaseIfNeeded();
    addEventListeners();
    // Trigger initial auth state check
    await supabase.auth.getSession();
})();