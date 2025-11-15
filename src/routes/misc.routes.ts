import { Router } from "express";
import { handleMediaFilesLocal } from "../utils/Mutlipart";
import { checkDefaultToken } from "../middleware/check-default-token.middleware";

// import { allLocs } from "../controllers/misc.controller";

const router = Router();

// router.get("/locs", checkDefaultToken, allLocs);

export default router;
