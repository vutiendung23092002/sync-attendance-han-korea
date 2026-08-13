# Áp dụng phiếu sửa giờ vào chấm công

Entry point: `check-correction-status.js`.

## 1. Vai trò

Script không gọi Approval API. Nó đọc hai bảng trong LarkBase:

- Bảng attendance theo `TABLE_ATTENDANCE_ID`.
- Bảng correction theo `TABLE_CORECTION_ID`.

Sau đó script ghép record và cập nhật trực tiếp các field chấm công.

## 2. Khoảng ngày mặc định

- Trước ngày mùng 8: từ 30 ngày trước đến hôm nay.
- Từ mùng 8 trở đi: từ ngày đầu tháng đến hôm nay.
- Range tính theo `Asia/Ho_Chi_Minh`.
- Khi tìm record Lark, khoảng timestamp được nới thêm một ngày ở hai đầu.

Mục đích của `getFromDateSmart` là vẫn nhìn thấy correction cuối tháng trước trong những ngày đầu tháng mới.

## 3. Điều kiện match

Script tạo map correction theo `id_lookup_correction`:

```text
user_id + "_" + YYYYMMDD
```

Chỉ correction có `Status` đúng bằng `Approved` được đưa vào map. Correction Pending, Rejected hoặc trạng thái khác bị bỏ qua.

Một attendance có thể match nhiều correction trong cùng ngày. Script duyệt theo thứ tự record trả về; nếu có nhiều correction cùng sửa một phía, correction duyệt sau sẽ ghi đè payload của correction trước. Hiện chưa sort theo thời gian hoặc ưu tiên approval mới nhất.

## 4. Bảo vệ dữ liệu đã xử lý tay

### Check-in được coi là đã xử lý tay khi

- Result là `Normal` hoặc `NoNeedCheck`.
- `Số phút đi muộn = 0`.
- `Trước 10p = 0`.
- `Sau 10p = 0`.

Nếu đủ điều kiện, mọi correction `Start time` match record đó bị bỏ qua.

### Check-out được coi là đã xử lý tay khi

- Result là `Normal` hoặc `NoNeedCheck`.
- `Số phút về sớm = 0`.

Nếu đủ điều kiện, mọi correction `End time` bị bỏ qua.

Việc kiểm tra không dựa vào hash; nó đọc trực tiếp giá trị hiện tại trên Lark.

## 5. Áp dụng correction Start time

Original record chứa `start time` thì replenishment được dùng làm check-in mới.

Các bước:

1. Đổi replenishment và shift time thành tổng số phút bằng UTC component của timestamp Lark.
2. Nếu shift nội bộ bằng `01:00` và replenishment từ `05:00` trở đi, thay mốc shift bằng `06:30`. Đây là nhánh xử lý ca chiều trên timeline nội bộ.
3. Tính `late = max(0, replenishment - shift)`.
4. Phân loại:
   - `late = 0` → `Normal`.
   - `1..10` → `Late`.
   - `> 10` → `SeriousLate`.
5. Chuẩn bị update:
   - `Check in time(TH) = Replenishment time`.
   - `Check in result(TH)` theo phân loại.
   - `Số phút đi muộn = late`.
   - `Trước 10p = min(late, 10)`.
   - `Sau 10p = max(0, late - 10)`.

## 6. Áp dụng correction End time

Original record chứa `end time` thì replenishment được dùng làm check-out mới.

Các bước:

1. Đổi replenishment và shift out thành tổng số phút.
2. Nếu shift out nội bộ `>= 10:30` và replenishment `<= 06:30`, thay shift out bằng `05:00`. Đây là nhánh xử lý ca sáng trên timeline nội bộ.
3. Tính `early = max(0, shiftOut - replenishment)`.
4. Chuẩn bị update:
   - `Check out time(TH) = Replenishment time`.
   - `Check out result(TH) = Normal` nếu early bằng 0, ngược lại là `Early`.
   - `Số phút về sớm = early`.

## 7. Correction đáng ngờ đã được ép trước đó

Nếu `sync-correction-records.js` phát hiện giờ vào/ra đáng ngờ, giá trị `Replenishment time` trong bảng correction đã được thay bằng giờ Original. Do đó bước apply dùng giá trị đã được bảo vệ, không dùng giờ nhập nhầm ban đầu.

Giờ nhập ban đầu vẫn còn trong field `Ghi chú` để kiểm tra thủ công.

## 8. Cách update record

Script tạo payload `{ record_id, fields }` và gọi batch update trực tiếp. Nó không đi qua cơ chế `Id/hash` của `syncDataToLarkBaseFilterDate`.

Hệ quả:

- Chỉ các field check-in hoặc check-out liên quan được sửa.
- Field `hash` của attendance **không được cập nhật** sau khi apply correction.
- Lần sync attendance sau sẽ quyết định giữ/ghi đè các field này bằng logic `excludeUpdateField`.
- Không có thao tác tạo attendance mới; nếu không tìm thấy attendance match thì correction không được apply.

## 9. Các trường hợp không update

- Correction chưa `Approved`.
- Thiếu `id_lookup_correction`.
- Không có attendance cùng lookup.
- Original record không chứa `start time` hoặc `end time`.
- Phía check-in/check-out đã được nhận diện là xử lý tay.
- Sau khi duyệt toàn bộ correction không tạo được field update nào.
