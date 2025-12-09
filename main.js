import { syncAttendanceForDepartment } from "./src/services/larkbase/attendance.js";
import { createLarkClient } from "./src/core/larkbase-client.js";
import { getTodayYmd, getTodayYmdhs } from "./src/utils/common/time-helper.js";
import { decrypt } from "./src/utils/common/AES-256-CBC.js";
import { env } from "./src/config/env.js";
import { supabase } from "./src/core/supabase-client.js";

async function main(hrmAppId, hrmAppSecret, baseID, tableName) {
  console.log("=== BẮT ĐẦU SYNC TOÀN BỘ PHÒNG BAN ===");

  // 1) Lấy danh sách tất cả apps Attendance đang ON
  const { data: client_attendance, error } = await supabase
    .from("client-attendance-hankor")
    .select()
    .eq("status", true);

  // if (error) {
  //   console.error("LỖI LẤY DANH SÁCH CLIENT:", error);
  //   return;
  // }

  if (!client_attendance?.length) {
    console.log("Không có client nào cần sync.");
    return;
  }

  // 2) Tạo HRM client (1 app duy nhất)
  const clientHrm = await createLarkClient(hrmAppId, hrmAppSecret);

  const from = getTodayYmd();
  const to = getTodayYmd();

  console.log(
    `Giờ hiện tại: ${getTodayYmdhs()} | Khoảng sync: ${from} - ${to}`
  );

  // 3) Lặp qua từng client để sync
  for (const c of client_attendance) {
    try {
      console.log("\n===============================================");
      console.log(`>>> BẮT ĐẦU SYNC PHÒNG BAN: ${c.ten_phong_ban.trim()}`);
      console.log("ID phòng ban:", c.id_phongban);

      // Giải mã app_id & secret
      const app_id = decrypt(c.lark_app_id);
      const app_secret = decrypt(c.lark_app_secret);

      // Tạo client Attendance tương ứng
      const clientAtt = await createLarkClient(app_id, app_secret);

      console.log(">>> ĐÃ TẠO CLIENT ATTENDANCE");

      // 4) Gọi sync cho từng phòng ban
      await syncAttendanceForDepartment(
        clientAtt,
        clientHrm,
        baseID,
        tableName,
        c.id_phongban,
        from,
        to
      );

      console.log(`>>> DONE PHÒNG BAN: ${c.ten_phong_ban.trim()}`);
    } catch (err) {
      console.error(
        `🔥 LỖI KHI SYNC PHÒNG BAN ${c.ten_phong_ban.trim()}:`,
        err
      );
    }
  }

  console.log("\n=== HOÀN TẤT SYNC TẤT CẢ PHÒNG BAN ===");
}

const hrmAppId = env.LARK.hrm_app.app_id;
const hrmAppSecret = env.LARK.hrm_app.app_secret;
const baseID = env.LARK.BASE_ID;
const tableName = "Tổng hợp chấm công v1.0.0";

main(hrmAppId, hrmAppSecret, baseID, tableName);
