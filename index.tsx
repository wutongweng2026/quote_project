import { supabase, state } from './state';
import { renderApp, showModal } from './ui';
import { addEventListeners } from './logic';
import { seedDataObject } from './seedData';
import type { DbProfile, Prices, DbQuoteItem } from './types';

const CACHE_KEY = 'qqs_price_data_cache_v1';

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
                    is_priority: false
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
        state.appStatus = 'loading';
        renderApp();

        // 1. Fetch the remote timestamp first (Fast metadata check)
        const { data: metaData, error: metaError } = await supabase
            .from('quote_meta')
            .select('value')
            .eq('key', 'last_prices_updated')
            .single();
        
        const remoteTimestamp = metaData?.value as string | null;

        // 2. Check Local Cache
        const cachedStr = localStorage.getItem(CACHE_KEY);
        if (cachedStr && remoteTimestamp) {
            try {
                const cache = JSON.parse(cachedStr);
                if (cache.timestamp === remoteTimestamp) {
                    console.log('⚡ Using local price data cache...');
                    state.priceData.items = cache.items;
                    state.priceData.prices = cache.prices;
                    state.priceData.tieredDiscounts = cache.discounts;
                    state.priceData.markupPoints = cache.markups;
                    state.lastUpdated = cache.timestamp;
                    state.appStatus = 'ready';
                    return true;
                }
            } catch (e) {
                console.warn('Cache parsing failed, falling back to network.');
            }
        }

        // 3. Fallback: Fetch all data in parallel
        console.log('🌐 Fetching fresh data from database...');
        const [
            { data: itemsData, error: itemsError },
            { data: discountsData, error: discountsError },
            { data: markupsData, error: markupsError }
        ] = await Promise.all([
            supabase.from('quote_items').select('*'),
            supabase.from('quote_discounts').select('*'),
            supabase.from('quote_markups').select('*')
        ]);

        if (itemsError) throw itemsError;
        if (discountsError) throw discountsError;
        if (markupsError) throw markupsError;

        // Build derived data
        const pricesMap = (itemsData || []).reduce((acc, item) => {
            if (!acc[item.category]) acc[item.category] = {};
            acc[item.category][item.model] = item.price;
            return acc;
        }, {} as Prices);

        // Update state
        state.priceData.items = (itemsData as DbQuoteItem[]) || [];
        state.priceData.prices = pricesMap;
        state.priceData.tieredDiscounts = discountsData || [];
        state.priceData.markupPoints = markupsData || [];
        state.lastUpdated = remoteTimestamp;

        if (state.priceData.markupPoints.length > 0 && state.markupPoints === 0) {
            state.markupPoints = state.priceData.markupPoints[0].id;
        }

        // Update Cache
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                items: state.priceData.items,
                prices: state.priceData.prices,
                discounts: state.priceData.tieredDiscounts,
                markups: state.priceData.markupPoints,
                timestamp: remoteTimestamp
            }));
        } catch (e) {
            console.warn('Could not save data to local storage (is it full?)');
        }

        state.appStatus = 'ready';
        return true;
    } catch (error: any) {
        state.appStatus = 'error';
        state.errorMessage = `
            <h3 style="color: #b91c1c; margin-top:0;">数据加载失败</h3>
            <p>登录成功，但无法初始化报价数据。</p>
            <p style="margin-top: 1rem;">原始错误: ${error.message}</p>`;
        return false;
    }
}

supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
        // Only attempt to load profile if we have a session
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('id, full_name, role, is_approved')
            .eq('id', session.user.id)
            .single();

        if (error) {
            console.error("Profile load error:", error);
            state.currentUser = null;
            state.appStatus = 'error';
            // ... handle profile errors (already implemented)
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
                        await supabase.auth.signOut();
                    }
                });
                return;
            }
            
            state.showCustomModal = false;

            // SUCCESSFUL LOGIN: Now and only now, load the heavy data.
            const loadedSuccessfully = await loadAllData(); 

            if (loadedSuccessfully) {
                state.currentUser = { ...profile, auth: session.user };
                if (profile.role === 'admin') {
                    // Admins get extra profile list for management
                    const { data: allProfiles } = await supabase.from('profiles').select('*');
                    state.profiles = allProfiles || [profile];
                    // Also check if DB needs initial seed if data is totally empty
                    if (state.priceData.items.length === 0) {
                        await seedDatabaseIfNeeded();
                        await loadAllData(); // Re-load after seeding
                    }
                } else {
                    state.profiles = [profile];
                }
                state.view = 'quote';
                
                // Background task: log login - using then() to avoid catch/any TS issues
                supabase.from('login_logs').insert({
                    user_id: profile.id,
                    user_name: profile.full_name
                }).then(({ error: logError }) => {
                    if (logError) console.error("Login logging failed:", logError);
                });
            }
        }
    } else {
        // NO SESSION: Show login view immediately
        state.appStatus = 'ready';
        state.currentUser = null;
        state.profiles = [];
        state.view = 'login';
    }
    
    renderApp();
});


(async () => {
    addEventListeners();
    // Check session on start, auth listener will handle the result
    supabase.auth.getSession();
})();