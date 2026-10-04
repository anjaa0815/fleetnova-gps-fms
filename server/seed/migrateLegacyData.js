import { generateId } from '../models/dataEngine.js';
import { saveLocalStore } from '../config/db.js';
import { slugify } from '../utils/slug.js';

const TENANT_KEYS = ['vehicles', 'drivers', 'trips', 'fuels', 'maintenances', 'expenses', 'notifications'];

// Data created before multi-tenancy has no orgId. Move it into a single default organization so
// existing installations keep working. Platform (super admin) users are left without an organization.
// Only applies to the local JSON store.
export function migrateLegacyData(store, defaultOrgName = 'Default Organization') {
  const orphanUsers = (store.users || []).filter((u) => !u.orgId && u.role !== 'super_admin');
  const orphanDocs = TENANT_KEYS.flatMap((key) => (store[key] || []).filter((d) => !d.orgId));
  if (orphanUsers.length === 0 && orphanDocs.length === 0) return false;

  if (!store.organizations) store.organizations = [];
  let org = store.organizations[0];
  if (!org) {
    org = {
      _id: generateId(),
      name: defaultOrgName,
      slug: slugify(defaultOrgName) || 'default',
      status: 'active',
      plan: 'enterprise',
      trialEndsAt: null,
      contactEmail: '',
      contactPhone: '',
      address: '',
      branding: { logoUrl: '', primaryColor: '#2563eb' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    store.organizations.push(org);
  }

  orphanUsers.forEach((u) => { u.orgId = org._id; });
  orphanDocs.forEach((d) => { d.orgId = org._id; });
  saveLocalStore();
  console.log(`[FLEETNOVA] Migrated existing data into organization "${org.name}".`);
  return true;
}
