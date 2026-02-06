import { state, supabase } from '../state';
import { renderApp, showModal } from '../ui';
const $ = (selector: string) => document.querySelector(selector);

export function attachUserManagementListeners() {
    $('#back-to-quote-btn')?.addEventListener('click', () => { state.view = 'quote'; renderApp(); });

    const container = $('.app-layout');
    if (!container) return;

    container.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const button = target.closest('button');
        if (!button) return;

        const row = target.closest('tr');
        const userId = row?.dataset.userId;

        if (button.id === 'add-new-user-btn') {
            showModal({
                title: '添加新用户',
                message: `
                    <div class="auth-input-group">
                        <label for="new-email">邮箱</label>
                        <input type="email" id="new-email" class="form-input" required>
                    </div>
                    <div class="auth-input-group">
                        <label for="new-password">密码</label>
                        <input type="password" id="new-password" class="form-input" required>
                    </div>
                     <div class="auth-input-group">
                        <label for="new-fullname">用户名</label>
                        <input type="text" id="new-fullname" class="form-input" required>
                    </div>
                    <div class="auth-input-group">
                        <label for="new-role">角色</label>
                        <select id="new-role" class="form-select">
                            <option value="sales">销售</option>
                            <option value="manager">后台管理</option>
                            <option value="admin">管理员</option>
                        </select>
                    </div>
                `,
                showCancel: true,
                confirmText: '创建',
                onConfirm: async () => {
                    const email = ($('#new-email') as HTMLInputElement).value;
                    const password = ($('#new-password') as HTMLInputElement).value;
                    const fullName = ($('#new-fullname') as HTMLInputElement).value;
                    const role = ($('#new-role') as HTMLSelectElement).value;

                    if (!email || !password || !fullName) {
                        state.customModal.errorMessage = "所有字段均为必填项。";
                        return renderApp();
                    }
                    
                    // 1. Get current admin session to restore it later
                    const { data: { session: adminSession } } = await supabase.auth.getSession();
                    if (!adminSession) {
                        state.customModal.errorMessage = "无法获取当前管理员会话，请重新登录。";
                        return renderApp();
                    }

                    // 2. Sign up the new user. This will temporarily change the session.
                    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                        email,
                        password,
                    });

                    // 3. IMPORTANT: Restore the admin session immediately, regardless of the outcome.
                    await supabase.auth.setSession(adminSession);

                    // 4. Handle results of the signUp call
                    if (signUpError) {
                        let message = `创建失败: ${signUpError.message}`;
                        if (signUpError.message.includes('Signups not allowed')) {
                            message = '创建失败: 项目设置禁止新用户注册。请在 Supabase 控制面板中允许用户注册。';
                        } else if (signUpError.message.includes('User already registered')) {
                            message = '创建失败: 该邮箱已被注册。';
                        }
                        state.customModal.errorMessage = message;
                        return renderApp();
                    }

                    if (!signUpData.user) {
                        state.customModal.errorMessage = "创建失败: 未能从 Supabase 返回用户信息。";
                        return renderApp();
                    }

                    // 5. With admin session restored, insert the profile for the new user.
                    const { error: profileError } = await supabase.from('profiles').insert({
                        id: signUpData.user.id, full_name: fullName, role, is_approved: true
                    });

                    // If profile creation fails, we have an orphaned auth user. Inform the admin.
                    if (profileError) {
                        state.customModal.errorMessage = `Auth 用户已创建，但 Profile 创建失败: ${profileError.message}。请在 Supabase 中手动删除用户 ${email} 并重试。`;
                        return renderApp();
                    }
                    
                    // 6. Success: Refresh the user list and close the modal
                    const { data: allProfiles } = await supabase.from('profiles').select('*');
                    state.profiles = allProfiles || [];
                    state.showCustomModal = false;
                    renderApp();
                }
            });
        }

        if (!userId) return;

        if (button.classList.contains('approve-user-btn')) {
            const { error } = await supabase.from('profiles').update({ is_approved: true }).eq('id', userId);
            if (error) return showModal({ title: '错误', message: `批准用户失败: ${error.message}` });
            const profile = state.profiles.find(p => p.id === userId);
            if (profile) profile.is_approved = true;
            renderApp();
        }

        if (button.classList.contains('permission-toggle-btn')) {
            const action = button.dataset.action;
            const newRole = action === 'grant' ? 'manager' : 'sales';
            const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
            if (error) return showModal({ title: '错误', message: `更新权限失败: ${error.message}` });
            const profile = state.profiles.find(p => p.id === userId);
            if (profile) profile.role = newRole as 'sales' | 'manager';
            renderApp();
        }

        if (button.classList.contains('delete-user-btn')) {
            showModal({
                title: '确认删除',
                message: `确定要永久删除此用户吗？此操作无法撤销。`,
                showCancel: true, isDanger: true, confirmText: '确认删除',
                onConfirm: async () => {
                    try {
                        const { error: adminError } = await supabase.auth.admin.deleteUser(userId);
                        if (adminError) throw adminError;
                        
                        state.profiles = state.profiles.filter(p => p.id !== userId);
                        state.showCustomModal = false;
                        renderApp();
                    } catch(err: any) {
                        showModal({title: "删除失败", message: `该错误可能是因为当前用户没有权限删除其他用户。请检查Supabase RLS策略。错误详情: ${err.message}`, isDanger: true});
                    }
                }
            });
        }
    });
}