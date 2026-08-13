# Bản đồ code và hướng dẫn mở rộng

Tài liệu này giúp tìm đúng file khi cần sửa logic hoặc thêm field/chức năng mới.

## 1. Entrypoint

| File | Hàm/luồng chính | Vai trò |
| --- | --- | --- |
| `sync-attendance.js` | `syncAttendance` | Điều phối lấy attendance theo phòng ban và upsert |
| `sync-correction-records.js` | `listCorrectionInstances` | Điều phối lấy correction approval và upsert |
| `check-correction-status.js` | `checkCorrectionStatus` | Ghép correction Approved với attendance và batch update |
| `sync-leave-instances.js` | `listLeaveInstances` | Điều phối lấy leave approval và upsert |
| `add-department-supabase.js` | `addDepartmentClient` | Upsert bảng cấu hình Supabase legacy |

Các hàm điều phối này không export; chạy file bằng Node sẽ thực thi ngay phần cuối file.

## 2. Core và cấu hình

| File/hàm | Công dụng |
| --- | --- |
| `src/config/env.js` | Nạp `.env`, gom Lark Base, app HRM, database và AES config |
| `createLarkClient` | Tạo Lark SDK client có token cache |
| `getPostgresConnectionInfo` | Chọn connection string theo thứ tự `DATABASE_URL`, `SUPABASE_DB_URL`, `POSTGRES_URL` |
| `queryPostgres` | Query PostgreSQL bằng pool tối đa 1 connection |
| `closePostgresPool` | Đóng pool sau job |
| `getAttendanceDepartmentConfigs` | Join `han_hrm.users/departments/apps` để lấy cấu hình sync |

## 3. Hàm đọc Lark nguồn

Nằm chủ yếu trong `src/services/larkbase/attendance.js`:

| Hàm | API | Được dùng bởi |
| --- | --- | --- |
| `getEmployee` | Contact: user theo department | Attendance |
| `getAttendanceResult` | Attendance user task result | Attendance |
| `fetchAttendanceForDepartment` | Kết hợp hai hàm trên và format | Attendance |
| `getListInstances` | Approval instance query | Correction, leave |
| `getdetailsInstance` | Approval instance get | Correction, leave |
| `getCorrectionRecords` | Attendance remedy query | Hiện không được entrypoint chính gọi |

## 4. Formatter

| File/hàm | Input | Output |
| --- | --- | --- |
| `formatAttendanceResults` | `user_task_results` | Attendance nội bộ + phút muộn/sớm + Id/hash |
| `formatCorrectionRecordsV2` | Approval detail | Một hoặc nhiều correction record + Id/hash |
| `formatLeaveInstances` | Approval detail | Leave record + Id/hash |

Các formatter phải hoàn tất mọi field nghiệp vụ trước khi gọi `generateHash`. Không sửa object sau khi tạo hash nếu field đó cần tham gia phát hiện thay đổi.

## 5. Field map

`src/utils/larkbase/field-maps.js` có ba bộ map:

- `*_FIELD_MAP`: key JavaScript → tên cột Lark.
- `*_TYPE_MAP`: type số của Lark, ví dụ Text `1`, Number `2`, DateTime `5`.
- `*_UI_TYPE_MAP`: metadata dùng khi tạo bảng mới.

### Thêm một field mới

Ví dụ thêm field attendance `source_note`:

1. Thêm giá trị `source_note` vào object trong `formatAttendanceResults`.
2. Thêm `source_note: "Source note"` vào `ATTENDANCE_FIELD_MAP`.
3. Thêm type tương ứng vào `ATTENDANCE_TYPE_MAP`.
4. Thêm UI type vào `ATTENDANCE_UI_TYPE_MAP`.
5. Xác định field có cần nằm trong `excludeUpdateField` hay không.
6. Nếu bảng Lark đã tồn tại, tạo cột thủ công hoặc bổ sung bước `ensureLarkBaseField`; bộ máy chung không tự thêm field cho bảng cũ.
7. Chạy test create record mới và update record cũ.

Nếu quên bước 1, map không có giá trị để gửi. Nếu quên type, mapper mặc định Text. Nếu chỉ sửa map nhưng bảng cũ chưa có cột, Lark API có thể từ chối payload.

## 6. Helper Id/hash/diff

| Hàm | Vai trò |
| --- | --- |
| `generateHash` | Sort key, chuẩn hóa value rồi SHA-256 object |
| `extractLarkIdHash` | Đọc `Id/hash/record_id` từ kiểu dữ liệu Lark |
| `diffRecords` | Chia source thành insert/update theo `Id/hash` |
| `mapFieldsToLark` | Đổi key nội bộ sang tên field và chuẩn hóa type |

