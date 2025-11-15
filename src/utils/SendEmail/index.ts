import nodemailer from "nodemailer";
import NodemailerConfig from "../../config/nodemailerConfig";
import { EmailMessage } from "../../interfaces/nodemailer";

const transporter = nodemailer.createTransport({
  host: NodemailerConfig.HOST,
  port: NodemailerConfig.PORT,
  auth: {
    user: NodemailerConfig.MAIL_USERNAME,
    pass: NodemailerConfig.PASSWORD,
  },
  tls: {
    rejectUnauthorized: false,
  },
  // from:NodemailerConfig.MAIL_FROM_NAME,
});

export const sendEmail = async (
  to: string,
  subject: string,
  content: string
) => {
  const message: EmailMessage = {
    from: {
      name: String(NodemailerConfig.MAIL_FROM_NAME),
      address: String(NodemailerConfig.MAIL_USERNAME),
    },
    to: to,
    subject: subject,
    html: content,
  };

  try {
    await transporter.sendMail(message);
  } catch (error) {
    console.error("Error sending email:", error);
  }
};
