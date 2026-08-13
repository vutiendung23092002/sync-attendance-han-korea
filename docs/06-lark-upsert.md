# Cơ chế tạo mới và cập nhật LarkBase

Hàm trung tâm: `syncDataToLarkBaseFilterDate` trong `src/services/larkbase/sync-to-lark.js`.

## 1. Input

Hàm nhận:

- `records` đã format hoặc `selectFn` để tự lấy source.
- `tableName`.
- `fieldMap`: key nội bộ → tên field Lark.
- `typeMap`: kiểu Text/Number/DateTime...
- `uiType`: dùng khi tạo bảng mới.
- `idLabel`: field nhận diện record, các job hiện dùng `Id`.
- `excludeUpdateField`: field cần bảo vệ khi update.
- `filterFieldName`, `startDate`, `endDate`: khoảng tìm record Lark hiện có.

## 2. Tìm hoặc tạo bảng

1. Gọi `getListTable` để lấy tối đa 100 bảng.
2. Tìm bảng có tên đúng bằng `tableName`.
3. Nếu có, dùng `table_id` hiện tại.
4. Nếu chưa có, build schema từ `fieldMap/typeMap/uiType` và tạo bảng mới.

Đối với bảng đã tồn tại, bộ máy chung không tự thêm field còn thiếu. Riêng correction có bước `ensureLarkBaseField` cho field `Ghi chú` trước khi gọi upsert.

## 3. Tìm record hiện có

Record được search bằng filter:

```text
filterFieldName > startDate
AND
filterFieldName < endDate
```

Caller thường nới `startDate/endDate` thêm một ngày để bao phủ biên.

Chỉ record nằm trong kết quả search mới tham gia diff. Record cùng `Id` nhưng nằm ngoài range sẽ không được nhận ra và có thể dẫn tới create trùng.

## 4. So sánh bằng Id và hash

Từ record Lark, code chỉ rút ra:

```text
record_id, Id, hash
```

Quy tắc `diffRecords`:

| Trạng thái | Kết quả |
| --- | --- |
| `Id` chưa có trong Lark | `toInsert` |
| `Id` đã có, hash khác | `toUpdate` |
| `Id` đã có, hash giống | Bỏ qua |

Hash nguồn là SHA-256 deterministic của object đã format. Key được sort trước khi hash.

### Ý nghĩa khi sửa tay trên Lark

Code không tính lại hash từ toàn bộ field Lark. Nó chỉ đọc giá trị field `hash` đang lưu.

Vì vậy:

- Sửa một field nhưng giữ nguyên hash: bộ diff vẫn coi record không đổi.
- Xóa nhầm result/phút nhưng hash không đổi: chỉ được sửa lại nếu ngoại lệ attendance kích hoạt.
- Tự sửa cả field `hash`: lần sync sau gần như chắc chắn xem record là thay đổi và update.

## 5. Chuẩn hóa field trước khi gửi

`mapFieldsToLark` duyệt field map và chuyển kiểu:

- Text: chuyển thành string.
- Number: chuyển thành number; không hợp lệ thành `null`.
- DateTime: chuyển thành epoch milliseconds.
- Boolean: chuyển bằng `Boolean(value)`.
- Person: chuyển thành mảng `{ id }`.
- Object ở field thường: JSON stringify.

`undefined/null` không được đưa vào payload. Chuỗi rỗng được normalize thành `null`, nên có thể xóa dữ liệu cũ nếu field đó được phép update.

### DateTime và timezone

- Chuỗi DateTime không có `Z` hoặc offset được coi là UTC.
- Chuỗi có `Z`, `+07:00` hoặc offset khác giữ đúng instant đã khai báo.
- Epoch gửi lên Lark giống nhau dù Node chạy trên local UTC+7 hay GitHub runner UTC.
- Workflow vẫn đặt `TZ=Asia/Ho_Chi_Minh` để các đoạn code khác có hành vi nhất quán.

## 6. Tạo mới

Một source record được create khi:

- Nằm trong `toUpsert`.
- Không có `record_id` Lark tương ứng với `Id`.

Create luôn map toàn bộ field hiện có. `excludeUpdateField` không áp dụng cho create.

## 7. Cập nhật

Một source record có `record_id` được xem xét update. Nếu hash khác, payload update được tạo. Nếu hash giống, payload chỉ được tạo khi có ngoại lệ attendance cho field bảo vệ.

### Không có field bảo vệ

Correction và leave truyền `[]`. Khi hash đổi, toàn bộ field được map có thể được gửi lại.

### Có field bảo vệ

Attendance truyền danh sách time/result/phút. Với từng field:

- Field cũ có dữ liệu và không có ngoại lệ → xóa field khỏi payload.
- Field cũ trống → giữ field trong payload.
- Có ngoại lệ resolved/placeholder/check-in alignment → giữ field và có thể kích hoạt update dù hash giống.

Chi tiết từng ngoại lệ nằm trong [Đồng bộ chấm công](./02-attendance-sync.md).

## 8. Batch API

Create và update được chia chunk tối đa 500 record:

- `batchCreate` cho record mới.
- `batchUpdate` cho record hiện có.
- Chờ 100 ms giữa các batch cùng loại.
- Create và update được khởi chạy song song bằng `Promise.all`.

Hiện `createLarkRecords/updateLarkRecords` catch lỗi bên trong từng batch, log lỗi rồi tiếp tục và không throw lại. Vì vậy job có thể kết thúc với trạng thái thành công dù một batch Lark thất bại. Khi vận hành cần đối chiếu log `đã tạo X/Y` và `đã update X/Y`, không chỉ nhìn màu xanh của workflow.

## 9. Không có delete

`diffRecords` chỉ tạo `toInsert/toUpdate`; không có `toDelete`. Record chỉ tồn tại trên Lark sẽ được giữ nguyên.

## 10. Quy trình sửa record an toàn

### Attendance

- Nếu muốn đánh dấu đã xử lý: đặt result `Normal` hoặc `NoNeedCheck` và tất cả phút tương ứng bằng 0.
- Không sửa `hash` nếu muốn cơ chế bảo vệ attendance giữ dữ liệu đã xử lý.
- Nếu muốn dữ liệu API ghi lại đầy đủ, cần hiểu field bảo vệ; chỉ đổi hash chưa chắc ghi đè được time/result/phút đã có.

### Correction và leave

- Sửa tay có thể tồn tại cho đến khi hash nguồn đổi.
- Khi approval nguồn thay đổi, upsert có thể ghi đè lại toàn bộ field được map.
- Không nên sửa field `Id`, `hash` hoặc lookup nếu không có mục đích khôi phục cụ thể.
