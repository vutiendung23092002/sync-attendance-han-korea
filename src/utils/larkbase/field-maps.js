// Build field for larkbase

export function buildField(key, label, type, uiType, cuCode) {
  if (uiType === "Currency") {
    const formatter = cuCode === "VND" ? "0" : "0.00";

    return {
      field_name: label,
      type,
      ui_type: "Currency",
      property: {
        formatter,
        currency_code: cuCode,
      },
    };
  }

  return {
    field_name: label,
    type,
  };
}

// =========================
// MAPPING FIELD ATTENDANCE
// =========================
export const ATTENDANCE_FIELD_MAP = {
  day: "Date(TH)",
  user_id: "User id(TH)",

  check_in_time: "Check in time(TH)",
  check_in_shift_time: "Check in shift time(TH)",
  check_in_result: "Check in result(TH)",

  check_out_time: "Check out time(TH)",
  check_out_shift_time: "Check out shift time(TH)",
  check_out_result: "Check out result(TH)",

  result_id: "result_id",
  id: "Id",
  hash: "hash",
};

export const ATTENDANCE_TYPE_MAP = {
  day: 5,
  user_id: 1,
  employee: 11,

  check_in_time: 5,
  check_in_shift_time: 5,
  check_in_result: 1,
  check_in_result_supplement: 5,

  check_out_time: 5,
  check_out_shift_time: 5,
  check_out_result: 1,
  check_out_result_supplement: 5,

  result_id: 1,
  hash: 1,
  id:1
};

export const ATTENDANCE_UI_TYPE_MAP = {
  day: "DateTime",
  user_id: "Text",
  employee: "User",

  check_in_time: "DateTime",
  check_in_shift_time: "DateTime",
  check_in_result: "DateTime",
  check_in_result_supplement: "DateTime",

  check_out_time: "DateTime",
  check_out_shift_time: "DateTime",
  check_out_result: "DateTime",
  check_out_result_supplement: "DateTime",

  result_id: "Text",
  hash: "Text",
  id: "Text"
};
