import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const allowedOrigin = 'https://nguyenthanhhan888.github.io';
const headers = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return respond(405, 'Phương thức không được hỗ trợ.');

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const secretKey = serviceKey();
    if (!url || !secretKey) return respond(500, 'Máy chủ chưa được cấu hình đầy đủ.');

    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return respond(401, 'Vui lòng đăng nhập.');

    const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return respond(401, 'Phiên đăng nhập không hợp lệ.');

    const { data: profile } = await admin.from('user_roles').select('role, is_active').eq('user_id', authData.user.id).maybeSingle();
    if (profile?.role !== 'admin' || !profile.is_active) return respond(403, 'Chỉ admin được quản lý nhân viên.');

    const body = await request.json();
    if (body.action === 'list') return await listStaff(admin);
    if (body.action === 'create') return await createStaff(admin, body);
    if (body.action === 'reset_password') return await resetPassword(admin, body);
    if (body.action === 'update') return await updateStaff(admin, body);
    if (body.action === 'set_active') return await setStaffActive(admin, body);
    if (body.action === 'delete') return await deleteStaff(admin, body);
    return respond(400, 'Thao tác không hợp lệ.');
  } catch (error) {
    console.error('manage-staff error', error);
    return respond(500, 'Không thể xử lý yêu cầu quản lý nhân viên.');
  }
});

async function listStaff(admin: ReturnType<typeof createClient>) {
  const [{ data: roles, error: rolesError }, { data: usersData, error: usersError }, { data: reviews, error: reviewsError }] = await Promise.all([
    admin.from('user_roles').select('user_id, username, display_name, role, is_active, created_at').order('created_at'),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from('registration_requests').select('reviewed_by').not('reviewed_by', 'is', null),
  ]);
  if (rolesError || usersError || reviewsError) return respond(400, 'Không tải được danh sách nhân viên.');
  const users = new Map(usersData.users.map((user) => [user.id, user]));
  const reviewCounts = new Map<string, number>();
  for (const review of reviews || []) reviewCounts.set(review.reviewed_by, (reviewCounts.get(review.reviewed_by) || 0) + 1);
  const staff = (roles || []).map((profile) => {
    const user = users.get(profile.user_id);
    return {
      userId: profile.user_id,
      username: profile.username,
      displayName: profile.display_name,
      role: profile.role,
      isActive: profile.is_active,
      email: user?.email || '',
      lastSignInAt: user?.last_sign_in_at || null,
      reviewedCount: reviewCounts.get(profile.user_id) || 0,
    };
  });
  return json(200, { ok: true, staff });
}

async function createStaff(admin: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const displayName = clean(body.displayName, 100);
  const username = clean(body.username, 40).toLowerCase();
  const email = clean(body.email, 254).toLowerCase();
  const password = String(body.password || '');
  if (!displayName || !/^[a-z0-9._-]{3,40}$/.test(username)) return respond(400, 'Họ tên hoặc username không hợp lệ.');
  if (!/^\S+@\S+\.\S+$/.test(email)) return respond(400, 'Email không hợp lệ.');
  if (password.length < 6) return respond(400, 'Mật khẩu phải có ít nhất 6 ký tự.');

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error || !data.user) return respond(400, accountError(error?.message));

  const { error: profileError } = await admin.from('user_roles').insert({
    user_id: data.user.id,
    username,
    display_name: displayName,
    role: 'reviewer',
    is_active: true,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return respond(400, profileError.code === '23505' ? 'Username đã được sử dụng.' : 'Không tạo được hồ sơ nhân viên.');
  }
  return json(200, { ok: true, userId: data.user.id });
}

async function resetPassword(admin: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const userId = String(body.userId || '');
  const password = String(body.password || '');
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return respond(400, 'Tài khoản không hợp lệ.');
  if (password.length < 6) return respond(400, 'Mật khẩu phải có ít nhất 6 ký tự.');

  const { data: target } = await admin.from('user_roles').select('role, is_active').eq('user_id', userId).maybeSingle();
  if (target?.role !== 'reviewer') return respond(400, 'Chỉ có thể đặt lại mật khẩu nhân viên kiểm duyệt.');
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return respond(400, 'Không cập nhật được mật khẩu.');
  return json(200, { ok: true });
}

