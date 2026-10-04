import express from 'express';
import { receiveOsmand } from '../controllers/gpsController.js';

const router = express.Router();

// Public endpoint used by trackers / phone apps: authenticated by device id + secret key, not by a user token
router.route('/osmand').get(receiveOsmand).post(receiveOsmand);

export default router;
