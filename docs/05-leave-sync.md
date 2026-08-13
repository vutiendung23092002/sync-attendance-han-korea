# Đồng bộ đơn nghỉ phép

Entry point: `sync-leave-instances.js`.

## 1. Khoảng ngày

Nếu không truyền `FROM/TO`:

- `FROM`: 29 ngày trước, lúc `00:00:00`.
- `TO`: hôm nay, lúc `23:59:59`.
- Ngày được tính theo `Asia/Ho_Chi_Minh`.

Khoảng này tạo tối đa 30 ngày tính cả hai đầu.

## 2. Luồng lấy dữ liệu

Với mỗi department:

1. Bỏ qua nếu thiếu `approval_code_leave`.
2. Tạo `clientAtt` theo organization.
3. Query approval instance với trạng thái `ALL`.
4. Lấy detail từng instance.
5. Gắn tên phòng ban.
6. Format và gom dữ liệu.

Giới hạn đồng thời là 5 department và 5 detail request.

Luồng leave dùng chung `getListInstances` với correction. Page token đọc từ response chưa được truyền vào request tiếp theo, nên nếu API có nhiều trang thì vòng lặp có thể gọi lại trang đầu liên tục.

## 3. Format record

Formatter đọc form approval đầu tiên và map:

| Nguồn | Field Lark |
| --- | --- |
| Requester | `User Id Requester` |
| Form name | `Leave type` |
| Form reason | `Reason for leave` |
| Form start/end | `Start time` / `End time` |
| Form interval/unit | `Duration` / `Leave unit` |
| Approval status | `Status` |
| Task cuối | `Approval steps`, `Handler id` |
| Instance start/end | `Submitted at`, `Completed at` |

Status được viết hoa chữ đầu. `end_time` bằng `0` được format thành rỗng.

`Id` được tạo bằng:

```text
approval_code + "_" + serial_number
```

Sau đó formatter tạo hash SHA-256 cho toàn bộ object.

## 4. Tạo và cập nhật

Leave dùng upsert chung:

- Filter record Lark theo `Submitted at`.
- `Id` mới → tạo record.
- `Id` cũ và hash đổi → update.
- Hash giống → bỏ qua.
- Không có field bảo vệ.
- Không xóa record khi đơn nguồn biến mất.

Vì không có field bảo vệ, sửa tay trên Lark có thể bị ghi đè ở lần source hash thay đổi tiếp theo. Nếu source hash vẫn giống hash lưu trên Lark, sửa tay không tự bị khôi phục vì bộ diff chỉ nhìn field `hash`, không tính lại hash từ các field Lark.

## 5. File log local

- `logs/instanceD.json`: detail thô.
- `logs/instanceF.json`: dữ liệu đã format.

## 6. Trạng thái approval

Query lấy `ALL`, do đó Pending, Approved, Rejected... đều có thể nằm trong bảng. Job không áp dụng nghiệp vụ gì thêm cho leave; nó chỉ phản ánh trạng thái và nội dung approval hiện tại.
