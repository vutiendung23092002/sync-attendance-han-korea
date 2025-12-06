import { formatAttendanceResults } from "../../utils/larkbase/attendance-formart.js";
import { syncDataToLarkBaseFilterDate } from "./sync-to-lark.js";
import {
  ATTENDANCE_FIELD_MAP,
  ATTENDANCE_TYPE_MAP,
  ATTENDANCE_UI_TYPE_MAP,
} from "../../utils/larkbase/field-maps.js";

import {
  writeJsonFile,
  ymdSlashToNumber,
  vnTimeToUTCTimestampMiliseconds,
} from "../../utils/index.js";


export async function getEmployee(client, departmentId) {
  const employees = [];
  let pageToken = "";

  do {
    const res = await client.contact.user.findByDepartment({
      params: {
        user_id_type: "open_id",
        department_id_type: "department_id",
        department_id: departmentId,
        page_size: 50,
        page_token: pageToken,
      },
    });

    employees.push(...(res.data?.items ?? []));
    pageToken = res.data?.page_token;
  } while (pageToken);

  return employees;
}

export async function getAttendanceResult(client, userId, from, to) {
  const res = await client.attendance.userTask.query({
    params: {
      employee_type: "employee_id",
    },
    data: {
      user_ids: userId,
      check_date_from: from,
      check_date_to: to,
    },
  });

  return res;
}

export async function syncAttendanceForDepartment(
  clientAtt,
  clientHrm,
  baseIdHrm,
  tbNameHrm,
  departmentId,
  from,
  to
) {
  console.log(`from: ${ymdSlashToNumber(from)} - to: ${ymdSlashToNumber(to)}`);

  const employees = await getEmployee(clientAtt, departmentId);
  const userIds = employees.map((u) => u.user_id);

  const attendanceResult = await getAttendanceResult(
    clientAtt,
    userIds,
    ymdSlashToNumber(from),
    ymdSlashToNumber(to)
  );
  const attendanceRaw = attendanceResult?.data?.user_task_results || [];

  const attendanceFormatted = formatAttendanceResults(attendanceRaw);

  // writeJsonFile("./src/data/attendanceFormatted.json", attendanceFormatted);

  const ONE_DAY = 24 * 60 * 60 * 1000; // ms
  const timestampFrom =
    vnTimeToUTCTimestampMiliseconds(`${from} 00:00:00`) - ONE_DAY;
  const timestampTo =
    vnTimeToUTCTimestampMiliseconds(`${to} 23:59:59`) + ONE_DAY;

  await syncDataToLarkBaseFilterDate(
    clientHrm,
    baseIdHrm,
    {
      tableName: tbNameHrm,
      records: attendanceFormatted,
      fieldMap: ATTENDANCE_FIELD_MAP,
      typeMap: ATTENDANCE_TYPE_MAP,
      uiType: ATTENDANCE_UI_TYPE_MAP,
      currencyCode: "VND",
      idLabel: "Id",
    },
    "Date(TH)",
    timestampFrom,
    timestampTo
  );
}
