import { utcTimestampMsToVn } from "../../utils/common/time-helper.js";
import { generateHash } from "../common/generate-hash.js";

function capitalizeFirst(str) {
  if (!str) return "";
  const s = str.trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatLeaveInstances(instances) {
  const instanceFormarted = instances?.map((item) => {
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

      leave_type: parsedForm[0]?.value?.name || null,
      reason_for_leave: parsedForm[0]?.value?.reason || null,
      start_time: parsedForm[0]?.value?.start || null,
      end_time: parsedForm[0]?.value?.end || null,
      approval_steps: approvalSteps,
      last_task_user_id: lastTaskUser,

      reverted: item.reverted,
      duration: parsedForm[0]?.value?.interval || null,
      leave_unit: parsedForm[0]?.value?.unit || null,
    };

    formatted.hash = generateHash(formatted);

    return formatted;
  });

  return instanceFormarted;
}
