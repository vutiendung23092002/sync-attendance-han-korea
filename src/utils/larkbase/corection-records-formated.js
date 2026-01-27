import { generateHash } from "../common/generate-hash.js";
import {
  utcTimestampMsToVn,
  ymdSlashToNumber,
  vnLocalToUtcISOString,
  utcISOStringToYmd,
} from "../common/time-helper.js";

function capitalizeFirst(str) {
  if (!str) return "";
  const s = str.trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatCorrectionRecordsV2(records) {
  const result = [];

  for (const item of records) {
    let parsedForm = null;
    try {
      parsedForm = item.form ? JSON.parse(item.form) : null;
    } catch (err) {
      console.log("❌ Lỗi parse form:", err.message);
      continue;
    }

    if (!parsedForm?.length) continue;

    const formValue = parsedForm[0]?.value;
    if (!formValue) continue;

    const isBatch = formValue.enableBatchRemedy === true;

    const lastTaskUser =
      item.task_list?.length > 0
        ? item.task_list[item.task_list.length - 1].user_id
        : null;

    const approvalSteps =
      item.task_list?.length > 0
        ? item.task_list[item.task_list.length - 1].node_name
        : null;

    /**
     * ==========================
     * CASE 1: BATCH REMEDY
     * ==========================
     */
    if (isBatch && Array.isArray(formValue.widgetRemedyGroupV2BatchDetail)) {
      for (const batch of formValue.widgetRemedyGroupV2BatchDetail) {
        const remedyDate = batch.widgetRemedyGroupV2BatchRemedyDate;
        const remedyTime = batch.widgetRemedyGroupV2BatchRemedyTime;
        const clockTime = batch.widgetRemedyGroupV2BatchClockTime?.text || "";

        const formatted = {
          id: `${item.approval_code}_${item.serial_number}`,
          serial_number: item.serial_number,
          user_id: item.user_id,

          approval_name: item.approval_name,
          department_id: item.department_id,
          department_name: item.department_name,

          status: capitalizeFirst(item.status),

          submitted_at: utcTimestampMsToVn(Number(item.start_time)),
          completed_at:
            item.end_time === "0" || item.end_time === 0
              ? ""
              : utcTimestampMsToVn(Number(item.end_time)),

          approval_steps: approvalSteps,
          last_task_user_id: lastTaskUser,

          original_record: clockTime,
          date_of_error: remedyDate ? utcISOStringToYmd(remedyDate) : "",
          replenishment_time: remedyTime,
          reason_for_correction: formValue.widgetRemedyGroupV2Reason || "",

          reverted: item.reverted,

          id_lookup_correction: `${item.user_id}_${ymdSlashToNumber(
            utcISOStringToYmd(remedyDate),
          )}`,
        };

        formatted.hash = generateHash(formatted);
        result.push(formatted);
      }

      continue;
    }

    /**
     * ==========================
     * CASE 2: SINGLE REMEDY
     * ==========================
     */
    const remedyDate = formValue.widgetRemedyGroupV2RemedyDate?.text || "";
    const remedyTime = formValue.widgetRemedyGroupV2RemedyTime?.text || null;

    const formatted = {
      id: `${item.approval_code}_${item.serial_number}`,
      serial_number: item.serial_number,
      user_id: item.user_id,

      approval_name: item.approval_name,
      department_id: item.department_id,
      department_name: item.department_name,

      status: capitalizeFirst(item.status),

      submitted_at: utcTimestampMsToVn(Number(item.start_time)),
      completed_at:
        item.end_time === "0" || item.end_time === 0
          ? ""
          : utcTimestampMsToVn(Number(item.end_time)),

      approval_steps: approvalSteps,
      last_task_user_id: lastTaskUser,

      original_record: formValue.widgetRemedyGroupV2ClockTime?.text || "",
      date_of_error: remedyDate,
      replenishment_time: remedyTime ? vnLocalToUtcISOString(remedyTime) : null,
      reason_for_correction: formValue.widgetRemedyGroupV2Reason || "",

      reverted: item.reverted,

      id_lookup_correction: `${item.user_id}_${ymdSlashToNumber(remedyDate)}`,
    };

    formatted.hash = generateHash(formatted);
    result.push(formatted);
  }

  return result;
}
