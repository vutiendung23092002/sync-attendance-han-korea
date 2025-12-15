import { generateHash } from "../common/generate-hash.js";
import {
  utcTimestampSToVn,
  numberYmdToFullDate,
  utcTimestampMsToVn,
  ymdSlashToNumber,
} from "../common/time-helper.js";

export function formatCorrectionRecords(records) {
  return records?.map((item) => {
    const formatted = {
      approval_id: item.approval_id ?? "",
      create_time: utcTimestampSToVn(item.create_time),
      status: STATUS_TEXT_MAP[item.status] ?? "Unknown",
      remedy_date: numberYmdToFullDate(item.remedy_date),
      reason: item.reason ?? "",
      remedy_time: new Date(
        item.remedy_time.replace(" ", "T") + "+07:00"
      ).toISOString(),
      user_id: item.user_id ?? "",
      department_name: item.department_name,
      update_time: utcTimestampSToVn(item.update_time),
      id_lookup: `${item.user_id}_${item.remedy_date}`,
      // id unique giống style attendance
      id: `${item.user_id}_${item.remedy_date}_${item.approval_id}`,
      id_lookup_correction: `${item.user_id}_${item.remedy_date}`,
    };

    formatted.hash = generateHash(formatted);

    return formatted;
  });
}

function capitalizeFirst(str) {
  if (!str) return "";
  const s = str.trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatCorrectionRecordsV2(records) {
  const correctionFormarted = records?.map((item) => {
    let parsedForm = null;
    try {
      parsedForm = item.form ? JSON.parse(item.form) : null;
    } catch (err) {
      console.log("❌ Lỗi parse form:", err.message);
    }

    const lastTaskUser =
      item.task_list?.length > 0
        ? item.task_list[item.task_list.length - 1].user_id
        : null;

    const approvalSteps =
      item.task_list?.length > 0
        ? item.task_list[item.task_list.length - 1].node_name
        : null;

    const formatted = {
      id: `${item.approval_code}_${item.serial_number}`,
      serial_number: item.serial_number,
      user_id: item.user_id, //----

      approval_name: item.approval_name, //----
      department_id: item.department_id,
      department_name: item.department_name,

      status: capitalizeFirst(item.status), //----

      submitted_at: utcTimestampMsToVn(Number(item.start_time)),
      completed_at:
        item.end_time === "0" || item.end_time === 0
          ? ""
          : utcTimestampMsToVn(Number(item.end_time)),

      approval_steps: approvalSteps,
      last_task_user_id: lastTaskUser,

      original_record: parsedForm[0]?.value?.widgetRemedyGroupV2ClockTime?.text,
      date_of_error: parsedForm[0]?.value?.widgetRemedyGroupV2RemedyDate?.text,
      replenishment_time: vnLocalToUtcISOString(
        parsedForm[0]?.value?.widgetRemedyGroupV2RemedyTime?.text
      ),
      reason_for_correction: parsedForm[0]?.value?.widgetRemedyGroupV2Reason,

      reverted: item.reverted,
      id_lookup_correction: `${item.user_id}_${ymdSlashToNumber(
        parsedForm[0]?.value?.widgetRemedyGroupV2RemedyDate?.text
      )}`,
    };

    formatted.hash = generateHash(formatted);

    return formatted;
  });

  return correctionFormarted;
}
