import { Router } from "express";
import settingsRouter from "./settings";
import patientsRouter from "./patients";
import surgeriesRouter from "./surgeries";
import recordsRouter from "./records";
import preopRouter from "./preop";
import vitalsRouter from "./vitals";
import medicationsRouter from "./medications";
import eventsRouter from "./events";
import staffRouter from "./staff";
import inventoryRouter from "./inventory";
import installationsRouter from "./installations";

const router = Router();

router.use(settingsRouter);
router.use(patientsRouter);
router.use(surgeriesRouter);
router.use(recordsRouter);
router.use(preopRouter);
router.use(vitalsRouter);
router.use(medicationsRouter);
router.use(eventsRouter);
router.use(staffRouter);
router.use(inventoryRouter);
router.use(installationsRouter);

export default router;
