import { encrypt, decrypt } from "./src/utils/common/AES-256-CBC.js";
import { supabase } from "./src/core/supabase-client.js";

async function addDepartmentClient(
  tbSupabaseName,
  idDepartment,
  larkAppId,
  larkAppSecret,
  status
) {
  const { data, error } = await supabase.from(tbSupabaseName).upsert(
    {
      id_phongban: idDepartment,
      lark_app_id: encrypt(larkAppId),
      lark_app_secret: encrypt(larkAppSecret),
      status: status,
    },
    { onConflict: "id_phongban" }
  );
}

const tbSupabaseName = process.env.TABLE_SUBABASE_NAME;
const idDepartment = process.env.ID_DEPARTMENT;
const larkAppId = process.env.LARK_APP_ID;
const larkAppSecret = process.env.LARK_APP_SECRET;
const status = process.env.STATUS;

addDepartmentClient(
  tbSupabaseName,
  idDepartment,
  larkAppId,
  larkAppSecret,
  status
);
