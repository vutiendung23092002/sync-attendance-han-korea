# Sync attendance

Repo này đồng bộ dữ liệu chấm công, đơn sửa giờ và đơn nghỉ phép từ Lark về LarkBase HRM.

## Luồng chính

- `sync-attendance.js`: lấy kết quả chấm công theo phòng ban, format và upsert vào bảng chấm công.
- `sync-correction-records.js`: lấy đơn sửa giờ từ Lark Approval, đồng bộ vào bảng sửa giờ.
- `check-correction-status.js`: đọc các đơn sửa giờ đã `Approved` và cập nhật ngược vào bảng chấm công.
- `sync-leave-instances.js`: lấy đơn nghỉ phép từ Lark Approval và đồng bộ vào bảng phép.

## Setup local

1. Cài dependencies:

```bash
npm install
```

2. Tạo file `.env`:

```env
DATABASE_SERVICE_KEY=
DATABASE_URL=
AES_256_CBC_APP_SECRET_KEY=

LARK_HRM_APP_ID=
LARK_HRM_APP_SECRET=
LARK_BASE_ID=

TABLE_NAME_ATTENDANCE=
TABLE_CORECTION_NAME=
TABLE_INSTANCES_NAME=

TABLE_ATTENDANCE_ID=
TABLE_CORECTION_ID=

FROM=2026/06/01
TO=2026/06/30
```

Ghi chú:

- `DATABASE_SERVICE_KEY`: Supabase service role key, dùng cho Supabase API.
- `DATABASE_URL`: PostgreSQL connection string, dùng để đọc trực tiếp schema `han_hrm`.
- `AES_256_CBC_APP_SECRET_KEY`: key giải mã app id/app secret cũ, dùng cho các script còn đọc cấu hình cũ.
- `LARK_HRM_APP_ID` và `LARK_HRM_APP_SECRET`: app HRM dùng để ghi vào LarkBase trung tâm.
- `FROM` / `TO`: format `YYYY/MM/DD`. Nếu không truyền, từng script sẽ dùng default riêng.

3. Test PostgreSQL:

```bash
node test-postgres-connection.js
```

Nếu OK, kết quả sẽ thấy được các bảng:

```text
han_hrm.users
han_hrm.departments
han_hrm.apps
```

## Lệnh chạy

```bash
node sync-attendance.js
node sync-correction-records.js
node check-correction-status.js
node sync-leave-instances.js
```

## Khoảng ngày mặc định

- `sync-attendance.js`: mặc định sync từ đầu tháng đến hôm nay; tháng có 31 ngày sẽ bắt đầu từ ngày 02 để không vượt giới hạn 30 ngày của Lark.
- `sync-correction-records.js`: mặc định sync từ đầu tháng đến hôm nay; tháng có 31 ngày sẽ bắt đầu từ ngày 02 để không vượt giới hạn 30 ngày của Lark.
- `sync-leave-instances.js`: mặc định sync từ 29 ngày trước đến hôm nay.
- `check-correction-status.js`: nếu trước mùng 8 thì check 30 ngày trước, nếu từ mùng 8 trở đi thì check từ đầu tháng.

## GitHub Actions

Cần cấu hình Environment secrets:

```text
DATABASE_SERVICE_KEY
DATABASE_URL
AES_256_CBC_APP_SECRET_KEY
LARK_HRM_APP_ID
LARK_HRM_APP_SECRET
CALLBACK_URL
```

Cần cấu hình Environment vars:

```text
LARK_BASE_ID
TABLE_NAME_ATTENDANCE
TABLE_CORECTION_NAME
TABLE_INSTANCES_NAME
TABLE_ATTENDANCE_ID
TABLE_CORECTION_ID
FROM
TO
```

Workflow chính:

- `.github/workflows/sync-attendance.yml`: sync chấm công, cron hiện tại `30 20 * * *`, tương đương khoảng 03:30 giờ Việt Nam.
- `.github/workflows/sync-correction-records.yml`: sync đơn sửa giờ, sau đó có thể chạy check status.
- `.github/workflows/check-correction.yml`: chạy riêng bước apply đơn sửa giờ.
- `.github/workflows/sync-leave-instance.yml`: sync đơn nghỉ phép.

Các workflow đặt `TZ=Asia/Ho_Chi_Minh` để cách parse/format ngày giờ của Node giống nhau giữa local và GitHub Actions. Cron của GitHub vẫn luôn tính theo UTC.