async function updateStaff(admin: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const userId = String(body.userId || '');
  const displayName = clean(body.displayName, 100);
  const username = clean(body.username, 40).toLowerCase();
  const email = clean(body.email, 254).toLowerCase();
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return respond(400, 'Tài khoản không hợp lệ.');
  if (!displayName || !/^[a-z0-9._-]{3,40}$/.test(username)) return respond(400, 'Họ tên hoặc username không hợp lệ.');
  if (!/^\S+@\S+\.\S+$/.test(email)) return respond(400, 'Email không hợp lệ.');

  const { data: current } = await admin.from('user_roles').select('username, display_name, role').eq('user_id', userId).maybeSingle();
  if (current?.role !== 'reviewer') return respond(400, 'Chỉ có thể sửa tài khoản nhân viên kiểm duyệt.');
  const { data: duplicate } = await admin.from('user_roles').select('user_id').eq('username', username).neq('user_id', userId).maybeSingle();
  if (duplicate) return respond(400, 'Username đã được sử dụng.');

  const { error: profileError } = await admin.from('user_roles').update({ username, display_name: displayName, updated_at: new Date().toISOString() }).eq('user_id', userId);
  if (profileError) return respond(400, 'Không cập nhật được hồ sơ nhân viên.');
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (authError) {
    await admin.from('user_roles').update({ username: current.username, display_name: current.display_name }).eq('user_id', userId);
    return respond(400, /already|registered|exists/i.test(authError.message) ? 'Email đã có tài khoản.' : 'Không cập nhật được tài khoản Auth.');
  }
  return json(200, { ok: true });
}

async function setStaffActive(admin: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const userId = String(body.userId || '');
  const isActive = body.isActive === true;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return respond(400, 'Tài khoản không hợp lệ.');
  const { data: target } = await admin.from('user_roles').select('role').eq('user_id', userId).maybeSingle();
  if (target?.role !== 'reviewer') return respond(400, 'Chỉ có thể khóa hoặc mở tài khoản nhân viên kiểm duyệt.');
  const { error } = await admin.from('user_roles').update({ is_active: isActive, updated_at: new Date().toISOString() }).eq('user_id', userId);
  if (error) return respond(400, 'Không cập nhật được trạng thái tài khoản.');
  return json(200, { ok: true });
}

async function deleteStaff(admin: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const userId = String(body.userId || '');
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return respond(400, 'Tài khoản không hợp lệ.');
  const { data: target } = await admin.from('user_roles').select('role').eq('user_id', userId).maybeSingle();
  if (target?.role !== 'reviewer') return respond(400, 'Chỉ có thể xóa tài khoản nhân viên kiểm duyệt.');
  const { count, error: countError } = await admin.from('registration_requests').select('id', { count: 'exact', head: true }).eq('reviewed_by', userId);
  if (countError) return respond(400, 'Không kiểm tra được lịch sử duyệt đơn.');
  if ((count || 0) > 0) return respond(400, 'Nhân viên đã có lịch sử duyệt đơn; hãy khóa tài khoản thay vì xóa.');
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return respond(400, 'Không xóa được tài khoản nhân viên.');
  return json(200, { ok: true });
}

function serviceKey() {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
    const value = keys.default;
    return typeof value === 'string' ? value : value?.key || '';
  } catch {
    return '';
  }
}

function clean(value: unknown, max: number) {
  return String(value || '').trim().slice(0, max);
}

function accountError(message = '') {
  if (/already|registered|exists/i.test(message)) return 'Email đã có tài khoản.';
  return 'Không tạo được tài khoản Auth.';
}

function respond(status: number, message: string) {
  return json(status, { ok: false, message });
}

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers });
}
