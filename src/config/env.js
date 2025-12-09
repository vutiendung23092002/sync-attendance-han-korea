import dotenv from "dotenv";
dotenv.config();

export const env = {
  LARK: {
    BASE_ID: process.env.LARK_BASE_ID,
    hrm_app: {
      app_id: process.env.LARK_HRM_APP_ID,
      app_secret: process.env.LARK_HRM_APP_SECRET,
    },

  },

  SUPABASE: {
    SERVICE_KEY: process.env.DATABASE_SERVICE_KEY,
  },

  AES_256_CBC: {
    APP_SECRET_KEY: process.env.AES_256_CBC_APP_SECRET_KEY,
  },
};
