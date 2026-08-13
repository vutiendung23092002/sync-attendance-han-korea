# Đồng bộ chấm công

Entry point: `sync-attendance.js`.

## 1. Khoảng ngày

Nếu có `FROM/TO`, script dùng đúng giá trị đó. Nếu không có:

- `TO`: hôm nay theo `Asia/Ho_Chi_Minh`.
- `FROM`: đầu tháng.
- Tháng có 31 ngày và hôm nay sau mùng 1: bắt đầu từ mùng 2 để không vượt giới hạn tối đa 30 ngày của Attendance API.
- Riêng ngày mùng 1: vẫn bắt đầu từ mùng 1.

Ví dụ ngày `2026/08/13` thì range tự động là `2026/08/02` đến `2026/08/13`.

## 2. Luồng lấy dữ liệu

Với mỗi department lấy từ `han_hrm`:

1. Tạo `clientAtt` bằng app của organization.
2. Gọi `contact.user.findByDepartment` và tự phân trang, mỗi trang 50 user.
3. Lấy toàn bộ `user_id` của phòng ban.
4. Gọi `attendance.userTask.query` với `check_date_from/check_date_to` dạng `YYYYMMDD`.
5. Đọc `data.user_task_results`.
6. Format record và gắn tên phòng ban.

Nếu phòng ban không có user, phòng ban đó trả về mảng rỗng. Source hiện chỉ dùng `item.records[0]` của mỗi attendance result.

## 3. Chuẩn hóa một record

Các field chính:

| Field nội bộ | Field Lark |
| --- | --- |
| `day` | `Date(TH)` |
| `user_id` | `User id(TH)` |
| `employee_name` | `Tên nhân viên` |
| `department_name` | `Tên phòng ban` |
| `check_in_time` | `Check in time(TH)` |
| `check_in_shift_time` | `Check in shift time(TH)` |
| `check_in_result` | `Check in result(TH)` |
| `check_out_time` | `Check out time(TH)` |
| `check_out_shift_time` | `Check out shift time(TH)` |
| `check_out_result` | `Check out result(TH)` |
| `minutes_late` | `Số phút đi muộn` |
| `minutes_late_after_10m` | `Sau 10p` |
| `minutes_late_before_10m` | `Trước 10p` |
| `minutes_early` | `Số phút về sớm` |

Result `todo` được đổi thành chuỗi rỗng.

### Timeline nội bộ

Timestamp giây từ Attendance API được format bằng các UTC component. Chuỗi không timezone sau đó được coi là UTC khi map sang epoch milliseconds. Lark hiển thị epoch đó theo timezone Việt Nam.

Vì formatter tính số phút trước khi Lark hiển thị `+7`, các mốc nội bộ trông thấp hơn giờ Việt Nam 7 tiếng:

- 05:30 nội bộ tương ứng 12:30 giờ Việt Nam, dùng để phân biệt ca sáng/chiều.
- 06:30 nội bộ tương ứng 13:30, mốc bắt đầu ca chiều.
- 05:00 nội bộ tương ứng 12:00, mốc kết thúc ca sáng.
- 10:30 nội bộ tương ứng 17:30, mốc kết thúc ca chiều.

### Tính đi muộn

- Có check-in và giờ nội bộ `> 05:30`: `late = max(0, checkIn - 06:30)`.
- Có check-in và giờ nội bộ `<= 05:30`: `late = max(0, checkIn - checkInShift)`.
- Không có check-in: `late = 0`.
- Result mới là `Normal` hoặc `NoNeedCheck`: ép `late = 0`.
- `Trước 10p = min(late, 10)`.
- `Sau 10p = max(0, late - 10)`.

### Tính về sớm

- Có check-out và giờ nội bộ `> 05:30`: `early = max(0, 10:30 - checkOut)`.
- Có check-out và giờ nội bộ `<= 05:30`: `early = max(0, 05:00 - checkOut)`.
- Không có check-out: `early = 0`.
- Result mới là `Normal` hoặc `NoNeedCheck`: ép `early = 0`.

## 4. Id, lookup và hash

```text
Id                   = user_id + "_" + result_id
id_lookup_correction = user_id + "_" + YYYYMMDD
```

Sau khi toàn bộ field được format, object được hash SHA-256. Hash dùng để quyết định record có cần update hay không.

## 5. Tạo record mới

Nếu `Id` nguồn chưa tồn tại trong tập record Lark đã tìm thấy:

- Toàn bộ field có trong field map được chuẩn hóa.
- Record được đưa vào batch create.
- Các field attendance được bảo vệ chỉ ảnh hưởng update, không cản tạo mới.

