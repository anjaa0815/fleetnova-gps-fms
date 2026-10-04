import express from 'express';
import { receiveOsmand, receiveTraccar } from '../controllers/gpsController.js';

const router = express.Router();

// Public endpoint used by trackers / phone apps: authenticated by device id + secret key, not by a user token
router.route('/osmand').get(receiveOsmand).post(receiveOsmand);

// Position forwarding from a Traccar server (forward.url + forward.json); authenticated by a shared token
router.post('/traccar', receiveTraccar);

export default router;