Khi chạy tự động (`schedule`), workflow không truyền `FROM` / `TO`; từng script tự tính range theo ngày Việt Nam:

- Attendance và correction: từ đầu tháng đến hôm nay. Tháng có 31 ngày bắt đầu từ ngày 02 để không vượt giới hạn 30 ngày của Lark (riêng ngày mùng 1 vẫn bắt đầu từ ngày 01).
- Check correction: trước ngày 08 lấy 30 ngày trước đến hôm nay; từ ngày 08 lấy ngày đầu tháng đến hôm nay.
- Leave: từ 29 ngày trước đến hôm nay.

Khi chạy thủ công (`workflow_dispatch`), range lấy từ input `FROM` / `TO`. Khi chạy local, `FROM` / `TO` trong `.env` vẫn được ưu tiên; muốn dùng range tự động thì để trống hoặc bỏ hai biến này.

Khi sync phiếu sửa giờ, hệ thống tự nhận diện một số trường hợp nghi ngờ chọn nhầm giờ:

- Phiếu `Start time` có `Replenishment time` sau 17:00 được đưa về giờ Start trong `Original record`.
- Phiếu `End time` có `Replenishment time` trước 09:00 được đưa về giờ End trong `Original record`.
- Chỉ tự sửa ca ngày có Start gốc trước 09:00 hoặc End gốc sau 17:00; nếu không đủ dữ liệu hoặc là ca đặc biệt thì giữ nguyên.
- Giá trị trước khi sửa được lưu trong cột `Ghi chú`, cột này được tự tạo nếu chưa tồn tại.

## Schema `han_hrm`

Schema `han_hrm` là nguồn metadata mới cho tổ chức, phòng ban, nhân sự và app Lark.

### `han_hrm.organizations`

Lưu danh sách tổ chức/công ty.

Cột quan trọng:

- `id`: khóa chính của tổ chức.
- `name`: tên tổ chức.

### `han_hrm.departments`

Lưu phòng ban của từng tổ chức.

Cột quan trọng:

- `id`: khóa chính phòng ban.
- `org_id`: liên kết sang `organizations.id`.
- `name`: tên phòng ban.
- `approval_code_leave`: approval code cho đơn nghỉ phép.
- `approval_code_correction`: approval code cho đơn sửa giờ.
- `lark_department_id`: department id trên Lark.

### `han_hrm.users`

Lưu nhân sự.

Cột quan trọng:

- `id`: khóa chính user.
- `org_id`: tổ chức của user.
- `department_id`: liên kết sang `departments.id`.
- `union_id`, `user_id`, `open_id`: các định danh Lark.
- `name`: tên nhân sự.

### `han_hrm.apps`

Lưu app Lark theo từng tổ chức.

Cột quan trọng:

- `id`: khóa chính app.
- `org_id`: liên kết sang `organizations.id`.
- `type`: loại app, ví dụ `attendance` hoặc `assistant`.
- `app_id`: Lark app id.
- `app_secret`: Lark app secret.

`sync-attendance.js` và `sync-correction-records.js` đang lấy cấu hình phòng ban/app bằng query trực tiếp:

```sql
SELECT DISTINCT ON (d.id)
  d.name AS ten_phong_ban,
  d.lark_department_id AS id_phongban,
  d.approval_code_leave,
  d.approval_code_correction,
  a.app_id AS lark_app_id,
  a.app_secret AS lark_app_secret
FROM han_hrm.users u
JOIN han_hrm.departments d ON d.id = u.department_id
JOIN han_hrm.apps a ON a.org_id = d.org_id AND a.type = 'attendance'
WHERE u.department_id IS NOT NULL
ORDER BY d.id
```

## Logic cần lưu ý

- Attendance upsert theo `Id` và `hash`.
- Một số field chấm công được khóa update nếu đã có giá trị để tránh đè lên dữ liệu sửa tay/correction.
- Riêng `Check in result(TH)` và `Check out result(TH)` được phép đổi sang `Normal` nếu giá trị cũ không phải `NoNeedCheck`.
- Các field phút đi muộn/về sớm được phép cập nhật từ rỗng hoặc `0` lên số dương nếu result cũ tương ứng không phải `Normal` hoặc `NoNeedCheck`.
- Correction chỉ được apply vào attendance khi `Status = Approved`.
- Correction match attendance bằng `id_lookup_correction`.
