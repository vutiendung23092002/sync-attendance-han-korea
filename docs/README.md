# Tài liệu vận hành hệ thống sync attendance

Tài liệu trong thư mục này mô tả hành vi **đang có trong source code**, bao gồm nguồn dữ liệu, cách tạo/cập nhật record, các trường được bảo vệ và lịch chạy GitHub Actions.

## Mục lục

1. [Kiến trúc và nguồn dữ liệu](./01-architecture.md)
2. [Đồng bộ chấm công](./02-attendance-sync.md)
3. [Đồng bộ phiếu sửa giờ](./03-correction-sync.md)
4. [Áp dụng phiếu sửa giờ vào chấm công](./04-correction-apply.md)
5. [Đồng bộ đơn nghỉ phép](./05-leave-sync.md)
6. [Cơ chế tạo mới và cập nhật LarkBase](./06-lark-upsert.md)
7. [GitHub Actions, biến môi trường và vận hành](./07-automation-and-operations.md)
8. [Luồng thêm phòng ban Supabase cũ](./08-legacy-add-department.md)
9. [Bản đồ code và hướng dẫn mở rộng](./09-code-map-and-extension.md)

## Nhìn nhanh các chương trình

| Chương trình | Nguồn | Đích | Chức năng |
| --- | --- | --- | --- |
| `sync-attendance.js` | Lark Attendance API | Bảng chấm công LarkBase | Lấy kết quả chấm công và upsert theo `Id`/`hash` |
| `sync-correction-records.js` | Lark Approval API | Bảng phiếu sửa giờ LarkBase | Lấy đơn sửa giờ, chuẩn hóa và cảnh báo giờ đáng ngờ |
| `check-correction-status.js` | Hai bảng LarkBase | Bảng chấm công LarkBase | Áp dụng phiếu sửa giờ đã `Approved` vào bản ghi chấm công |
| `sync-leave-instances.js` | Lark Approval API | Bảng nghỉ phép LarkBase | Lấy và upsert đơn nghỉ phép |
| `add-department-supabase.js` | Input thủ công | Bảng Supabase cũ | Luồng legacy, không còn cấp cấu hình cho các job sync chính |

## Nguyên tắc quan trọng

- Các job sync **không xóa** record khỏi LarkBase. Chúng chỉ tạo mới hoặc cập nhật.
- Bản ghi được so sánh bằng `Id` và `hash` trong khoảng ngày đang chạy.
- Attendance có nhóm field được bảo vệ để tránh ghi đè dữ liệu đã sửa tay hoặc đã áp dụng correction.
- Correction và leave không cấu hình field bảo vệ; khi hash đổi, toàn bộ field được map có thể được cập nhật.
- DateTime trước khi gửi Lark được chuẩn hóa thành epoch milliseconds để kết quả không phụ thuộc máy chạy ở UTC hay UTC+7.
- `clientAtt` dùng app của từng tổ chức để đọc dữ liệu nguồn; `clientHrm` dùng app trung tâm để ghi LarkBase.
