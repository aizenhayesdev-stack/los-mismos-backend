import { Router } from "express";
import { createChallange, createProfile, getProfile, login, loginChallenge, sendOtp, signup, verifyChallenge, verifyLoginChallenge, verifyOtp, getPasskeys, deletePasskey, updatePasskeyName, changePassword, updateProfile, resetPassword } from "../controllers/auth.controller";
import { handleMediaFilesLocal } from "../utils/Mutlipart";
import { checkDefaultToken } from "../middleware/check-default-token.middleware";
import { checkUserAuth } from "../middleware/check-user-auth.middleware";
import { validateBody } from "../middleware/validation.middleware";
import { 
  signupSchema, 
  loginSchema, 
  otpVerifySchema, 
  emailSchema, 
  passowrdSchema, 
  changePassowrdSchema, 
  createProfileSchema,
  verifyChallengeSchema,
  verifyLoginChallengeSchema,
  updatePasskeyNameSchema,
  updateProfileSchema
} from "../validators/authValidators";

const router = Router();

router.post("/signup", checkDefaultToken, validateBody(signupSchema), signup);
router.post(
  "/create-profile",
  checkUserAuth,
  handleMediaFilesLocal.single("avatar"),
  validateBody(createProfileSchema),
  // handleMediaFilesLocal.fields([ 
  //   { name: "avatar", maxCount: 1 }, 
  //   { name: "certificates", maxCount: 1 },
  //   { name: "businessLicense", maxCount: 1 },
  //   { name: "insuranceCertificate", maxCount: 1 },
  //   { name: "compensationInsurance", maxCount: 1 },
  //   { name: "TradeLicenses", maxCount: 10 } // Allow multiple trade licenses
  // ]),
  createProfile
);
router.post(
  "/update-profile",
  checkUserAuth,
  handleMediaFilesLocal.single("avatar"),
  validateBody(updateProfileSchema),
  updateProfile
); 
router.post("/login", checkDefaultToken, validateBody(loginSchema), login);
router.post("/send-otp", checkDefaultToken, validateBody(emailSchema), sendOtp);
router.post("/verify-otp", checkDefaultToken, validateBody(otpVerifySchema), verifyOtp);
router.post("/reset-password", checkUserAuth, validateBody(passowrdSchema), resetPassword);
router.get("/profile", checkUserAuth, getProfile); 
router.post("/create-challange", checkUserAuth, createChallange);
router.post("/verify-challange", checkUserAuth, validateBody(verifyChallengeSchema), verifyChallenge);
router.post("/login-challange", checkUserAuth, loginChallenge);
router.post("/verify-login-challange", checkUserAuth, validateBody(verifyLoginChallengeSchema), verifyLoginChallenge);
router.post("/change-password", checkUserAuth, validateBody(changePassowrdSchema), changePassword);
// Passkey Management Routes
router.get("/passkeys", checkUserAuth, getPasskeys);
router.delete("/passkeys/:passkeyId", checkUserAuth, deletePasskey);
router.patch("/passkeys/:passkeyId", checkUserAuth, validateBody(updatePasskeyNameSchema), updatePasskeyName);
// router.post("/forget", checkDefaultToken, validateBody(emailSchema), forgetAccount);
// router.post("/forget-password", checkUserAuth, validateBody(passowrdSchema), forgetPassword);
// router.post("/change-password", checkUserAuth, validateBody(changePassowrdSchema), changePassword);
// router.get("/profile", checkUserAuth, getUserProfile);
// router.post("/update-profile", checkUserAuth, getUserProfile);

export default router;
