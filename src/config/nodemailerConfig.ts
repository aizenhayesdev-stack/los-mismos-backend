import {
  MAIL_FROM_NAME,
  MAIL_HOST,
  MAIL_PASSWORD,
  MAIL_USERNAME,
} from "./environment";

const NodemailerConfig = {
  USER: MAIL_USERNAME,
  PASSWORD: MAIL_PASSWORD,
  HOST: MAIL_HOST,
  PORT: 465,
  MAIL_FROM_NAME: MAIL_FROM_NAME,
  MAIL_USERNAME: MAIL_USERNAME,
};

export default NodemailerConfig;
