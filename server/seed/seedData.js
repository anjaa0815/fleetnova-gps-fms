import bcrypt from 'bcryptjs';
import { getLocalStore, saveLocalStore } from '../config/db.js';
import { generateId } from '../models/dataEngine.js';

export async function seedFleetData() {
  const store = getLocalStore();

  // If already seeded with vehicles and users, skip unless forced
  if (store.users && store.users.length > 0 && store.vehicles && store.vehicles.length >= 10) {
    console.log('[FLEETNOVA] Database already seeded with realistic fleet data.');
    return;
  }

  console.log('[FLEETNOVA] Seeding initial commercial fleet data...');

  const salt = await bcrypt.genSalt(10);
  const adminPassword = await bcrypt.hash('admin123', salt);
  const managerPassword = await bcrypt.hash('manager123', salt);
  const driverPassword = await bcrypt.hash('driver123', salt);

  // 1. Users
  const users = [
    {
      _id: generateId(),
      name: 'Rohan Sharma',
      email: 'admin@fleetnova.com',
      password: adminPassword,
      role: 'admin',
      phone: '+91 98765 43210',
      status: 'active',
      createdAt: new Date('2025-01-10').toISOString()
    },
    {
      _id: generateId(),
      name: 'Priya Iyer',
      email: 'manager@fleetnova.com',
      password: managerPassword,
      role: 'fleet_manager',
      phone: '+91 98450 12345',
      status: 'active',
      createdAt: new Date('2025-01-15').toISOString()
    },
    {
      _id: generateId(),
      name: 'Rajesh Kumar',
      email: 'rajesh.kumar@fleetnova.com',
      password: driverPassword,
      role: 'driver',
      phone: '+91 97110 88990',
      status: 'active',
      createdAt: new Date('2025-02-01').toISOString()
    }
  ];

  // 2. Drivers (5 drivers)
  const drivers = [
    {
      _id: generateId(),
      driverId: 'DRV-1001',
      name: 'Rajesh Kumar',
      email: 'rajesh.kumar@fleetnova.com',
      phone: '+91 97110 88990',
      licenseNumber: 'DL-1420110012345',
      licenseExpiry: new Date('2027-08-15').toISOString(),
      dateOfJoining: new Date('2023-03-12').toISOString(),
      assignedVehicle: null,
      status: 'On Trip',
      emergencyContact: '+91 98110 54321 (Spouse)',
      address: 'Sector 62, Noida, Uttar Pradesh',
      notes: 'Specialist in heavy container transport with zero accident record.'
    },
    {
      _id: generateId(),
      driverId: 'DRV-1002',
      name: 'Suresh Patel',
      email: 'suresh.patel@fleetnova.com',
      phone: '+91 98250 33441',
      licenseNumber: 'GJ-0120150098765',
      licenseExpiry: new Date('2026-10-20').toISOString(), // Approaching expiry
      dateOfJoining: new Date('2022-06-18').toISOString(),
      assignedVehicle: null,
      status: 'Available',
      emergencyContact: '+91 98250 99887 (Brother)',
      address: 'Navrangpura, Ahmedabad, Gujarat',
      notes: 'Expert in refrigerated cold chain deliveries.'
    },
    {
      _id: generateId(),
      driverId: 'DRV-1003',
      name: 'Amit Verma',
      email: 'amit.verma@fleetnova.com',
      phone: '+91 99340 77123',
      licenseNumber: 'MH-0220180045612',
      licenseExpiry: new Date('2028-04-10').toISOString(),
      dateOfJoining: new Date('2024-01-05').toISOString(),
      assignedVehicle: null,
      status: 'On Trip',
      emergencyContact: '+91 99340 11223 (Father)',
      address: 'Andheri East, Mumbai, Maharashtra',
      notes: 'Urban multi-drop parcel logistics driver.'
    },
    {
      _id: generateId(),
      driverId: 'DRV-1004',
      name: 'Gurpreet Singh',
      email: 'gurpreet.singh@fleetnova.com',
      phone: '+91 98140 66554',
      licenseNumber: 'PB-1020160078901',
      licenseExpiry: new Date('2027-12-05').toISOString(),
      dateOfJoining: new Date('2021-11-20').toISOString(),
      assignedVehicle: null,
      status: 'Available',
      emergencyContact: '+91 98140 22334 (Uncle)',
      address: 'GT Road, Ludhiana, Punjab',
      notes: 'Cross-country interstate highway freight captain.'
    },
    {
      _id: generateId(),
      driverId: 'DRV-1005',
      name: 'Manoj Pillai',
      email: 'manoj.pillai@fleetnova.com',
      phone: '+91 94470 55112',
      licenseNumber: 'KL-0720190034123',
      licenseExpiry: new Date('2026-10-10').toISOString(), // Approaching expiry
      dateOfJoining: new Date('2023-08-14').toISOString(),
      assignedVehicle: null,
      status: 'Available',
      emergencyContact: '+91 94470 99001 (Sister)',
      address: 'Edapally, Kochi, Kerala',
      notes: 'EV commercial vehicle certified.'
    }
  ];

  // 3. Vehicles (10 vehicles)
  const vehicles = [
    {
      _id: generateId(),
      vehicleId: 'VEH-1001',
      registrationNumber: 'DL-01-AX-9920',
      vehicleType: 'Truck',
      brand: 'Tata Motors',
      model: 'Prima 5530.S',
      manufacturingYear: 2022,
      fuelType: 'Diesel',
      fuelCapacity: 350,
      currentMileage: 84500,
      status: 'On Trip',
      assignedDriver: drivers[0]._id,
      purchaseDate: new Date('2022-04-15').toISOString(),
      insuranceExpiry: new Date('2027-04-15').toISOString(),
      registrationExpiry: new Date('2037-04-15').toISOString(),
      lastServiceDate: new Date('2026-08-10').toISOString(),
      nextServiceDate: new Date('2026-11-10').toISOString(),
      notes: 'Heavy multi-axle freight prime mover.'
    },
    {
      _id: generateId(),
      vehicleId: 'VEH-1002',
      registrationNumber: 'MH-12-RN-4402',
      vehicleType: 'Truck',
      brand: 'Ashok Leyland',
      model: 'AVTR 4220',
      manufacturingYear: 2023,
      fuelType: 'Diesel',
      fuelCapacity: 300,
      currentMileage: 52300,
      status: 'Available',
      assignedDriver: drivers[1]._id,
      purchaseDate: new Date('2023-01-20').toISOString(),
      insuranceExpiry: new Date('2026-10-18').toISOString(), // 24 days left - Warning alert!
      registrationExpiry: new Date('2038-01-20').toISOString(),
      lastServiceDate: new Date('2026-07-15').toISOString(),
      nextServiceDate: new Date('2026-10-15').toISOString(),
      notes: 'Equipped with digital telematics & tire pressure sensor.'
    },
    {
      _id: generateId(),
      vehicleId: 'VEH-1003',
      registrationNumber: 'KA-03-MM-7890',
      vehicleType: 'Van',
      brand: 'Tata Motors',
      model: 'Ace EV Electric',
      manufacturingYear: 2024,
      fuelType: 'Electric',
      fuelCapacity: 21,
      currentMileage: 18400,
      status: 'Available',
      assignedDriver: drivers[4]._id,
      purchaseDate: new Date('2024-02-10').toISOString(),
      insuranceExpiry: new Date('2027-02-10').toISOString(),
      registrationExpiry: new Date('2039-02-10').toISOString(),
      lastServiceDate: new Date('2026-06-25').toISOString(),
      nextServiceDate: new Date('2026-12-25').toISOString(),
      notes: 'Zero emission intra-city parcel courier.'
    },
    {
      _id: generateId(),
      vehicleId: 'VEH-1004',
      registrationNumber: 'TN-09-CB-1122',
      vehicleType: 'Truck',
      brand: 'BharatBenz',
      model: '2823R',
      manufacturingYear: 2021,
      fuelType: 'Diesel',
      fuelCapacity: 380,
      currentMileage: 112000,
      status: 'On Trip',
      assignedDriver: drivers[2]._id,
      purchaseDate: new Date('2021-05-18').toISOString(),
      insuranceExpiry: new Date('2027-05-18').toISOString(),
      registrationExpiry: new Date('2036-05-18').toISOString(),
      lastServiceDate: new Date('2026-08-01').toISOString(),
      nextServiceDate: new Date('2026-11-01').toISOString(),
      notes: 'Long haul refrigerated container cargo.'
    },
    {
      _id: generateId(),
      vehicleId: 'VEH-1005',
      registrationNumber: 'HR-26-DK-5544',
      vehicleType: 'Van',
      brand: 'Mahindra',
      model: 'Bolero Maxi Truck Plus',
      manufacturingYear: 2022,
      fuelType: 'CNG',
      fuelCapacity: 60,
      currentMileage: 64200,
      status: 'Maintenance',
      assignedDriver: null,
      purchaseDate: new Date('2022-09-12').toISOString(),
      insuranceExpiry: new Date('2026-11-12').toISOString(),
      registrationExpiry: new Date('2037-09-12').toISOString(),
      lastServiceDate: new Date('2026-05-14').toISOString(),
      nextServiceDate: new Date('2026-09-15').toISOString(), // Overdue maintenance!
      notes: 'Currently in workshop for complete transmission check.'
    },
    {
      _id: generateId(),
      vehicleId: 'VEH-1006',
      registrationNumber: 'GJ-06-TR-8812',
      vehicleType: 'Bus',
      brand: 'Eicher',
      model: 'Skyline Pro 3009L',
      manufacturingYear: 2023,
      fuelType: 'Diesel',
      fuelCapacity: 160,
      currentMileage: 38900,
      status: 'Available',
      assignedDriver: drivers[3]._id,
      purchaseDate: new Date('2023-03-30').toISOString(),
      insuranceExpiry: new Date('2027-03-30').toISOString(),
      registrationExpiry: new Date('2038-03-30').toISOString(),
      lastServiceDate: new Date('2026-08-15').toISOString(),
      nextServiceDate: new Date('2026-11-15').toISOString(),
      notes: 'Corporate shuttle & airport transfer fleet.'
    },
    {
      _id: generateId(),
      vehicleId: 'VEH-1007',
      registrationNumber: 'UP-32-BN-3390',
      vehicleType: 'Pickup',
      brand: 'Isuzu',
      model: 'D-Max V-Cross',
      manufacturingYear: 2023,
      fuelType: 'Diesel',
      fuelCapacity: 75,
      currentMileage: 41200,
      status: 'Available',
      assignedDriver: null,
      purchaseDate: new Date('2023-07-22').toISOString(),
      insuranceExpiry: new Date('2027-07-22').toISOString(),
      registrationExpiry: new Date('2038-07-22').toISOString(),
      lastServiceDate: new Date('2026-07-20').toISOString(),
      nextServiceDate: new Date('2026-10-20').toISOString(),
      notes: 'Field engineering & emergency breakdown recovery vehicle.'
    },
    {
      _id: generateId(),
      vehicleId: 'VEH-1008',
      registrationNumber: 'WB-02-AL-6710',
      vehicleType: 'Van',
      brand: 'Force Motors',
      model: 'Traveller 3050',
      manufacturingYear: 2021,
      fuelType: 'Diesel',
      fuelCapacity: 70,
      currentMileage: 98400,
      status: 'Available',
      assignedDriver: null,
      purchaseDate: new Date('2021-10-05').toISOString(),
      insuranceExpiry: new Date('2026-10-25').toISOString(), // Warning expiry
      registrationExpiry: new Date('2036-10-05').toISOString(),
      lastServiceDate: new Date('2026-06-10').toISOString(),
      nextServiceDate: new Date('2026-10-10').toISOString(),
      notes: 'High capacity delivery van.'
    },
    {
      _id: generateId(),
      vehicleId: 'VEH-1009',
      registrationNumber: 'TS-07-UK-4411',
      vehicleType: 'Sedan',
      brand: 'Hyundai',
      model: 'Aura CNG',
      manufacturingYear: 2024,
      fuelType: 'CNG',
      fuelCapacity: 65,
      currentMileage: 14500,
      status: 'Available',
      assignedDriver: null,
      purchaseDate: new Date('2024-04-01').toISOString(),
      insuranceExpiry: new Date('2027-04-01').toISOString(),
      registrationExpiry: new Date('2039-04-01').toISOString(),
      lastServiceDate: new Date('2026-08-20').toISOString(),
      nextServiceDate: new Date('2027-02-20').toISOString(),
      notes: 'Executive inspection & client visit vehicle.'
    },
    {
      _id: generateId(),
      vehicleId: 'VEH-1010',
      registrationNumber: 'RJ-14-ZC-9080',
      vehicleType: 'SUV',
      brand: 'Mahindra',
      model: 'Scorpio-N Diesel',
      manufacturingYear: 2023,
      fuelType: 'Diesel',
      fuelCapacity: 60,
      currentMileage: 32000,
      status: 'Available',
      assignedDriver: null,
      purchaseDate: new Date('2023-11-15').toISOString(),
      insuranceExpiry: new Date('2026-11-15').toISOString(),
      registrationExpiry: new Date('2038-11-15').toISOString(),
      lastServiceDate: new Date('2026-07-01').toISOString(),
      nextServiceDate: new Date('2026-11-01').toISOString(),
      notes: 'Site inspection & rugged terrain escort.'
    }
  ];

  // Assign vehicle refs to drivers
  drivers[0].assignedVehicle = vehicles[0]._id;
  drivers[1].assignedVehicle = vehicles[1]._id;
  drivers[2].assignedVehicle = vehicles[3]._id;
  drivers[3].assignedVehicle = vehicles[5]._id;
  drivers[4].assignedVehicle = vehicles[2]._id;

  // 4. Trips (15 trips)
  const trips = [
    {
      _id: generateId(),
      tripId: 'TRIP-1001',
      vehicle: vehicles[0]._id,
      driver: drivers[0]._id,
      source: 'New Delhi ICD',
      destination: 'Mundra Port, Gujarat',
      startDate: new Date('2026-09-22T08:00:00Z').toISOString(),
      expectedEndDate: new Date('2026-09-25T18:00:00Z').toISOString(),
      actualEndDate: null,
      distance: 1140,
      purpose: 'Export Electronics Consignment',
      fuelUsed: 290,
      tripExpense: 8500,
      status: 'In Progress',
      notes: 'High value export shipment. Speed governor verified.'
    },
    {
      _id: generateId(),
      tripId: 'TRIP-1002',
      vehicle: vehicles[3]._id,
      driver: drivers[2]._id,
      source: 'JNPT Port, Mumbai',
      destination: 'Whitefield, Bengaluru',
      startDate: new Date('2026-09-23T06:00:00Z').toISOString(),
      expectedEndDate: new Date('2026-09-26T14:00:00Z').toISOString(),
      actualEndDate: null,
      distance: 980,
      purpose: 'Pharmaceutical Supplies (Cold Chain)',
      fuelUsed: 240,
      tripExpense: 7200,
      status: 'In Progress',
      notes: 'Continuous temperature monitoring active (+4C).'
    },
    {
      _id: generateId(),
      tripId: 'TRIP-1003',
      vehicle: vehicles[1]._id,
      driver: drivers[1]._id,
      source: 'Pune Automotive Park',
      destination: 'Chennai Oragadam Hub',
      startDate: new Date('2026-09-15T09:00:00Z').toISOString(),
      expectedEndDate: new Date('2026-09-18T18:00:00Z').toISOString(),
      actualEndDate: new Date('2026-09-18T17:30:00Z').toISOString(),
      distance: 1180,
      purpose: 'Auto Ancillary Spare Parts',
      fuelUsed: 310,
      tripExpense: 9200,
      status: 'Completed',
      notes: 'Delivered on schedule with complete proof of delivery.'
    },
    {
      _id: generateId(),
      tripId: 'TRIP-1004',
      vehicle: vehicles[2]._id,
      driver: drivers[4]._id,
      source: 'Bengaluru Central Hub',
      destination: 'Electronic City Phase 2',
      startDate: new Date('2026-09-19T07:30:00Z').toISOString(),
      expectedEndDate: new Date('2026-09-19T16:00:00Z').toISOString(),
      actualEndDate: new Date('2026-09-19T15:45:00Z').toISOString(),
      distance: 65,
      purpose: 'E-commerce FMCG Last Mile Delivery',
      fuelUsed: 14,
      tripExpense: 450,
      status: 'Completed',
      notes: 'Electric delivery test successfully completed.'
    },
    {
      _id: generateId(),
      tripId: 'TRIP-1005',
      vehicle: vehicles[5]._id,
      driver: drivers[3]._id,
      source: 'Ahmedabad Airport',
      destination: 'Gandhinagar GIFT City',
      startDate: new Date('2026-09-20T10:00:00Z').toISOString(),
      expectedEndDate: new Date('2026-09-20T19:00:00Z').toISOString(),
      actualEndDate: new Date('2026-09-20T18:40:00Z').toISOString(),
      distance: 85,
      purpose: 'VIP Financial Delegation Transit',
      fuelUsed: 22,
      tripExpense: 800,
      status: 'Completed',
      notes: 'Client satisfaction rated 5/5.'
    },
    {
      _id: generateId(),
      tripId: 'TRIP-1006',
      vehicle: vehicles[6]._id,
      driver: drivers[1]._id,
      source: 'Lucknow Transport Nagar',
      destination: 'Kanpur Industrial Area',
      startDate: new Date('2026-09-12T08:00:00Z').toISOString(),
      expectedEndDate: new Date('2026-09-12T17:00:00Z').toISOString(),
      actualEndDate: new Date('2026-09-12T16:30:00Z').toISOString(),
      distance: 190,
      purpose: 'Machinery Tooling Parts',
      fuelUsed: 36,
      tripExpense: 1400,
      status: 'Completed',
      notes: 'Smooth delivery.'
    },
    {
      _id: generateId(),
      tripId: 'TRIP-1007',
      vehicle: vehicles[7]._id,
      driver: drivers[3]._id,
      source: 'Kolkata Dankuni Freight Yard',
      destination: 'Siliguri Logistics Junction',
      startDate: new Date('2026-09-08T07:00:00Z').toISOString(),
      expectedEndDate: new Date('2026-09-10T12:00:00Z').toISOString(),
      actualEndDate: new Date('2026-09-10T11:20:00Z').toISOString(),
      distance: 575,
      purpose: 'Tea & Consumer Packaged Goods',
      fuelUsed: 130,
      tripExpense: 4200,
      status: 'Completed',
      notes: 'Highway tolls recorded via FASTag.'
    },
    {
      _id: generateId(),
      tripId: 'TRIP-1008',
      vehicle: vehicles[0]._id,
      driver: drivers[0]._id,
      source: 'Gurugram Warehouse',
      destination: 'Jaipur Sitapura Hub',
      startDate: new Date('2026-09-02T06:00:00Z').toISOString(),
      expectedEndDate: new Date('2026-09-03T14:00:00Z').toISOString(),
      actualEndDate: new Date('2026-09-03T13:10:00Z').toISOString(),
      distance: 260,
      purpose: 'Textile Fabric Export Bundles',
      fuelUsed: 75,
      tripExpense: 2200,
      status: 'Completed',
      notes: 'Direct delivery completed.'
    },
    {
      _id: generateId(),
      tripId: 'TRIP-1009',
      vehicle: vehicles[1]._id,
      driver: drivers[1]._id,
      source: 'Mumbai Bhiwandi',
      destination: 'Surat Ring Road Warehouse',
      startDate: new Date('2026-08-28T09:00:00Z').toISOString(),
      expectedEndDate: new Date('2026-08-29T15:00:00Z').toISOString(),
      actualEndDate: new Date('2026-08-29T14:45:00Z').toISOString(),
      distance: 270,
      purpose: 'Diamond Tools & High Precision Goods',
      fuelUsed: 78,
      tripExpense: 2600,
      status: 'Completed',
      notes: 'Escorted container logistics.'
    },
    {
      _id: generateId(),
      tripId: 'TRIP-1010',
      vehicle: vehicles[3]._id,
      driver: drivers[2]._id,
      source: 'Chennai Port',
      destination: 'Hyderabad Shamshabad Cargo',
      startDate: new Date('2026-08-20T08:00:00Z').toISOString(),
      expectedEndDate: new Date('2026-08-22T16:00:00Z').toISOString(),
      actualEndDate: new Date('2026-08-22T15:10:00Z').toISOString(),
      distance: 640,
      purpose: 'Aerospace Engineering Components',
      fuelUsed: 175,
      tripExpense: 5100,
      status: 'Completed',
      notes: 'Critical supply line cleared.'
    },
    {
      _id: generateId(),
      tripId: 'TRIP-1011',
      vehicle: vehicles[5]._id,
      driver: drivers[3]._id,
      source: 'Vadodara Terminal',
      destination: 'Rajkot Highway Hub',
      startDate: new Date('2026-08-14T07:00:00Z').toISOString(),
      expectedEndDate: new Date('2026-08-14T19:00:00Z').toISOString(),
      actualEndDate: new Date('2026-08-14T18:20:00Z').toISOString(),
      distance: 240,
      purpose: 'Intercity Passenger Tour Group',
      fuelUsed: 62,
      tripExpense: 1800,
      status: 'Completed',
      notes: 'AC bus service.'
    },
    {
      _id: generateId(),
      tripId: 'TRIP-1012',
      vehicle: vehicles[6]._id,
      driver: drivers[4]._id,
      source: 'Hyderabad Hitec City',
      destination: 'Warangal Sub-station',
      startDate: new Date('2026-09-28T08:00:00Z').toISOString(),
      expectedEndDate: new Date('2026-09-29T18:00:00Z').toISOString(),
      actualEndDate: null,
      distance: 150,
      purpose: 'Solar Panel Maintenance Kit Delivery',
      fuelUsed: 0,
      tripExpense: 1200,
      status: 'Scheduled',
      notes: 'Scheduled for upcoming dispatch.'
    },
    {
      _id: generateId(),
      tripId: 'TRIP-1013',
      vehicle: vehicles[9]._id,
      driver: drivers[3]._id,
      source: 'Jaipur MI Road',
      destination: 'Jodhpur Industrial Estate',
      startDate: new Date('2026-09-29T09:00:00Z').toISOString(),
      expectedEndDate: new Date('2026-09-30T17:00:00Z').toISOString(),
      actualEndDate: null,
      distance: 330,
      purpose: 'Senior Audit Inspection Route',
      fuelUsed: 0,
      tripExpense: 2000,
      status: 'Scheduled',
      notes: 'Official company escort.'
    },
    {
      _id: generateId(),
      tripId: 'TRIP-1014',
      vehicle: vehicles[1]._id,
      driver: drivers[1]._id,
      source: 'Nagpur Multi-Modal Hub',
      destination: 'Raipur Logistics Park',
      startDate: new Date('2026-08-05T08:00:00Z').toISOString(),
      expectedEndDate: new Date('2026-08-06T18:00:00Z').toISOString(),
      actualEndDate: new Date('2026-08-06T17:40:00Z').toISOString(),
      distance: 285,
      purpose: 'Steel & Ferroalloy Deliveries',
      fuelUsed: 80,
      tripExpense: 2500,
      status: 'Completed',
      notes: 'Weighbridge slip confirmed.'
    },
    {
      _id: generateId(),
      tripId: 'TRIP-1015',
      vehicle: vehicles[4]._id,
      driver: drivers[0]._id,
      source: 'Chandigarh Transport Yard',
      destination: 'Shimla Mall Road Distribution',
      startDate: new Date('2026-08-01T06:00:00Z').toISOString(),
      expectedEndDate: new Date('2026-08-02T12:00:00Z').toISOString(),
      actualEndDate: null,
      distance: 120,
      purpose: 'Emergency Fruit Harvest',
      fuelUsed: 0,
      tripExpense: 0,
      status: 'Cancelled',
      notes: 'Trip cancelled due to extreme monsoon landslide warning on NH-5.'
    }
  ];

  // 5. Fuel Records (12 records)
  const fuels = [
    {
      _id: generateId(),
      fuelRecordId: 'FUEL-1001',
      vehicle: vehicles[0]._id,
      date: new Date('2026-09-22T09:30:00Z').toISOString(),
      fuelType: 'Diesel',
      quantity: 220,
      pricePerLiter: 89.60,
      totalCost: 19712,
      odometerReading: 83900,
      fuelStation: 'Indian Oil Highway Care, Behror NH-48',
      driver: drivers[0]._id,
      notes: 'Tank filled before western corridor run.'
    },
    {
      _id: generateId(),
      fuelRecordId: 'FUEL-1002',
      vehicle: vehicles[3]._id,
      date: new Date('2026-09-23T07:15:00Z').toISOString(),
      fuelType: 'Diesel',
      quantity: 200,
      pricePerLiter: 90.20,
      totalCost: 18040,
      odometerReading: 111400,
      fuelStation: 'Bharat Petroleum COCO, Khalapur Expressway',
      driver: drivers[2]._id,
      notes: 'Automated fuel card payment.'
    },
    {
      _id: generateId(),
      fuelRecordId: 'FUEL-1003',
      vehicle: vehicles[1]._id,
      date: new Date('2026-09-15T11:00:00Z').toISOString(),
      fuelType: 'Diesel',
      quantity: 180,
      pricePerLiter: 89.50,
      totalCost: 16110,
      odometerReading: 51200,
      fuelStation: 'HPCL Super Fuel, Kolhapur Bypass',
      driver: drivers[1]._id,
      notes: 'Includes DEF fluid check.'
    },
    {
      _id: generateId(),
      fuelRecordId: 'FUEL-1004',
      vehicle: vehicles[4]._id,
      date: new Date('2026-09-10T14:20:00Z').toISOString(),
      fuelType: 'CNG',
      quantity: 38,
      pricePerLiter: 79.40,
      totalCost: 3017.2,
      odometerReading: 63800,
      fuelStation: 'Indraprastha Gas Limited, Manesar Sector 3',
      driver: drivers[0]._id,
      notes: 'Full cylinder pressurization 200 bar.'
    },
    {
      _id: generateId(),
      fuelRecordId: 'FUEL-1005',
      vehicle: vehicles[5]._id,
      date: new Date('2026-09-19T16:00:00Z').toISOString(),
      fuelType: 'Diesel',
      quantity: 110,
      pricePerLiter: 90.00,
      totalCost: 9900,
      odometerReading: 38400,
      fuelStation: 'Reliance Petro Petroleum, Sanand Cross Road',
      driver: drivers[3]._id,
      notes: 'Pre-charter refuel.'
    },
    {
      _id: generateId(),
      fuelRecordId: 'FUEL-1006',
      vehicle: vehicles[6]._id,
      date: new Date('2026-09-12T09:00:00Z').toISOString(),
      fuelType: 'Diesel',
      quantity: 55,
      pricePerLiter: 89.70,
      totalCost: 4933.5,
      odometerReading: 40900,
      fuelStation: 'Indian Oil Swagat, Unnao Toll',
      driver: drivers[1]._id,
      notes: 'Standard diesel refill.'
    },
    {
      _id: generateId(),
      fuelRecordId: 'FUEL-1007',
      vehicle: vehicles[7]._id,
      date: new Date('2026-09-08T08:30:00Z').toISOString(),
      fuelType: 'Diesel',
      quantity: 95,
      pricePerLiter: 91.10,
      totalCost: 8654.5,
      odometerReading: 97800,
      fuelStation: 'BPCL Oasis, Burdwan Highway',
      driver: drivers[3]._id,
      notes: 'Long haul refill.'
    },
    {
      _id: generateId(),
      fuelRecordId: 'FUEL-1008',
      vehicle: vehicles[8]._id,
      date: new Date('2026-09-14T10:15:00Z').toISOString(),
      fuelType: 'CNG',
      quantity: 35,
      pricePerLiter: 82.50,
      totalCost: 2887.5,
      odometerReading: 14200,
      fuelStation: 'Bhagyanagar Gas, Madhapur',
      driver: drivers[4]._id,
      notes: 'City pool refill.'
    },
    {
      _id: generateId(),
      fuelRecordId: 'FUEL-1009',
      vehicle: vehicles[9]._id,
      date: new Date('2026-09-18T12:00:00Z').toISOString(),
      fuelType: 'Diesel',
      quantity: 50,
      pricePerLiter: 92.40,
      totalCost: 4620,
      odometerReading: 31600,
      fuelStation: 'IOCL Highway Service, Ajmer Road',
      driver: drivers[3]._id,
      notes: 'Scorpio fuel top-up.'
    },
    {
      _id: generateId(),
      fuelRecordId: 'FUEL-1010',
      vehicle: vehicles[0]._id,
      date: new Date('2026-08-30T15:45:00Z').toISOString(),
      fuelType: 'Diesel',
      quantity: 210,
      pricePerLiter: 89.20,
      totalCost: 18732,
      odometerReading: 82100,
      fuelStation: 'Nayara Energy Highway Hub, Rewari',
      driver: drivers[0]._id,
      notes: 'End of August scheduled fuel fill.'
    }
  ];

  // 6. Maintenance Records (8 records)
  const maintenances = [
    {
      _id: generateId(),
      maintenanceId: 'MNT-1001',
      vehicle: vehicles[4]._id, // VEH-1005 (Bolero)
      maintenanceType: 'Engine Service',
      description: 'Complete transmission overhaul, clutch plate replacement & fuel pump calibration',
      serviceDate: new Date('2026-09-16T10:00:00Z').toISOString(),
      nextServiceDate: new Date('2026-12-16T10:00:00Z').toISOString(),
      cost: 24500,
      serviceCenter: 'Mahindra Authorized Commercial Workshop, Gurgaon',
      status: 'In Progress',
      notes: 'Parts ordered from OEM central depot; expected delivery by tomorrow.'
    },
    {
      _id: generateId(),
      maintenanceId: 'MNT-1002',
      vehicle: vehicles[1]._id, // VEH-1002
      maintenanceType: 'Brake Service',
      description: 'Air brake shoe adjustment, lining replacement & ABS sensor diagnostic',
      serviceDate: new Date('2026-09-28T09:00:00Z').toISOString(),
      nextServiceDate: new Date('2026-10-15T09:00:00Z').toISOString(), // Due soon!
      cost: 11800,
      serviceCenter: 'Ashok Leyland Service Zone, Chakan Pune',
      status: 'Scheduled',
      notes: 'Preventive maintenance scheduled before southern coastal tour.'
    },
    {
      _id: generateId(),
      maintenanceId: 'MNT-1003',
      vehicle: vehicles[0]._id, // VEH-1001
      maintenanceType: 'Regular Service',
      description: '80,000 km Major Service: Synthetic engine oil replacement, lube filters & DEF system check',
      serviceDate: new Date('2026-08-10T08:30:00Z').toISOString(),
      nextServiceDate: new Date('2026-11-10T08:30:00Z').toISOString(),
      cost: 18400,
      serviceCenter: 'Tata Motors Commercial Hub, Okhla New Delhi',
      status: 'Completed',
      notes: 'Engine tuning certified Euro VI compliant.'
    },
    {
      _id: generateId(),
      maintenanceId: 'MNT-1004',
      vehicle: vehicles[2]._id, // VEH-1003 (Ace EV)
      maintenanceType: 'Regular Service',
      description: 'EV Battery health diagnostic, motor coolant replenishment & regenerative braking check',
      serviceDate: new Date('2026-06-25T11:00:00Z').toISOString(),
      nextServiceDate: new Date('2026-12-25T11:00:00Z').toISOString(),
      cost: 4200,
      serviceCenter: 'Tata EV Commercial Workshop, Hosur Road Bengaluru',
      status: 'Completed',
      notes: 'High voltage battery degradation < 1.2%, excellent state of health.'
    },
    {
      _id: generateId(),
      maintenanceId: 'MNT-1005',
      vehicle: vehicles[3]._id, // VEH-1004
      maintenanceType: 'Tire Replacement',
      description: 'Rear dual-axle radial tires replacement (4 new Apollo EnduRace RD tires) + wheel alignment',
      serviceDate: new Date('2026-08-01T10:00:00Z').toISOString(),
      nextServiceDate: new Date('2026-11-01T10:00:00Z').toISOString(),
      cost: 48000,
      serviceCenter: 'Apollo Commercial Tyres Center, Poonamallee Chennai',
      status: 'Completed',
      notes: 'Tire serial numbers registered with warranty portal.'
    },
    {
      _id: generateId(),
      maintenanceId: 'MNT-1006',
      vehicle: vehicles[5]._id, // VEH-1006
      maintenanceType: 'Oil Change',
      description: 'Transmission fluid flush and rear differential oil replacement',
      serviceDate: new Date('2026-08-15T09:30:00Z').toISOString(),
      nextServiceDate: new Date('2026-11-15T09:30:00Z').toISOString(),
      cost: 7500,
      serviceCenter: 'Eicher Motors Express Service, Sarkhej Ahmedabad',
      status: 'Completed',
      notes: 'Oil sample clean, zero metal fragments.'
    },
    {
      _id: generateId(),
      maintenanceId: 'MNT-1007',
      vehicle: vehicles[7]._id, // VEH-1008
      maintenanceType: 'Repair',
      description: 'Suspension leaf spring bushing replacement and shock absorber re-alignment',
      serviceDate: new Date('2026-06-10T14:00:00Z').toISOString(),
      nextServiceDate: new Date('2026-10-10T14:00:00Z').toISOString(), // Due soon!
      cost: 9600,
      serviceCenter: 'Force Motors Authorised Center, Howrah West Bengal',
      status: 'Completed',
      notes: 'Ride quality restored.'
    }
  ];

  // 7. Expenses (14 records)
  const expenses = [
    {
      _id: generateId(),
      expenseId: 'EXP-1001',
      vehicle: vehicles[0]._id,
      category: 'Fuel',
      amount: 19712,
      date: new Date('2026-09-22T09:30:00Z').toISOString(),
      description: 'Fuel refill 220L (Diesel) at Indian Oil Highway Care',
      driver: drivers[0]._id,
      trip: trips[0]._id,
      paymentMethod: 'Fuel Card'
    },
    {
      _id: generateId(),
      expenseId: 'EXP-1002',
      vehicle: vehicles[3]._id,
      category: 'Fuel',
      amount: 18040,
      date: new Date('2026-09-23T07:15:00Z').toISOString(),
      description: 'Fuel refill 200L (Diesel) at BPCL Khalapur Expressway',
      driver: drivers[2]._id,
      trip: trips[1]._id,
      paymentMethod: 'Fuel Card'
    },
    {
      _id: generateId(),
      expenseId: 'EXP-1003',
      vehicle: vehicles[4]._id,
      category: 'Maintenance',
      amount: 24500,
      date: new Date('2026-09-16T10:00:00Z').toISOString(),
      description: 'Transmission overhaul & clutch plate replacement at Mahindra Gurgaon',
      driver: null,
      paymentMethod: 'Company Card'
    },
    {
      _id: generateId(),
      vehicle: vehicles[3]._id,
      category: 'Maintenance',
      amount: 48000,
      date: new Date('2026-08-01T10:00:00Z').toISOString(),
      description: 'Radial tires replacement (4 units) at Apollo Chennai',
      driver: null,
      paymentMethod: 'Bank Transfer'
    },
    {
      _id: generateId(),
      expenseId: 'EXP-1005',
      vehicle: vehicles[0]._id,
      category: 'Toll',
      amount: 4200,
      date: new Date('2026-09-22T14:00:00Z').toISOString(),
      description: 'FASTag Interstate electronic highway toll plaza charges (Delhi - Gujarat corridor)',
      driver: drivers[0]._id,
      trip: trips[0]._id,
      paymentMethod: 'Company Card'
    },
    {
      _id: generateId(),
      expenseId: 'EXP-1006',
      vehicle: vehicles[3]._id,
      category: 'Toll',
      amount: 3600,
      date: new Date('2026-09-23T11:30:00Z').toISOString(),
      description: 'FASTag Mumbai - Pune Expressway & NH-48 electronic tolls',
      driver: drivers[2]._id,
      trip: trips[1]._id,
      paymentMethod: 'Company Card'
    },
    {
      _id: generateId(),
      expenseId: 'EXP-1007',
      vehicle: vehicles[1]._id,
      category: 'Insurance',
      amount: 42000,
      date: new Date('2026-04-10T10:00:00Z').toISOString(),
      description: 'Commercial fleet comprehensive insurance annual renewal premium (ICICI Lombard)',
      driver: null,
      paymentMethod: 'Bank Transfer'
    },
    {
      _id: generateId(),
      expenseId: 'EXP-1008',
      vehicle: vehicles[0]._id,
      category: 'Trip',
      amount: 3500,
      date: new Date('2026-09-22T20:00:00Z').toISOString(),
      description: 'Driver per-diem road allowance, parking & state permit cess',
      driver: drivers[0]._id,
      trip: trips[0]._id,
      paymentMethod: 'UPI'
    },
    {
      _id: generateId(),
      expenseId: 'EXP-1009',
      vehicle: vehicles[5]._id,
      category: 'Fuel',
      amount: 9900,
      date: new Date('2026-09-19T16:00:00Z').toISOString(),
      description: 'Fuel refill 110L (Diesel) for Eicher Skyline Pro',
      driver: drivers[3]._id,
      paymentMethod: 'Fuel Card'
    },
    {
      _id: generateId(),
      expenseId: 'EXP-1010',
      vehicle: vehicles[1]._id,
      category: 'Repair',
      amount: 5400,
      date: new Date('2026-08-18T14:30:00Z').toISOString(),
      description: 'Air conditioning gas refill & blower motor brush replacement',
      driver: drivers[1]._id,
      paymentMethod: 'Company Card'
    },
    {
      _id: generateId(),
      expenseId: 'EXP-1011',
      vehicle: vehicles[7]._id,
      category: 'Other',
      amount: 2800,
      date: new Date('2026-09-05T10:00:00Z').toISOString(),
      description: 'State pollution under control (PUC) & GPS AIS-140 fitness renewal certificates',
      driver: null,
      paymentMethod: 'UPI'
    }
  ];

  // 8. Notifications (6 records)
  const notifications = [
    {
      _id: generateId(),
      user: null,
      type: 'maintenance_due',
      title: 'Vehicle Service Scheduled',
      message: 'Vehicle MH-12-RN-4402 (Ashok Leyland AVTR) scheduled for Brake Service at Pune on 28 Sep 2026.',
      isRead: false,
      relatedEntity: 'Vehicle',
      relatedEntityId: vehicles[1]._id,
      createdAt: new Date('2026-09-24T05:00:00Z').toISOString()
    },
    {
      _id: generateId(),
      user: null,
      type: 'maintenance_overdue',
      title: 'Maintenance Service Overdue',
      message: 'Vehicle HR-26-DK-5544 scheduled maintenance service was due on 15 Sep 2026. Vehicle currently in workshop.',
      isRead: false,
      relatedEntity: 'Vehicle',
      relatedEntityId: vehicles[4]._id,
      createdAt: new Date('2026-09-24T06:30:00Z').toISOString()
    },
    {
      _id: generateId(),
      user: null,
      type: 'insurance_expiry',
      title: 'Vehicle Insurance Expiry Imminent',
      message: 'Vehicle MH-12-RN-4402 insurance expires in 24 days (18 Oct 2026). Immediate renewal advised.',
      isRead: false,
      relatedEntity: 'Vehicle',
      relatedEntityId: vehicles[1]._id,
      createdAt: new Date('2026-09-24T07:15:00Z').toISOString()
    },
    {
      _id: generateId(),
      user: null,
      type: 'license_expiry',
      title: 'Driver License Expiry Imminent',
      message: 'Driver Suresh Patel commercial heavy vehicle license expires in 26 days (20 Oct 2026).',
      isRead: false,
      relatedEntity: 'Driver',
      relatedEntityId: drivers[1]._id,
      createdAt: new Date('2026-09-23T11:00:00Z').toISOString()
    },
    {
      _id: generateId(),
      user: null,
      type: 'trip_started',
      title: 'Trip In Progress',
      message: 'Trip TRIP-1001 departed: Tata Prima DL-01-AX-9920 on Delhi to Mundra Port route.',
      isRead: true,
      relatedEntity: 'Trip',
      relatedEntityId: trips[0]._id,
      createdAt: new Date('2026-09-22T08:05:00Z').toISOString()
    },
    {
      _id: generateId(),
      user: null,
      type: 'trip_completed',
      title: 'Trip Completed Successfully',
      message: 'Trip TRIP-1003 arrived at Chennai Oragadam Hub (1,180 km). Proof of Delivery verified.',
      isRead: true,
      relatedEntity: 'Trip',
      relatedEntityId: trips[2]._id,
      createdAt: new Date('2026-09-18T17:35:00Z').toISOString()
    }
  ];

  // Write all to store
  store.users = users;
  store.drivers = drivers;
  store.vehicles = vehicles;
  store.trips = trips;
  store.fuels = fuels;
  store.maintenances = maintenances;
  store.expenses = expenses;
  store.notifications = notifications;

  saveLocalStore();
  console.log('[FLEETNOVA] Successfully seeded: 3 Users, 5 Drivers, 10 Vehicles, 15 Trips, 10 Fuel logs, 7 Maintenance logs, 11 Expenses, 6 Notifications.');
}

// Allow direct execution via CLI `node seedData.js` or `npm run seed`
if (process.argv[1] && process.argv[1].endsWith('seedData.js')) {
  seedFleetData().then(() => {
    console.log('[FLEETNOVA] CLI Seed execution finished.');
    process.exit(0);
  });
}
