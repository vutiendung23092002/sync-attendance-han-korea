# Luồng thêm phòng ban Supabase cũ

Các file liên quan:

- `add-department-supabase.js`.
- `.github/workflows/add-department-supabase.yml`.
- `src/core/supabase-client.js`.

## 1. Chức năng cũ

Workflow manual nhận:

- Department ID/name.
- Lark app ID/secret.
- Status.

Script mã hóa app ID/secret bằng AES rồi upsert vào một bảng Supabase theo `id_phongban`:

```text
id_phongban
ten_phong_ban
lark_app_id (encrypted)
lark_app_secret (encrypted)
status
```

Tên bảng được đọc từ `TABLE_SUBABASE_NAME`.

## 2. Trạng thái hiện tại

Các job chính không đọc bảng này nữa. Chúng lấy cấu hình bằng query join:

```text
han_hrm.users
  -> han_hrm.departments
  -> han_hrm.apps(type = attendance)
```

Do đó thêm record bằng workflow legacy không làm organization/phòng ban mới tự xuất hiện trong attendance, correction hoặc leave sync hiện tại.

## 3. Lưu ý tên biến

Source legacy dùng `TABLE_SUBABASE_NAME` (thừa chữ `BA`), trong khi biến từng tồn tại trên GitHub có thể là `TABLE_SUPABASE_NAME`. Hai tên không giống nhau. Nếu workflow chỉ có `TABLE_SUPABASE_NAME`, script nhận table name là `undefined`.

## 4. Khuyến nghị vận hành

- Không dùng workflow legacy để onboarding tổ chức mới.
- Onboarding trực tiếp vào schema `han_hrm` theo hướng dẫn trong [Kiến trúc](./01-architecture.md).
- Có thể archive workflow/script này sau khi xác nhận không còn hệ thống ngoài repository gọi đến.
- Xóa GitHub variable `TABLE_SUPABASE_NAME` không ảnh hưởng các luồng sync hiện tại và không xóa bảng Supabase cũ.
