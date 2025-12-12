import { createLarkClient } from "./src/core/larkbase-client.js";
import { supabase } from "./src/core/supabase-client.js";
import { decrypt } from "./src/utils/common/AES-256-CBC.js";
import {
  getListLeaveInstances,
  getdetailsInstance,
} from "./src/services/larkbase/attendance.js";
import {
  vnTimeToUTCTimestampMiliseconds,
  writeJsonFile,
} from "./src/utils/index.js";
import { env } from "./src/config/env.js";
import { formatLeaveInstances } from "./src/utils/larkbase/instance_leave_formarted.js";

import {
  LEAVE_FIELD_MAP,
  LEAVE_TYPE_MAP,
  LEAVE_UI_TYPE_MAP,
} from "./src/utils/index.js";

import { syncDataToLarkBaseFilterDate } from "./src/services/larkbase/sync-to-lark.js"

async function listLeaveInstances(
  hrmAppId,
  hrmAppSecret,
  baseID,
  tableName,
  from,
  to
) {
  const { data: client_attendance, error } = await supabase
    .from("client-attendance-hankor")
    .select()
    .eq("status", true);

  if (!client_attendance?.length) {
    console.log("Không có client nào cần sync.");
    return;
  }

  // 2) Tạo HRM client (1 app duy nhất)
  const clientHrm = await createLarkClient(hrmAppId, hrmAppSecret);

  const detailsInstanceAll = [];

  for (const c of client_attendance) {
    if (!c.approval_code) {
      console.log(`\n⚠️  ${c.ten_phong_ban} không có approval_code!`);
      continue;
    }
    console.log("\n===============================================");
    console.log(
      `>>> BẮT ĐẦU ĐỒNG BỘ THÔNG TIN PHÉP: ${c.ten_phong_ban.trim()}`
    );
    console.log("✅ ID phòng ban:", c.id_phongban);

    const app_id = decrypt(c.lark_app_id);
    const app_secret = decrypt(c.lark_app_secret);

    const clientAtt = await createLarkClient(app_id, app_secret);

    const instances = await getListLeaveInstances(
      clientAtt,
      vnTimeToUTCTimestampMiliseconds(from),
      vnTimeToUTCTimestampMiliseconds(to),
      c.approval_code
    );

    console.log("Số instances phép nghỉ:", instances.length);

    const minimal = instances.map((x) => ({
      user_id: x.instance.user_id,
      instance_code: x.instance.code,
    }));

    for (const item of minimal) {
      const details = await getdetailsInstance(
        clientAtt,
        item.instance_code,
        item.user_id
      );
      detailsInstanceAll.push({
        ...details?.data,
        department_name: c.ten_phong_ban.trim(),
      });
    }
  }

  const instanceFormarted = formatLeaveInstances(detailsInstanceAll);

  const ONE_DAY = 24 * 60 * 60 * 1000; // ms
  const timestampFrom = vnTimeToUTCTimestampMiliseconds(from) - ONE_DAY;
  const timestampTo = vnTimeToUTCTimestampMiliseconds(to) + ONE_DAY;

  await syncDataToLarkBaseFilterDate(
    clientHrm,
    baseID,
    {
      tableName: tableName,
      records: instanceFormarted,
      fieldMap: LEAVE_FIELD_MAP,
      typeMap: LEAVE_TYPE_MAP,
      uiType: LEAVE_UI_TYPE_MAP,
      currencyCode: "VND",
      idLabel: "Id",
      excludeUpdateField: [],
    },
    "Submitted at",
    timestampFrom,
    timestampTo
  );
}

const hrmAppId = env.LARK.hrm_app.app_id;
const hrmAppSecret = env.LARK.hrm_app.app_secret;
const baseID = env.LARK.BASE_ID;

const tableName = process.env.TABLE_INSTANCES_NAME;

const from = process.env.FROM ? `${process.env.FROM} 00:00:00` : null;
const to = process.env.TO ? `${process.env.TO} 23:59:59` : null;

listLeaveInstances(hrmAppId, hrmAppSecret, baseID, tableName, from, to);
