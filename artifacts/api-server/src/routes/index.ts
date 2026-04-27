import { Router, type IRouter } from "express";
import healthRouter from "./health";
import fbProfileRouter from "./fb-profile";

const router: IRouter = Router();

router.use(healthRouter);
router.use(fbProfileRouter);

export default router;
