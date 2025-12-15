import { formatAttendanceResults } from "../../utils/larkbase/attendance-formart.js";
import { formatCorrectionRecords } from "../../utils/larkbase/corection-records-formated.js";
import { syncDataToLarkBaseFilterDate } from "./sync-to-lark.js";
import {
  ATTENDANCE_FIELD_MAP,
  ATTENDANCE_TYPE_MAP,
  ATTENDANCE_UI_TYPE_MAP,
} from "../../utils/larkbase/field-maps.js";

import {
  CORECTION_RECORD_FIELD_MAP,
  CORECTION_RECORD_TYPE_MAP,
  CORECTION_RECORD_UI_TYPE_MAP,
} from "../../utils/larkbase/field-maps.js";

import {
  writeJsonFile,
  ymdSlashToNumber,
  vnTimeToUTCTimestampMiliseconds,
  vnTimeToUtcTimestamp,
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
  departmentName,
  from,
  to
) {
  console.log(`from: ${ymdSlashToNumber(from)} - to: ${ymdSlashToNumber(to)}`);

  const employees = await getEmployee(clientAtt, departmentId);
  if (!employees || employees.length === 0) {
    console.warn(
      `Không tìm thấy user nào trong phòng ban '${departmentId}' → bỏ qua.`
    );
    return;
  }
  const userIds = employees.map((u) => u.user_id);

  const attendanceResult = await getAttendanceResult(
    clientAtt,
    userIds,
    ymdSlashToNumber(from),
    ymdSlashToNumber(to)
  );

  const attendanceRaw = attendanceResult?.data?.user_task_results || [];

  const attendanceFormatted = formatAttendanceResults(attendanceRaw).map(
    (r) => ({
      ...r,
      department_name: departmentName?.trim(),
    })
  );

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
      excludeUpdateField: [
        "Check in time(TH)",
        "Check out time(TH)",
        "Check in result(TH)",
        "Check out result(TH)",
        "Số phút đi muộn",
        "Sau 10p",
        "Trước 10p",
        "Số phút về sớm",
      ],
    },
    "Date(TH)",
    timestampFrom,
    timestampTo
  );
}

export async function getCorrectionRecords(client, userId, from, to) {
  const res = await client.attendance.userTaskRemedy.query({
    params: {
      employee_type: "employee_id",
    },
    data: {
      user_ids: userId,
      check_time_from: from,
      check_time_to: to,
    },
  });

  return res;
}

export async function syncCorrectionRecords(
  clientAtt,
  clientHrm,
  baseIdHrm,
  tbCorectionNameHrm,
  departmentId,
  departmentName,
  from,
  to
) {
  console.log(
    `from: ${String(vnTimeToUtcTimestamp(`${from} 00:00:00`))} - to: ${String(
      vnTimeToUtcTimestamp(`${to} 23:59:59`)
    )}`
  );
  const employees = await getEmployee(clientAtt, departmentId);

  if (!employees || employees.length === 0) {
    console.warn(
      `Không tìm thấy user nào trong phòng ban '${departmentId}' → bỏ qua.`
    );
    return;
  }
  const userIds = employees.map((u) => u.user_id);

  const corectionRecords = await getCorrectionRecords(
    clientAtt,
    userIds,
    String(vnTimeToUtcTimestamp(`${from} 00:00:00`)),
    String(vnTimeToUtcTimestamp(`${to} 23:59:59`))
  );

  const corectionRecordRaw = corectionRecords?.data.user_remedys || [];

  // const corectionRecordFormatted = formatCorrectionRecords(corectionRecordRaw);
  const corectionRecordFormatted = formatCorrectionRecords(
    corectionRecordRaw
  ).map((r) => ({
    ...r,
    department_name: departmentName?.trim(),
  }));

  const ONE_DAY = 24 * 60 * 60 * 1000; // ms
  const timestampFrom =
    vnTimeToUTCTimestampMiliseconds(`${from} 00:00:00`) - ONE_DAY;
  const timestampTo =
    vnTimeToUTCTimestampMiliseconds(`${to} 23:59:59`) + ONE_DAY;

  await syncDataToLarkBaseFilterDate(
    clientHrm,
    baseIdHrm,
    {
      tableName: tbCorectionNameHrm,
      records: corectionRecordFormatted,
      fieldMap: CORECTION_RECORD_FIELD_MAP,
      typeMap: CORECTION_RECORD_TYPE_MAP,
      uiType: CORECTION_RECORD_UI_TYPE_MAP,
      currencyCode: "VND",
      idLabel: "Id",
      excludeUpdateField: [],
    },
    "Date of error",
    timestampFrom,
    timestampTo
  );
}

export async function getListInstances(client, from, to, approvalCode) {
  let instances = [];
  let pageToken = "";

  do {
    const res = await client.approval.instance.query({
      params: {
        page_size: 200,
        user_id_type: "open_id",
      },
      data: {
        approval_code: approvalCode,
        instance_status: "ALL",
        instance_start_time_from: from,
        instance_start_time_to: to,
      },
    });
    instances.push(...(res.data?.instance_list ?? []));
    pageToken = res.data?.page_token;
  } while (pageToken);
  return instances;
}

export async function getdetailsInstance(client, instanceCode, userId) {
  const res = await client.approval.instance.get({
    path: {
      instance_id: instanceCode,
    },
    params: {
      locale: "en-US",
      user_id: userId,
      user_id_type: "user_id",
    },
  });

  return res;
}