Do Lark không có unique constraint cho field `Id`, nếu record cũ nằm ngoài khoảng filter hoặc có duplicate sẵn thì hệ thống vẫn có khả năng tạo thêm record trùng `Id`.

## 6. Cập nhật record hiện có

Attendance truyền nhóm `excludeUpdateField` sau:

- `Check in time(TH)`.
- `Check out time(TH)`.
- `Check in result(TH)`.
- `Check out result(TH)`.
- `Số phút đi muộn`.
- `Sau 10p`.
- `Trước 10p`.
- `Số phút về sớm`.

Mục đích là bảo vệ dữ liệu đã sửa tay hoặc đã được correction áp dụng.

### Quy tắc chung

- Field không nằm trong danh sách bảo vệ: được cập nhật khi hash nguồn khác hash trên Lark.
- Field bảo vệ đang có dữ liệu cũ: mặc định bị loại khỏi payload update.
- Field bảo vệ cũ đang trống: không bị loại, nên có thể được điền khi record được update.
- Hash giống nhau: thông thường không update; các ngoại lệ attendance dưới đây vẫn có thể kích hoạt update.

### Ngoại lệ 1: result mới đã được xử lý

`Check in/out result(TH)` mới được phép ghi đè bất kể result cũ khi:

- Result mới là `Normal` hoặc `NoNeedCheck`.
- Toàn bộ field phút mới của phía tương ứng bằng `0`.

Check-in yêu cầu `Số phút đi muộn`, `Trước 10p`, `Sau 10p` đều bằng 0. Check-out yêu cầu `Số phút về sớm` bằng 0.

### Ngoại lệ 2: reset phút về 0

Field phút được phép ghi `0` đè lên giá trị cũ khi result mới tương ứng là `Normal` hoặc `NoNeedCheck`.

### Ngoại lệ 3: placeholder chưa chấm công nhận dữ liệu mới

Field phút cũ rỗng hoặc bằng `0` được phép nhận số dương khi:

- Result cũ tương ứng đang trống.
- Result mới có giá trị.
- Result mới không phải `Normal/NoNeedCheck`.
- Số phút mới lớn hơn `0`.

Quy tắc này xử lý các ngày tương lai Lark tạo placeholder: giờ/result trống nhưng phút bằng 0. Khi nhân sự thực sự chấm công muộn hoặc về sớm, dữ liệu mới vẫn điền được dù giá trị phút cũ là 0.

### Ngoại lệ 4: đưa check-in về giờ ca

Khi API trả check-in mới là trạng thái đã xử lý (`Normal/NoNeedCheck`, phút mới đều 0):

- Nếu `Check in time(TH)` cũ khác `Check in shift time(TH)`, cho phép update.
- Giá trị ghi vào `Check in time(TH)` được ép bằng `Check in shift time(TH)`, không dùng check-in time mới từ API.
- Nếu check-in cũ đã bằng shift time, field time được giữ nguyên.
- Nếu check-in cũ đang trống hoặc shift mới không hợp lệ, ngoại lệ này không kích hoạt.

Hiện chưa có ngoại lệ tương tự để ép `Check out time(TH)` về shift time.

## 7. Ma trận hành vi quan trọng

| Dữ liệu cũ | Dữ liệu API mới | Hành vi |
| --- | --- | --- |
| Result bất kỳ, phút bất kỳ | `Normal/NoNeedCheck`, phút = 0 | Result và phút được phép ghi đè |
| Check-in cũ khác shift | Check-in mới resolved | Check-in được đưa về shift time |
| Result cũ trống, phút cũ 0 | Result mới `Late/SeriousLate`, phút > 0 | Điền result/time/phút mới |
| Result cũ `Normal/NoNeedCheck`, phút 0 | Result mới bất thường, phút > 0 | Giữ result/time/phút được bảo vệ |
| Result cũ bất thường, phút cũ > 0 | Result mới bất thường khác | Các field bảo vệ có dữ liệu cũ được giữ |
| Field bảo vệ cũ trống | Hash đổi | Field mới có thể được điền |
| Hash không đổi, không có ngoại lệ | Dữ liệu Lark bị xóa/sửa tay | Không tự khôi phục field đó |

## 8. Phạm vi đọc record Lark

Trước khi diff, code tìm record Lark theo `Date(TH)` với khoảng được nới thêm một ngày ở hai đầu. Filter Lark dùng `isGreater` và `isLess`, vì vậy khoảng nới giúp không mất record ở biên ngày.

## 9. Không có thao tác xóa

Nếu một attendance result không còn xuất hiện trong API, job không xóa record cũ khỏi Lark. Việc xóa hoặc archive cần thực hiện bằng quy trình khác.