Khi thay đổi công thức `Id`, cần migration record cũ hoặc chấp nhận job tạo record mới. Khi thêm field vào formatter, hash sẽ đổi và toàn bộ record trong range có thể được update một lần.

## 7. Helper bảng và record Lark

| Hàm | Vai trò |
| --- | --- |
| `getListTable` | Lấy danh sách bảng trong Base |
| `ensureLarkBaseTable` | Tạo bảng cùng schema nếu chưa có |
| `ensureLarkBaseField` | Tìm/tạo một field riêng lẻ; hiện dùng cho `Ghi chú` |
| `searchLarkRecordsFilterDate` | Tìm record theo một field ngày và tự phân trang |
| `createLarkRecords` | Batch create, chunk 500 |
| `updateLarkRecords` | Batch update, chunk 500 |
| `syncDataToLarkBaseFilterDate` | Ghép toàn bộ quy trình table → search → diff → create/update |

## 8. Helper thời gian đang ảnh hưởng nghiệp vụ

| Hàm | Công dụng |
| --- | --- |
| `getTodayYmd` | Ngày Việt Nam, có thể lùi N ngày |
| `getLarkSyncStartOfMonthYmd` | Đầu tháng; mùng 2 trong tháng 31 ngày |
| `getFromDateSmart` | Range linh hoạt cho check correction |
| `vnTimeToUTCTimestampMiliseconds` | Parse chuỗi range thành epoch cho API/filter hiện tại |
| `vnLocalToUtcISOString` | Gắn `+07:00` cho giờ địa phương Việt Nam rồi đổi sang ISO UTC |
| `utcISOStringToYmd` | Đổi instant UTC thành ngày Việt Nam |
| `utcTimestampSToVn`, `utcTimestampMsToVn` | Format timestamp bằng UTC component theo timeline hiện tại |

Không thay một helper parse thời gian dùng chung nếu chưa test cả attendance, correction, leave và local/GitHub; cùng một tên “VN” hiện có thể biểu diễn timeline nội bộ chứ không luôn cộng thêm 7 giờ.

## 9. Thêm một loại dữ liệu sync mới

Quy trình khuyến nghị:

1. Xác định API nguồn và app nào có quyền đọc.
2. Viết service chỉ làm nhiệm vụ gọi API/phân trang.
3. Viết formatter tạo object phẳng, `Id` ổn định và `hash` cuối cùng.
4. Khai báo đủ ba field map.
5. Chọn field DateTime dùng để filter record Lark hiện có.
6. Gọi `syncDataToLarkBaseFilterDate`.
7. Quyết định field nào phải bảo vệ khi sửa tay.
8. Thêm workflow và đặt `TZ=Asia/Ho_Chi_Minh`.
9. Tách scheduled input khỏi manual input; scheduled nên để script tự tính range.
10. Test lần đầu (create), lần hai không đổi (0 update), rồi thay source (update).

## 10. Thay đổi quy tắc update attendance

Các hàm cần xem trong `sync-to-lark.js`:

- `canUpdateResultToResolved`: cho phép result Normal/NoNeedCheck.
- `canResetMinuteFieldForResolvedResult`: reset phút về 0.
- `canFillMinuteFieldForPendingResult`: placeholder nhận số phút mới.
- `canAlignCheckInTimeWithShift`: đưa check-in về shift time.
- `shouldAllowExcludedFieldUpdate`: tổng hợp các ngoại lệ.

Khi thêm một ngoại lệ mới, cần kiểm tra ít nhất:

- Giá trị cũ trống, 0 và số dương.
- Result cũ trống, Normal, NoNeedCheck và bất thường.
- Hash giống và hash khác.
- Check-in và check-out độc lập.
- Ngày tương lai placeholder và ngày đã có chấm công.
- Dữ liệu đã sửa tay không bị ghi đè ngoài ý muốn.

## 11. Checklist trước khi merge thay đổi

- `node --check` tất cả file JavaScript đã sửa.
- `git diff --check` không có lỗi whitespace.
- Test DateTime với `TZ=UTC` và `TZ=Asia/Ho_Chi_Minh` cho cùng epoch.
- Chạy manual workflow trên bảng test.
- Đối chiếu create/update `X/Y` trong log.
- Chạy lại lần hai để kiểm tra tính idempotent.
- Xác nhận không commit `.env`, logs hoặc credential.
- Cập nhật tài liệu tương ứng trong `docs/`.
