import pLimit from "p-limit";

import { createLarkClient } from "./src/core/larkbase-client.js";
import {
  closePostgresPool,
} from "./src/core/postgres-client.js";
import { getAttendanceDepartmentConfigs } from "./src/services/hrm/department-configs.js";
import {
  getListInstances,
  getdetailsInstance,
} from "./src/services/larkbase/attendance.js";
import {
  CORECTION_RECORD_FIELD_MAP,
  CORECTION_RECORD_TYPE_MAP,
  CORECTION_RECORD_UI_TYPE_MAP,
  vnTimeToUTCTimestampMiliseconds,
  writeJsonFile,
  getTodayYmd,
} from "./src/utils/index.js";
import { env } from "./src/config/env.js";
import { formatCorrectionRecordsV2 } from "./src/utils/larkbase/corection-records-formated.js";
import { syncDataToLarkBaseFilterDate } from "./src/services/larkbase/sync-to-lark.js";

const DEPARTMENT_CONCURRENCY = 5;
const DETAIL_CONCURRENCY = 5;

const limitDepartment = pLimit(DEPARTMENT_CONCURRENCY);
const limitDetail = pLimit(DETAIL_CONCURRENCY);

async function listCorrectionInstances(
  hrmAppId,
  hrmAppSecret,
  baseID,
  tableName,
  from,
  to
) {
  console.log("=== START SYNC CORRECTION (SAFE MODE) ===");

  const departmentConfigs = await getAttendanceDepartmentConfigs();

  if (!departmentConfigs?.length) {
    console.log("No departments need syncing.");
    return;
  }

  console.log(`>>> TOTAL DEPARTMENTS: ${departmentConfigs.length}`);

  const clientHrm = await createLarkClient(hrmAppId, hrmAppSecret);

  const departmentResults = await Promise.allSettled(
    departmentConfigs.map((c) =>
      limitDepartment(async () => {
        const departmentName = c.ten_phong_ban?.trim() || c.id_phongban;

        if (!c.approval_code_correction) {
          console.warn(
            `WARN ${departmentName} does not have approval_code_correction`
          );
          return [];
        }

        console.log(`>>> FETCH CORRECTION: ${departmentName}`);

        const clientAtt = await createLarkClient(
          c.lark_app_id,
          c.lark_app_secret
        );

        const instances = await getListInstances(
          clientAtt,
          vnTimeToUTCTimestampMiliseconds(from),
          vnTimeToUTCTimestampMiliseconds(to),
          c.approval_code_correction
        );

        if (!instances.length) return [];

        console.log(`>>> ${departmentName} - instances: ${instances.length}`);

        const minimal = instances.map((x) => ({
          user_id: x.instance.user_id,
          instance_code: x.instance.code,
        }));

        const detailResults = await Promise.allSettled(
          minimal.map((item) =>
            limitDetail(() =>
              getdetailsInstance(clientAtt, item.instance_code, item.user_id)
            )
          )
        );

        return detailResults
          .filter((r) => r.status === "fulfilled")
          .map((r) => ({
            ...r.value?.data,
            department_name: departmentName,
          }));
      })
    )
  );

  const detailsCorrectionAll = departmentResults
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value);

  console.log(
    `>>> TOTAL CORRECTION RECORDS FETCHED: ${detailsCorrectionAll.length}`
  );

  if (!detailsCorrectionAll.length) {
    console.warn("No correction data to sync.");
    return;
  }

  writeJsonFile("./logs/correctionV2.json", detailsCorrectionAll);

  const correctionFormatted = formatCorrectionRecordsV2(detailsCorrectionAll);

  writeJsonFile("./logs/correctionV2-Formatted.json", correctionFormatted);

  const ONE_DAY = 24 * 60 * 60 * 1000;
  const timestampFrom = vnTimeToUTCTimestampMiliseconds(from) - ONE_DAY;
  const timestampTo = vnTimeToUTCTimestampMiliseconds(to) + ONE_DAY;

  console.log(">>> SYNC LARKBASE...");

  await syncDataToLarkBaseFilterDate(
    clientHrm,
    baseID,
    {
      tableName,
      records: correctionFormatted,
      fieldMap: CORECTION_RECORD_FIELD_MAP,
      typeMap: CORECTION_RECORD_TYPE_MAP,
      uiType: CORECTION_RECORD_UI_TYPE_MAP,
      currencyCode: "VND",
      idLabel: "Id",
      excludeUpdateField: [],
    },
    "Submitted at",
    timestampFrom,
    timestampTo
  );

  console.log("DONE SYNC CORRECTION");
}

const hrmAppId = env.LARK.hrm_app.app_id;
const hrmAppSecret = env.LARK.hrm_app.app_secret;
const baseID = env.LARK.BASE_ID;

const tableName = process.env.TABLE_CORECTION_NAME;

const from = process.env.FROM
  ? `${process.env.FROM} 00:00:00`
  : `${getTodayYmd(29)} 00:00:00`;

const to = process.env.TO
  ? `${process.env.TO} 23:59:59`
  : `${getTodayYmd(0)} 23:59:59`;

listCorrectionInstances(
  hrmAppId,
  hrmAppSecret,
  baseID,
  tableName,
  from,
  to
).catch((err) => {
  console.error("GLOBAL ERROR:", err);
  process.exitCode = 1;
}).finally(() => closePostgresPool());
