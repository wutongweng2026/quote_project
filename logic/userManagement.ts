
import { state, supabase } from '../state';
import { renderApp, showModal } from '../ui';
const $ = (selector: string) => document.querySelector(selector);

// 必须与 login.ts 保持一致
const INTERNAL_EMAIL_SUFFIX = '@longsheng.local';

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
                title: '添加内部员工',
                message: `
                    <div class="auth-input-group">
                        <label for="new-username">用户名 (登录账号)</label>
                        <input type="text" id="new-username" class="form-input" placeholder="例如: zhangsan" required>
                        <small style="color: #666; display:block; margin-top:4px; font-size: 0.8rem;">* 仅支持字母、数字或下划线</small>
                    </div>
                    <div class="auth-input-group">
                        <label for="new-fullname">员工姓名 (显示名称)</label>
                        <input type="text" id="new-fullname" class="form-input" placeholder="例如: 张三" required>
                    </div>
                    <div class="auth-input-group">
                        <label for="new-password">初始密码</label>
                        <input type="text" id="new-password" class="form-input" value="123456" required>
                    </div>
                    <div class="auth-input-group">
                        <label for="new-role">角色权限</label>
                        <select id="new-role" class="form-select">
                            <option value="sales">销售人员 (仅报价)</option>
                            <option value="manager">后台管理 (可改价)</option>
                            <option value="admin">系统管理员 (完全控制)</option>
                        </select>
                    </div>
                `,
                showCancel: true,
                confirmText: '创建账号',
                onConfirm: async () => {
                    const username = ($('#new-username') as HTMLInputElement).value.trim();
                    const password = ($('#new-password') as HTMLInputElement).value.trim();
                    const fullName = ($('#new-fullname') as HTMLInputElement).value.trim();
                    const role = ($('#new-role') as HTMLSelectElement).value;

                    if (!username || !password || !fullName) {
                        state.customModal.errorMessage = "请填写所有必填项。";
                        return renderApp();
                    }
                    
                    // 简单的用户名校验
                    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
                        state.customModal.errorMessage = "用户名只能包含字母、数字或下划线。";
                        return renderApp();
                    }

                    // 1. 获取当前管理员会话，以便稍后恢复
                    const { data: { session: adminSession } } = await supabase.auth.getSession();
                    if (!adminSession) {
                        state.customModal.errorMessage = "无法获取当前管理员会话，请重新登录。";
                        return renderApp();
                    }

                    // 自动生成内部邮箱
                    const email = `${username}${INTERNAL_EMAIL_SUFFIX}`;

                    // 2. 创建新用户 (这会临时切换当前会话)
                    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                        email,
                        password,
                        options: {
                            data: { full_name: fullName } // 可选：将全名也存在 auth metadata 中
                        }
                    });

                    // 3. 关键步骤：无论成功失败，立即恢复管理员会话
                    await supabase.auth.setSession(adminSession);

                    // 4. 处理结果
                    if (signUpError) {
                        let message = `创建失败: ${signUpError.message}`;
                        if (signUpError.message.includes('already registered')) {
                            message = `创建失败: 用户名 "${username}" 已存在。`;
                        }
                        state.customModal.errorMessage = message;
                        return renderApp();
                    }

                    if (!signUpData.user) {
                        state.customModal.errorMessage = "创建失败: 未能从 Supabase 获取新用户信息。";
                        return renderApp();
                    }

                    // 5. 在 profiles 表中记录用户详情
                    // 关键修复：使用 upsert 替代 insert，兼容数据库触发器
                    const { error: profileError } = await supabase.from('profiles').upsert({
                        id: signUpData.user.id,
                        full_name: fullName, 
                        role, 
                        is_approved: true // 管理员创建的账号默认已批准
                    }, { onConflict: 'id' });

                    if (profileError) {
                        state.customModal.errorMessage = `Auth账号已创建，但资料表写入失败: ${profileError.message}`;
                        return renderApp();
                    }
                    
                    // 6. 成功：刷新列表
                    const { data: allProfiles } = await supabase.from('profiles').select('*');
                    state.profiles = allProfiles || [];
                    state.showCustomModal = false;
                    
                    showModal({
                        title: '创建成功',
                        message: `员工 <b>${fullName}</b> 的账号已创建。<br>登录名: <b>${username}</b><br>初始密码: <b>${password}</b>`,
                        confirmText: '知道了'
                    });
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
                message: `确定要删除此用户吗？<br><br><span style="font-size:0.9rem; color:var(--text-color-secondary)">注意：这将删除该用户的资料并禁止其登录。</span>`,
                showCancel: true, isDanger: true, confirmText: '确认删除',
                onConfirm: async () => {
                    try {
                        // 1. 从 profiles 表删除数据
                        // 这会自动禁止用户进入系统，因为 appController.ts 在登录时会检查 profile 是否存在
                        const { error: profileError } = await supabase.from('profiles').delete().eq('id', userId);
                        if (profileError) throw profileError;
                        
                        // 2. 更新本地状态
                        state.profiles = state.profiles.filter(p => p.id !== userId);
                        state.showCustomModal = false;
                        
                        // 3. 不调用 auth.admin.deleteUser，因为客户端无权限，且删除 profile 已达到业务目的
                        renderApp();
                    } catch(err: any) {
                        showModal({title: "删除失败", message: `操作失败: ${err.message}`, isDanger: true});
                    }
                }
            });
        }
    });
}
