

import { state, supabase } from '../state';
import { renderApp, showModal } from '../ui';
import { handleUserSession } from './appController';

const $ = (selector: string) => document.querySelector(selector);

// 定义内部使用的虚拟域名后缀
const INTERNAL_EMAIL_SUFFIX = '@longsheng.local';

export function attachLoginListeners() {
    // 切换登录/注册模式
    $('#auth-mode-toggle')?.addEventListener('click', (e) => {
        e.preventDefault();
        state.authMode = state.authMode === 'login' ? 'register' : 'login';
        renderApp();
    });

    $('#login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const target = e.target as HTMLFormElement;
        const usernameInput = (target.elements.namedItem('username') as HTMLInputElement).value.trim();
        // Fix: Trim password to remove accidental trailing spaces from copy-paste
        const password = (target.elements.namedItem('password') as HTMLInputElement).value.trim();
        const fullNameInput = target.querySelector('#fullname') as HTMLInputElement; // 仅注册模式存在
        
        // Fix: Use generic type selector as class names may vary in UI updates
        const loginButton = target.querySelector('button[type="submit"]') as HTMLButtonElement;
        const errorDiv = $('#login-error') as HTMLDivElement;

        // Reset error
        if (errorDiv) errorDiv.style.display = 'none';

        if (!usernameInput || !password) return;

        // 注册时的严格校验
        if (state.authMode === 'register') {
            if (!fullNameInput?.value.trim()) {
                 if (errorDiv) {
                     errorDiv.textContent = '请输入您的真实姓名';
                     errorDiv.style.display = 'block';
                 }
                 return;
            }
            // 校验用户名: 仅允许字母、数字、下划线 (如果用户直接输入了 @ 认为是高级用户或 legacy，跳过此校验)
            if (!usernameInput.includes('@') && !/^[a-zA-Z0-9_]+$/.test(usernameInput)) {
                if (errorDiv) {
                    errorDiv.textContent = '用户名格式错误：仅允许使用英文字母、数字或下划线。';
                    errorDiv.style.display = 'block';
                }
                return;
            }
            // 校验密码: 长度 > 6
            if (password.length <= 6) {
                if (errorDiv) {
                    errorDiv.textContent = '密码强度不足：长度必须大于 6 位。';
                    errorDiv.style.display = 'block';
                }
                return;
            }
        }

        if (loginButton) {
            loginButton.disabled = true; 
            loginButton.innerHTML = `<span class="spinner"></span> 正在处理`; 
        }
        
        // 自动构建虚拟邮箱: zhangsan -> zhangsan@longsheng.local
        // 如果用户直接输入了包含 @ 的完整邮箱（如 admin@admin），则直接使用
        const email = usernameInput.includes('@') ? usernameInput : `${usernameInput}${INTERNAL_EMAIL_SUFFIX}`;

        try {
            if (state.authMode === 'login') {
                const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
                
                if (signInError) {
                    // Downgrade standard login failures to warn to avoid console noise
                    if (signInError.message === 'Invalid login credentials') {
                        console.warn("Login attempt failed: Invalid credentials");
                        throw new Error(`用户名或密码错误。`);
                    } else if (signInError.message.includes('Email not confirmed')) {
                        console.warn("Login attempt failed: Email not confirmed");
                        throw new Error(`账号未激活。请联系管理员或检查邮箱。`);
                    }
                    
                    console.error("Login Error Details:", signInError);
                    throw new Error("登录失败，请检查用户名或密码。");
                }
            } else {
                // --- 注册逻辑 (含账号恢复) ---
                const fullName = fullNameInput.value.trim();
                state.isRestoringProfile = true; // 锁定：防止 index.tsx 的监听器在 profile 恢复完成前强制登出

                // 1. 尝试注册
                let authResponse = await supabase.auth.signUp({
                    email,
                    password,
                    options: { data: { full_name: fullName } }
                });

                // 2. 如果账号已存在 (幽灵账户：Profile被删但Auth存在)，尝试登录以恢复
                if (authResponse.error && authResponse.error.message.toLowerCase().includes('already registered')) {
                    console.log("Account exists in Auth, attempting to verify ownership via login...");
                    const signInResponse = await supabase.auth.signInWithPassword({ email, password });
                    
                    if (!signInResponse.error && signInResponse.data.user) {
                         // 密码正确，视为账号所有者，准备恢复资料
                         authResponse = { 
                             data: { user: signInResponse.data.user, session: signInResponse.data.session }, 
                             error: null 
                         };
                    } else {
                        // 账号已存在且密码错误
                        throw new Error("该用户名已被注册。如果您是本人，请直接登录；如果密码错误或无法登录，请联系管理员。");
                    }
                } else if (authResponse.error) {
                    throw authResponse.error;
                }

                if (!authResponse.data.user) throw new Error("注册失败，系统未返回用户信息。");

                // 3. 重建/更新 Profile
                // 只有用户名是 admin 时才自动批准且拥有管理员权限，其他人默认待审批
                const isSystemAdmin = usernameInput.toLowerCase() === 'admin';
                const role = isSystemAdmin ? 'admin' : 'sales';
                const isApproved = isSystemAdmin; // 关键修改：非 admin 用户默认不批准

                const { error: profileError } = await supabase.from('profiles').upsert({
                    id: authResponse.data.user.id,
                    full_name: fullName,
                    role: role,
                    is_approved: isApproved 
                }, { onConflict: 'id' });

                if (profileError) {
                     console.error("Profile restoration failed:", profileError);
                     throw new Error(`账号验证成功，但无法初始化用户资料: ${profileError.message}`);
                }
                
                // 4. 处理注册后流程
                if (!isApproved) {
                    // 对于待审批用户，显示成功提示，并在确认后登出
                    showModal({
                        title: '注册成功，等待审核',
                        message: `
                            <p>您的账号 <strong>${usernameInput}</strong> 已成功创建。</p>
                            <p style="color: #ea580c; font-weight: 500;">出于安全考虑，新账号需要管理员批准后方可登录。</p>
                            <p>请联系管理员处理。</p>
                        `,
                        confirmText: '返回登录',
                        isDismissible: false,
                        onConfirm: async () => {
                            state.showCustomModal = false;
                            state.isRestoringProfile = false; // 解锁
                            state.authMode = 'login'; // 重置为登录模式
                            renderApp(); // 立即渲染登录界面
                            await supabase.auth.signOut(); // 登出清除会话
                        }
                    });
                    // 注意：这里不调用 handleUserSession，也不释放 isRestoringProfile 锁（直到用户手动处理）
                    return; 
                }

                // 对于 Admin 用户 (已批准)，直接登录
                state.isRestoringProfile = false;
                state.authMode = 'login'; 
                await handleUserSession(authResponse.data.session);
                return;
            }
        } catch (err: any) {
            console.error(err);
            state.isRestoringProfile = false; // 只有失败时才需要手动重置锁
            if (errorDiv) {
                errorDiv.textContent = err.message || '操作失败，请重试';
                errorDiv.style.display = 'block';
            }
            if (loginButton) {
                loginButton.disabled = false; 
                loginButton.innerHTML = state.authMode === 'login' ? '登录' : '注册并自动登录';
            }
            // 如果处于异常登录状态，强制登出以清理环境
            await supabase.auth.signOut();
        }
    });
}
