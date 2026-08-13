# GitHub Actions, biến môi trường và vận hành

## 1. Lịch chạy

Cron của GitHub Actions luôn được hiểu theo UTC. `TZ=Asia/Ho_Chi_Minh` chỉ đặt timezone cho process, không đổi thời điểm cron kích hoạt.

| Workflow | Cron UTC | Giờ Việt Nam | Chức năng |
| --- | --- | --- | --- |
| `sync-attendance.yml` | `30 20 * * *` | 03:30 hôm sau | Sync attendance |
| `sync-correction-records.yml` | `30 14 */1 * *` | 21:30 | Sync correction, sau đó apply nếu sync thành công |
| `sync-leave-instance.yml` | `30 14 */1 * *` | 21:30 | Sync leave |
| `check-correction.yml` | `*/40 * * * *` | Phút 00 và 40 mỗi giờ | Apply correction độc lập |

`*/40` không có nghĩa là khoảng cách luôn đúng 40 phút; trong mỗi giờ nó chạy ở phút 00 và 40.

## 2. Scheduled run và manual run

### Scheduled

Workflow truyền `FROM=''` và `TO=''`. Script tự tính range theo ngày Việt Nam:

- Attendance/correction: đầu tháng đến hôm nay, mùng 2 ở tháng 31 ngày.
- Check correction: 30 ngày lùi ở đầu tháng hoặc từ đầu tháng sau mùng 8.
- Leave: 29 ngày trước đến hôm nay.

GitHub Environment variables `FROM/TO` cũ không được dùng cho scheduled run.

### Manual `workflow_dispatch`

Người chạy nhập `FROM/TO` định dạng `YYYY/MM/DD`. Workflow chuyển input này cho script. Các input table name cũng được ưu tiên hơn Environment variable.

## 3. Chạy local

Các script đọc `.env` qua `dotenv`. Nếu `.env` có `FROM/TO`, hai giá trị đó luôn ghi đè range tự động.

```powershell
node sync-attendance.js
node sync-correction-records.js
node check-correction-status.js
node sync-leave-instances.js
```

Muốn test range tự động dưới local, bỏ hoặc để trống `FROM/TO` trước khi chạy.

Attendance và correction có log `DATE RANGE`; leave và check correction cũng log khoảng ngày ở đầu chương trình.

## 4. Secrets và variables đang dùng

### Secrets

| Biến | Vai trò |
| --- | --- |
| `DATABASE_URL` | Kết nối PostgreSQL/Supabase schema `han_hrm` |
| `DATABASE_SERVICE_KEY` | Supabase REST client legacy; vẫn được workflow truyền |
| `AES_256_CBC_APP_SECRET_KEY` | Mã hóa/giải mã luồng legacy; các query `han_hrm` hiện không gọi helper này trực tiếp |
| `LARK_HRM_APP_ID` | App trung tâm truy cập LarkBase |
| `LARK_HRM_APP_SECRET` | Secret app trung tâm |
| `CALLBACK_URL` | Webhook nhận kết quả workflow |

### Variables

| Biến | Workflow |
| --- | --- |
| `LARK_BASE_ID` | Tất cả job làm việc với Base |
| `TABLE_NAME_ATTENDANCE` | Sync attendance theo tên bảng |
| `TABLE_CORECTION_NAME` | Sync correction theo tên bảng; tên biến đang giữ spelling `CORECTION` |
| `TABLE_INSTANCES_NAME` | Sync leave theo tên bảng |
| `TABLE_ATTENDANCE_ID` | Check correction đọc/update attendance theo table ID |
| `TABLE_CORECTION_ID` | Check correction đọc correction theo table ID |

`TABLE_SUPABASE_NAME` không được các luồng hiện tại sử dụng. Workflow legacy dùng một tên khác bị viết sai là `TABLE_SUBABASE_NAME`.

## 5. Callback

Sau sync, workflow gọi `CALLBACK_URL` bằng JSON chứa kết quả job, table name và `FROM/TO` được truyền từ workflow.

Với scheduled run, callback hiện nhận `from/to` rỗng vì range được tính bên trong Node script, không được trả ngược lên workflow. Muốn callback có range thực tế cần thay đổi output hoặc tự tính ở workflow.

Callback job dùng `if: always()`, nên vẫn chạy khi job chính thất bại.

## 6. Kiểm tra sau khi push

Nên chạy manual trên bảng test và range ngắn:

1. Kiểm tra log range.
2. Kiểm tra tổng số department thành công/thất bại.
3. Kiểm tra số record source.
4. Kiểm tra log diff: thêm mới/cập nhật.
5. Kiểm tra log batch `X/Y` thay vì chỉ nhìn workflow success.
6. Kiểm tra giờ Lark hiển thị đúng giờ Việt Nam.
7. Chạy lại cùng range; nếu nguồn không đổi, số update thông thường phải về 0, trừ ngoại lệ attendance.
8. Test correction Start/End, Approved/Pending và trường hợp đã sửa tay.

## 7. Rollback khi lỗi

Sau khi commit đã được push, dùng `git revert` để tạo commit đảo ngược mà không viết lại lịch sử:

```bash
git revert <commit-hash>
git push origin main
```

Nếu lỗi chỉ thuộc một nhóm chức năng, revert đúng commit của nhóm đó. Không dùng `git reset --hard` trên nhánh đã chia sẻ nếu không có kế hoạch xử lý lịch sử rõ ràng.

## 8. Điểm cần theo dõi

- Batch Lark lỗi có thể chỉ log mà không làm workflow fail.
- Approval pagination hiện chưa truyền `page_token` vào request kế tiếp.
- Multiple correction cùng user/ngày không có quy tắc chọn bản mới nhất.
- Batch correction có thể sinh nhiều detail cùng `Id`.
- Scheduled callback không có range thực tế.
