import { DataEngine } from '../models/dataEngine.js';

// Verifies that referenced documents exist inside the caller's organization.
// checks: [[collection, id, label], ...]; returns the label of the first missing reference or null.
export async function findMissingRef(checks) {
  for (const [collection, id, label] of checks) {
    // eslint-disable-next-line no-await-in-loop
    if (id && !(await DataEngine.findById(collection, id))) return label;
  }
  return null;
}
