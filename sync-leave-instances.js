import pLimit from "p-limit";

import { createLarkClient } from "./src/core/larkbase-client.js";
import { closePostgresPool } from "./src/core/postgres-client.js";
import { getAttendanceDepartmentConfigs } from "./src/services/hrm/department-configs.js";
import {
  getListInstances,
  getdetailsInstance,
} from "./src/services/larkbase/attendance.js";
import {
  getTodayYmd,
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
import { syncDataToLarkBaseFilterDate } from "./src/services/larkbase/sync-to-lark.js";

const DEPARTMENT_CONCURRENCY = 5;
const DETAIL_CONCURRENCY = 5;

const limitDepartment = pLimit(DEPARTMENT_CONCURRENCY);
const limitDetail = pLimit(DETAIL_CONCURRENCY);

async function listLeaveInstances(
  hrmAppId,
  hrmAppSecret,
  baseID,
  tableName,
  from,
  to
) {
  console.log("=== START SYNC LEAVE INSTANCES ===");
  console.log(`${from} - ${to}`);

  const departmentConfigs = await getAttendanceDepartmentConfigs();

  if (!departmentConfigs?.length) {
    console.log("No departments need syncing.");
    return;
  }

  console.log(`>>> TOTAL DEPARTMENTS: ${departmentConfigs.length}`);

  const clientHrm = await createLarkClient(hrmAppId, hrmAppSecret);

  const departmentResults = await Promise.allSettled(
    departmentConfigs.map((department) =>
      limitDepartment(async () => {
        const departmentName =
          department.ten_phong_ban?.trim() || department.id_phongban;

        if (!department.approval_code_leave) {
          console.warn(
            `WARN ${departmentName} does not have approval_code_leave`
          );
          return [];
        }

        console.log(`>>> FETCH LEAVE: ${departmentName}`);

        const clientAtt = await createLarkClient(
          department.lark_app_id,
          department.lark_app_secret
        );

        const instances = await getListInstances(
          clientAtt,
          vnTimeToUTCTimestampMiliseconds(from),
          vnTimeToUTCTimestampMiliseconds(to),
          department.approval_code_leave
        );

        if (!instances.length) return [];

        console.log(
          `>>> ${departmentName} - leave instances: ${instances.length}`
        );

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

  const detailsInstanceAll = departmentResults
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value);

  console.log(`>>> TOTAL LEAVE RECORDS FETCHED: ${detailsInstanceAll.length}`);

  if (!detailsInstanceAll.length) {
    console.warn("No leave data to sync.");
    return;
  }

  const instanceFormatted = formatLeaveInstances(detailsInstanceAll);

  writeJsonFile("./logs/instanceF.json", instanceFormatted);
  writeJsonFile("./logs/instanceD.json", detailsInstanceAll);

  const ONE_DAY = 24 * 60 * 60 * 1000;
  const timestampFrom = vnTimeToUTCTimestampMiliseconds(from) - ONE_DAY;
  const timestampTo = vnTimeToUTCTimestampMiliseconds(to) + ONE_DAY;

  console.log(">>> SYNC LEAVE LARKBASE...");

  await syncDataToLarkBaseFilterDate(
    clientHrm,
    baseID,
    {
      tableName,
      records: instanceFormatted,
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

  console.log("DONE SYNC LEAVE INSTANCES");
}

const hrmAppId = env.LARK.hrm_app.app_id;
const hrmAppSecret = env.LARK.hrm_app.app_secret;
const baseID = env.LARK.BASE_ID;

const tableName = process.env.TABLE_INSTANCES_NAME;

const from = process.env.FROM
  ? `${process.env.FROM} 00:00:00`
  : `${getTodayYmd(29)} 00:00:00`;

const to = process.env.TO
  ? `${process.env.TO} 23:59:59`
  : `${getTodayYmd(0)} 23:59:59`;

listLeaveInstances(hrmAppId, hrmAppSecret, baseID, tableName, from, to)
  .catch((err) => {
    console.error("GLOBAL ERROR:", err);
    process.exitCode = 1;
  })
  .finally(() => closePostgresPool());
