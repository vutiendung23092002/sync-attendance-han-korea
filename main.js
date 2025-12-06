import { syncAttendanceForDepartment } from "./src/services/larkbase/attendance.js";
import { createLarkClient } from "./src/core/larkbase-client.js";
import { getTodayYmd, getTodayYmdhs } from "./src/utils/common/time-helper.js";

async function main() {
  const clientAtt = await createLarkClient(
    "att id app",
    "att secret app"
  );

  const clientHrm = await createLarkClient(
    "hrm id app",
    "hrm secret app"
  );


  const from = getTodayYmd();
  const to = getTodayYmd();

  console.log(
    `curent date from: ${getTodayYmdhs()} - curent date from: ${getTodayYmdhs()}`
  );
  console.log(`from: ${from} - to: ${to}`);

  await syncAttendanceForDepartment(
    clientAtt,
    clientHrm,
    "UGV7bsyTxaqlkysTHi2lHnJ3gmc",
    "Tổng hợp chấm công v1.0.0",
    "tmdt",
    from,
    to
  );
}

main();
