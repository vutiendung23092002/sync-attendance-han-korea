# Kiến trúc và nguồn dữ liệu

## 1. Mục tiêu hệ thống

Hệ thống gom dữ liệu nhân sự từ nhiều tổ chức Lark về một LarkBase trung tâm. Ba nhóm dữ liệu chính là:

- Kết quả chấm công.
- Phiếu sửa giờ.
- Đơn nghỉ phép.

Phiếu sửa giờ sau khi được đồng bộ vào bảng riêng sẽ được một bước khác kiểm tra trạng thái và áp dụng vào bảng chấm công.

## 2. Sơ đồ tổng thể

```text
han_hrm.users/departments/apps
              |
              | lấy phòng ban, approval code, app_id/app_secret
              v
     clientAtt của từng tổ chức
              |
              +--> Contact API: danh sách nhân sự
              +--> Attendance API: kết quả chấm công
              +--> Approval API: correction và leave
              |
              v
       Formatter + tạo Id/hash
              |
              v
       clientHrm trung tâm
              |
              +--> bảng Attendance
              +--> bảng Correction
              +--> bảng Leave
```

## 3. Cấu hình tổ chức và phòng ban

Nguồn cấu hình hiện tại là PostgreSQL/Supabase schema `han_hrm`.

### Các bảng tham gia

| Bảng | Vai trò |
| --- | --- |
| `han_hrm.organizations` | Tổ chức/công ty |
| `han_hrm.departments` | Phòng ban, Lark department ID và approval code |
| `han_hrm.users` | Nhân sự và quan hệ với phòng ban |
| `han_hrm.apps` | App Lark của từng tổ chức |

Query tại `src/services/hrm/department-configs.js` thực hiện:

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
JOIN han_hrm.apps a
  ON a.org_id = d.org_id
 AND a.type = 'attendance'
WHERE u.department_id IS NOT NULL
ORDER BY d.id;
```

Hệ quả của query:

- Chỉ phòng ban có ít nhất một user liên kết mới được lấy.
- Tổ chức phải có một app với `type = 'attendance'`.
- Query hiện không lọc theo cột trạng thái active/inactive.
- Mỗi phòng ban xuất hiện một lần nhờ `DISTINCT ON (d.id)`.

### Thêm tổ chức hoặc phòng ban mới

Để một phòng ban tham gia các job sync chính, tối thiểu phải có:

1. Organization trong `han_hrm.organizations`.
2. App của organization trong `han_hrm.apps`, với `type = 'attendance'`.
3. Department trong `han_hrm.departments`, có `org_id` và `lark_department_id` đúng.
4. Ít nhất một user trong `han_hrm.users` trỏ tới department.
5. Nếu dùng correction hoặc leave, department phải có `approval_code_correction` hoặc `approval_code_leave` tương ứng.

Không cần thêm credential vào source code hoặc GitHub variables cho từng tổ chức; job đọc chúng từ `han_hrm.apps`.

## 4. Hai loại Lark client

### `clientAtt`

Được tạo từ `lark_app_id/lark_app_secret` lấy theo organization. Client này đọc dữ liệu nằm trong tenant tương ứng:

- `contact.user.findByDepartment`.
- `attendance.userTask.query`.
- `approval.instance.query`.
- `approval.instance.get`.

App phải được cài trong tenant và có đủ quyền Contact, Attendance và Approval cần thiết.

### `clientHrm`

Được tạo từ:

- `LARK_HRM_APP_ID`.
- `LARK_HRM_APP_SECRET`.

Client này làm việc với LarkBase trung tâm: tìm bảng, tìm record, tạo bảng/field và batch create/update record.

## 5. Vòng đời chung của dữ liệu

Mỗi job sync chính đi qua các bước:

1. Xác định `FROM/TO`.
2. Đọc danh sách phòng ban và app từ `han_hrm`.
3. Tạo `clientAtt` cho từng tổ chức/phòng ban.
4. Gọi API nguồn và gom dữ liệu.
5. Format về cấu trúc nội bộ.
6. Tạo `Id`, khóa lookup nghiệp vụ và `hash`.
7. Tạo `clientHrm`.
8. Tìm hoặc tạo bảng đích.
9. Đọc các record Lark trong khoảng ngày.
10. So sánh `Id/hash`.
11. Batch create record mới và batch update record thay đổi.

## 6. Khóa nhận diện

| Loại dữ liệu | `Id` | Lookup phụ |
| --- | --- | --- |
| Attendance | `${user_id}_${result_id}` | `${user_id}_${YYYYMMDD}` |
| Correction | `${approval_code}_${serial_number}` | `${user_id}_${YYYYMMDD}` |
| Leave | `${approval_code}_${serial_number}` | Không có |

`id_lookup_correction` nối attendance và correction theo cùng user và ngày xảy ra lỗi.

## 7. Cách xử lý lỗi song song

Attendance dùng `Promise.allSettled` theo phòng ban. Correction và leave dùng thêm `p-limit`:

- Tối đa 5 phòng ban chạy đồng thời.
- Tối đa 5 request lấy chi tiết approval chạy đồng thời.

Một phòng ban hoặc một request detail lỗi sẽ bị loại khỏi kết quả chung, các phòng ban khác vẫn tiếp tục. Log hiện có tổng số thành công/thất bại ở attendance, nhưng correction/leave chủ yếu lọc phần `fulfilled` nên cần xem log để phát hiện dữ liệu bị thiếu.

## 8. Những gì hệ thống không làm

- Không xóa record Lark khi record nguồn biến mất.
- Không cưỡng chế unique cho field `Id` ở phía Lark.
- Không tự sửa schema của bảng đã tồn tại, ngoại trừ field `Ghi chú` của bảng correction.
- Không tự đồng bộ danh sách `han_hrm.users/departments/apps`; hệ thống chỉ đọc các bảng đó.
