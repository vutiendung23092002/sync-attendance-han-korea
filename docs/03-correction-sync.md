# Đồng bộ phiếu sửa giờ

Entry point: `sync-correction-records.js`.

Job này chỉ đưa approval correction vào bảng correction. Việc áp dụng correction sang bảng attendance nằm ở `check-correction-status.js` và được mô tả trong tài liệu kế tiếp.

## 1. Khoảng ngày

Nếu không truyền `FROM/TO`, range giống attendance:

- Từ đầu tháng đến hôm nay theo giờ Việt Nam.
- Tháng 31 ngày và hôm nay sau mùng 1: bắt đầu từ mùng 2.
- `FROM` gắn `00:00:00`, `TO` gắn `23:59:59`.

## 2. Luồng lấy approval

Với mỗi department:

1. Bỏ qua nếu không có `approval_code_correction`.
2. Tạo `clientAtt` bằng app của organization.
3. Gọi `approval.instance.query` với approval code và trạng thái `ALL`.
4. Với từng instance, gọi `approval.instance.get` để lấy form đầy đủ.
5. Gắn `department_name` vào detail.
6. Gom detail thành một mảng chung.

Giới hạn đồng thời là 5 department và 5 request detail.

Lưu ý hiện trạng: `getListInstances` đọc `page_token` từ response nhưng chưa truyền token đó vào request kế tiếp. Nếu API trả `page_token`, vòng lặp có thể gọi lại trang đầu liên tục thay vì sang trang tiếp theo.

## 3. File log local

Khi lấy được dữ liệu, job ghi:

- `logs/correctionV2.json`: detail thô.
- `logs/correctionV2-Formatted.json`: dữ liệu sau format.

Thư mục `logs/` bị Git ignore.

## 4. Format single và batch remedy

Formatter hỗ trợ hai dạng:

- Single remedy: đọc `widgetRemedyGroupV2RemedyDate/Time/ClockTime`.
- Batch remedy: duyệt `widgetRemedyGroupV2BatchDetail`.

Các field chung gồm requester, phòng ban, trạng thái, thời gian submit/update, approval step cuối, handler cuối, original record, ngày lỗi, giờ bổ sung và lý do.

Status được chuẩn hóa viết hoa chữ đầu, ví dụ `approved` thành `Approved`.

### Id và lookup

```text
Id                   = approval_code + "_" + serial_number
id_lookup_correction = user_id + "_" + YYYYMMDD(date_of_error)
```

Với batch remedy, mọi detail trong cùng approval hiện dùng cùng `Id`. Nếu một approval batch có nhiều detail, có thể xuất hiện nhiều record nguồn trùng `Id`; đây là giới hạn hiện tại cần lưu ý.

## 5. Chặn trường hợp nghi sửa nhầm giờ vào/ra

Formatter đọc loại và giờ gốc từ `Original record`, ví dụ `Start time 08:00` hoặc `End time 17:30`.

### Nghi sửa nhầm Start thành giờ ra

Correction bị coi là đáng ngờ khi đồng thời:

- Original là `Start time`.
- Giờ Start gốc nhỏ hơn `09:00`.
- Replenishment time lớn hơn `17:00`.

Khi đó:

- `Replenishment time` được thay bằng giờ Start trong Original record, trên `Date of error`.
- Field `Ghi chú` nhận nội dung:

```text
Nghi ngờ sửa nhầm giờ ra, Replenishment time gốc: YYYY/MM/DD HH:mm
```

### Nghi sửa nhầm End thành giờ vào

Correction bị coi là đáng ngờ khi đồng thời:

- Original là `End time`.
- Giờ End gốc lớn hơn `17:00`.
- Replenishment time nhỏ hơn `09:00`.

Khi đó replenishment được đưa về giờ End gốc và ghi chú là:

```text
Nghi ngờ sửa nhầm giờ vào, Replenishment time gốc: YYYY/MM/DD HH:mm
```

### Biên và trường hợp giữ nguyên

- Đúng `17:00` cho Start không bị ép vì điều kiện là `> 17:00`.
- Đúng `09:00` cho End không bị ép vì điều kiện là `< 09:00`.
- Start gốc từ `09:00` trở đi không bị ép.
- End gốc từ `17:00` trở xuống không bị ép.
- Không parse được Original, replenishment hoặc Date of error thì giữ nguyên.
- Logic dùng `Asia/Ho_Chi_Minh` khi đọc timestamp có timezone.

Mục đích của điều kiện giờ gốc là tránh ép nhầm các ca đặc biệt hoặc ca đêm chỉ dựa trên replenishment.

## 6. Field `Ghi chú`

Trước khi upsert, job:

1. Tìm bảng correction theo tên.
2. Nếu bảng đã tồn tại, phân trang danh sách field để tìm `Ghi chú`.
3. Nếu chưa có, tạo field Text `Ghi chú`.
4. Có guard chống page token thiếu hoặc lặp vô hạn.

Nếu bảng correction chưa tồn tại, bước này được bỏ qua; bộ máy sync sau đó sẽ tạo bảng với schema từ field map, trong đó đã có `Ghi chú`.

## 7. Tạo mới và cập nhật correction

Correction dùng bộ máy upsert chung với:

- `idLabel = Id`.
- Filter theo `Submitted at`.
- Không có `excludeUpdateField`.

Hành vi:

- `Id` chưa tồn tại: tạo record.
- `Id` tồn tại, hash khác: update các field được map.
- `Id` tồn tại, hash giống: bỏ qua.
- Status approval thay đổi sẽ làm hash đổi và record được update.
- Giá trị rỗng có thể được map thành `null` và xóa giá trị field cũ khi hash đổi, vì correction không có field bảo vệ.
- Không xóa record correction khi approval nguồn biến mất.

## 8. Quan hệ với bước apply

Sync correction lưu cả approval chưa approved vì query dùng `instance_status = ALL`. Bước apply chỉ chọn record có `Status = Approved`, nên record Pending/Rejected vẫn nằm trong bảng correction nhưng không sửa attendance.
