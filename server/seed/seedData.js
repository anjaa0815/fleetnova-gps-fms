import bcrypt from 'bcryptjs';
import { getLocalStore, saveLocalStore } from '../config/db.js';
import { generateId } from '../models/dataEngine.js';

const iso = (value) => new Date(value).toISOString();

async function bootstrapAdmin(store) {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || (store.users && store.users.length > 0)) return;
  if (password.length < 8) {
    console.warn('[FLEETNOVA] ADMIN_PASSWORD must be at least 8 characters; admin not created.');
    return;
  }
  store.users = [{
    _id: generateId(),
    name: 'Administrator',
    email: email.toLowerCase(),
    password: await bcrypt.hash(password, 10),
    role: 'admin',
    phone: '',
    status: 'active',
    createdAt: new Date().toISOString()
  }];
  saveLocalStore();
  console.log('[FLEETNOVA] Initial admin account created from ADMIN_EMAIL / ADMIN_PASSWORD.');
}

export async function seedFleetData() {
  const store = getLocalStore();

  // Demo data ships with well-known default passwords: never seed it in production unless explicitly requested
  if (process.env.NODE_ENV === 'production' && process.env.SEED_DEMO_DATA !== 'true') {
    await bootstrapAdmin(store);
    return;
  }

  // If already seeded with vehicles and users, skip unless forced
  if (store.users && store.users.length > 0 && store.vehicles && store.vehicles.length >= 10) {
    console.log('[FLEETNOVA] Database already seeded with realistic fleet data.');
    return;
  }

  console.log('[FLEETNOVA] Seeding initial commercial fleet data (Mongolia, amounts in MNT)...');

  const salt = await bcrypt.genSalt(10);
  const adminPassword = await bcrypt.hash('admin123', salt);
  const managerPassword = await bcrypt.hash('manager123', salt);
  const driverPassword = await bcrypt.hash('driver123', salt);

  // 1. Users
  const users = [
    {
      _id: generateId(),
      name: 'Д.Бат-Эрдэнэ',
      email: 'admin@fleetnova.com',
      password: adminPassword,
      role: 'admin',
      phone: '+976 9911 2233',
      status: 'active',
      createdAt: iso('2025-01-10')
    },
    {
      _id: generateId(),
      name: 'Б.Оюунчимэг',
      email: 'manager@fleetnova.com',
      password: managerPassword,
      role: 'fleet_manager',
      phone: '+976 9919 4455',
      status: 'active',
      createdAt: iso('2025-01-15')
    },
    {
      _id: generateId(),
      name: 'Г.Төмөрбаатар',
      email: 'driver@fleetnova.com',
      password: driverPassword,
      role: 'driver',
      phone: '+976 9505 8899',
      status: 'active',
      createdAt: iso('2025-02-01')
    }
  ];

  // 2. Drivers (5 drivers)
  const drivers = [
    {
      _id: generateId(),
      driverId: 'DRV-1001',
      name: 'Г.Төмөрбаатар',
      email: 'driver@fleetnova.com',
      phone: '+976 9505 8899',
      licenseNumber: 'УБ-87012345',
      licenseExpiry: iso('2027-08-15'),
      dateOfJoining: iso('2023-03-12'),
      assignedVehicle: null,
      status: 'On Trip',
      emergencyContact: '+976 9911 5432 (Эхнэр)',
      address: 'Баянгол дүүрэг, 16-р хороо, Улаанбаатар',
      notes: 'Чингэлэг тээврийн мэргэшсэн жолооч, осолгүй ажилласан туршлагатай.'
    },
    {
      _id: generateId(),
      driverId: 'DRV-1002',
      name: 'Н.Эрдэнэбат',
      email: 'erdenebat@fleetnova.com',
      phone: '+976 9925 3344',
      licenseNumber: 'ДА-92045612',
      licenseExpiry: iso('2026-10-20'), // Approaching expiry
      dateOfJoining: iso('2022-06-18'),
      assignedVehicle: null,
      status: 'Available',
      emergencyContact: '+976 9925 9988 (Ах)',
      address: 'Дархан хот, 3-р баг, Дархан-Уул аймаг',
      notes: 'Хүйтэн хэлхээний (хөргөгчтэй) хүргэлтийн мэргэжилтэн.'
    },
    {
      _id: generateId(),
      driverId: 'DRV-1003',
      name: 'Ч.Мөнхбат',
      email: 'munkhbat@fleetnova.com',
      phone: '+976 9934 7712',
      licenseNumber: 'УБ-90078123',
      licenseExpiry: iso('2028-04-10'),
      dateOfJoining: iso('2024-01-05'),
      assignedVehicle: null,
      status: 'On Trip',
      emergencyContact: '+976 9934 1122 (Аав)',
      address: 'Сүхбаатар дүүрэг, 8-р хороо, Улаанбаатар',
      notes: 'Хотын доторх олон цэгт ачаа, илгээмжийн жолооч.'
    },
    {
      _id: generateId(),
      driverId: 'DRV-1004',
      name: 'Б.Ганбаатар',
      email: 'ganbaatar@fleetnova.com',
      phone: '+976 9914 6655',
      licenseNumber: 'ЭР-88034567',
      licenseExpiry: iso('2027-12-05'),
      dateOfJoining: iso('2021-11-20'),
      assignedVehicle: null,
      status: 'Available',
      emergencyContact: '+976 9914 2233 (Авга ах)',
      address: 'Эрдэнэт хот, Баян-Өндөр, Орхон аймаг',
      notes: 'Хот хоорондын алсын зайн тээврийн ахлах жолооч.'
    },
    {
      _id: generateId(),
      driverId: 'DRV-1005',
      name: 'О.Алтанцэцэг',
      email: 'altantsetseg@fleetnova.com',
      phone: '+976 9447 5511',
      licenseNumber: 'УБ-95023412',
      licenseExpiry: iso('2026-10-10'), // Approaching expiry
      dateOfJoining: iso('2023-08-14'),
      assignedVehicle: null,
      status: 'Available',
      emergencyContact: '+976 9447 9900 (Эгч)',
      address: 'Хан-Уул дүүрэг, 11-р хороо, Улаанбаатар',
      notes: 'Цахилгаан тээврийн хэрэгслийн гэрчилгээтэй жолооч.'
    }
  ];

  // 3. Vehicles (10 vehicles)
  const vehicles = [
    {
      _id: generateId(),
      vehicleId: 'VEH-1001',
      registrationNumber: '8821 УБА',
      vehicleType: 'Truck',
      brand: 'Sinotruk',
      model: 'HOWO A7',
      manufacturingYear: 2022,
      fuelType: 'Diesel',
      fuelCapacity: 350,
      currentMileage: 84500,
      status: 'On Trip',
      assignedDriver: drivers[0]._id,
      purchaseDate: iso('2022-04-15'),
      insuranceExpiry: iso('2027-04-15'),
      registrationExpiry: iso('2037-04-15'),
      lastServiceDate: iso('2026-08-10'),
      nextServiceDate: iso('2026-11-10'),
      notes: 'Олон тэнхлэгт хүнд даацын чирэгч.'
    },
    {
      _id: generateId(),
      vehicleId: 'VEH-1002',
      registrationNumber: '4402 УБЕ',
      vehicleType: 'Truck',
      brand: 'Shacman',
      model: 'X3000',
      manufacturingYear: 2023,
      fuelType: 'Diesel',
      fuelCapacity: 300,
      currentMileage: 52300,
      status: 'Available',
      assignedDriver: drivers[1]._id,
      purchaseDate: iso('2023-01-20'),
      insuranceExpiry: iso('2026-10-18'), // Warning alert!
      registrationExpiry: iso('2038-01-20'),
      lastServiceDate: iso('2026-07-15'),
      nextServiceDate: iso('2026-10-15'),
      notes: 'GPS болон дугуйн даралтын мэдрэгчтэй.'
    },
    {
      _id: generateId(),
      vehicleId: 'VEH-1003',
      registrationNumber: '7890 УНА',
      vehicleType: 'Van',
      brand: 'BYD',
      model: 'T3 Electric',
      manufacturingYear: 2024,
      fuelType: 'Electric',
      fuelCapacity: 50,
      currentMileage: 18400,
      status: 'Available',
      assignedDriver: drivers[4]._id,
      purchaseDate: iso('2024-02-10'),
      insuranceExpiry: iso('2027-02-10'),
      registrationExpiry: iso('2039-02-10'),
      lastServiceDate: iso('2026-06-25'),
      nextServiceDate: iso('2026-12-25'),
      notes: 'Хотын доторх илгээмж хүргэлтийн утааггүй цахилгаан фургон.'
    },
    {
      _id: generateId(),
      vehicleId: 'VEH-1004',
      registrationNumber: '1122 ДАА',
      vehicleType: 'Truck',
      brand: 'Hino',
      model: '500 FM',
      manufacturingYear: 2021,
      fuelType: 'Diesel',
      fuelCapacity: 380,
      currentMileage: 112000,
      status: 'On Trip',
      assignedDriver: drivers[2]._id,
      purchaseDate: iso('2021-05-18'),
      insuranceExpiry: iso('2027-05-18'),
      registrationExpiry: iso('2036-05-18'),
      lastServiceDate: iso('2026-08-01'),
      nextServiceDate: iso('2026-11-01'),
      notes: 'Алсын зайн хөргөгчтэй чингэлэг ачаа.'
    },
    {
      _id: generateId(),
      vehicleId: 'VEH-1005',
      registrationNumber: '5544 УБЯ',
      vehicleType: 'Van',
      brand: 'Hyundai',
      model: 'Porter II',
      manufacturingYear: 2022,
      fuelType: 'CNG',
      fuelCapacity: 60,
      currentMileage: 64200,
      status: 'Maintenance',
      assignedDriver: null,
      purchaseDate: iso('2022-09-12'),
      insuranceExpiry: iso('2026-11-12'),
      registrationExpiry: iso('2037-09-12'),
      lastServiceDate: iso('2026-05-14'),
      nextServiceDate: iso('2026-09-15'), // Overdue maintenance!
      notes: 'Хурдны хайрцгийн бүрэн оношилгоонд цехэд байгаа.'
    },
    {
      _id: generateId(),
      vehicleId: 'VEH-1006',
      registrationNumber: '8812 УБЭ',
      vehicleType: 'Bus',
      brand: 'Hyundai',
      model: 'Universe',
      manufacturingYear: 2023,
      fuelType: 'Diesel',
      fuelCapacity: 160,
      currentMileage: 38900,
      status: 'Available',
      assignedDriver: drivers[3]._id,
      purchaseDate: iso('2023-03-30'),
      insuranceExpiry: iso('2027-03-30'),
      registrationExpiry: iso('2038-03-30'),
      lastServiceDate: iso('2026-08-15'),
      nextServiceDate: iso('2026-11-15'),
      notes: 'Байгууллагын ажилчдын болон нисэх буудлын дамжлагын автобус.'
    },
    {
      _id: generateId(),
      vehicleId: 'VEH-1007',
      registrationNumber: '3390 УБХ',
      vehicleType: 'Pickup',
      brand: 'Toyota',
      model: 'Hilux',
      manufacturingYear: 2023,
      fuelType: 'Diesel',
      fuelCapacity: 80,
      currentMileage: 41200,
      status: 'Available',
      assignedDriver: null,
      purchaseDate: iso('2023-07-22'),
      insuranceExpiry: iso('2027-07-22'),
      registrationExpiry: iso('2038-07-22'),
      lastServiceDate: iso('2026-07-20'),
      nextServiceDate: iso('2026-10-20'),
      notes: 'Талбайн инженер, замын яаралтай туслалцааны машин.'
    },
    {
      _id: generateId(),
      vehicleId: 'VEH-1008',
      registrationNumber: '6710 УБЖ',
      vehicleType: 'Van',
      brand: 'Toyota',
      model: 'Hiace',
      manufacturingYear: 2021,
      fuelType: 'Diesel',
      fuelCapacity: 70,
      currentMileage: 98400,
      status: 'Available',
      assignedDriver: null,
      purchaseDate: iso('2021-10-05'),
      insuranceExpiry: iso('2026-10-25'), // Warning expiry
      registrationExpiry: iso('2036-10-05'),
      lastServiceDate: iso('2026-06-10'),
      nextServiceDate: iso('2026-10-10'),
      notes: 'Их даацтай хүргэлтийн фургон.'
    },
    {
      _id: generateId(),
      vehicleId: 'VEH-1009',
      registrationNumber: '4411 УБА',
      vehicleType: 'Sedan',
      brand: 'Toyota',
      model: 'Prius 30',
      manufacturingYear: 2019,
      fuelType: 'Hybrid',
      fuelCapacity: 45,
      currentMileage: 74500,
      status: 'Available',
      assignedDriver: null,
      purchaseDate: iso('2022-04-01'),
      insuranceExpiry: iso('2027-04-01'),
      registrationExpiry: iso('2039-04-01'),
      lastServiceDate: iso('2026-08-20'),
      nextServiceDate: iso('2027-02-20'),
      notes: 'Удирдлагын үзлэг, үйлчлүүлэгчтэй уулзах албаны машин.'
    },
    {
      _id: generateId(),
      vehicleId: 'VEH-1010',
      registrationNumber: '9080 УБЮ',
      vehicleType: 'SUV',
      brand: 'Toyota',
      model: 'Land Cruiser Prado',
      manufacturingYear: 2023,
      fuelType: 'Diesel',
      fuelCapacity: 87,
      currentMileage: 32000,
      status: 'Available',
      assignedDriver: null,
      purchaseDate: iso('2023-11-15'),
      insuranceExpiry: iso('2026-11-15'),
      registrationExpiry: iso('2038-11-15'),
      lastServiceDate: iso('2026-07-01'),
      nextServiceDate: iso('2026-11-01'),
      notes: 'Талбайн үзлэг, хүнд замын дагалдах машин.'
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
      source: 'Улаанбаатар, Төв агуулах',
      destination: 'Замын-Үүд боомт',
      startDate: iso('2026-09-22T08:00:00Z'),
      expectedEndDate: iso('2026-09-25T18:00:00Z'),
      actualEndDate: null,
      distance: 700,
      purpose: 'Экспортын электрон бараа',
      fuelUsed: 245,
      tripExpense: 280000,
      status: 'In Progress',
      notes: 'Өндөр үнэтэй экспортын ачаа. Хурд хязгаарлагч шалгагдсан.'
    },
    {
      _id: generateId(),
      tripId: 'TRIP-1002',
      vehicle: vehicles[3]._id,
      driver: drivers[2]._id,
      source: 'Улаанбаатар, Налайх',
      destination: 'Эрдэнэт хот',
      startDate: iso('2026-09-23T06:00:00Z'),
      expectedEndDate: iso('2026-09-26T14:00:00Z'),
      actualEndDate: null,
      distance: 380,
      purpose: 'Эмийн бүтээгдэхүүн (хүйтэн хэлхээ)',
      fuelUsed: 110,
      tripExpense: 240000,
      status: 'In Progress',
      notes: 'Температурын тасралтгүй хяналт идэвхтэй (+4°C).'
    },
    {
      _id: generateId(),
      tripId: 'TRIP-1003',
      vehicle: vehicles[1]._id,
      driver: drivers[1]._id,
      source: 'Дархан, Үйлдвэрийн бүс',
      destination: 'Улаанбаатар, Автозамын төв',
      startDate: iso('2026-09-15T09:00:00Z'),
      expectedEndDate: iso('2026-09-16T18:00:00Z'),
      actualEndDate: iso('2026-09-16T17:30:00Z'),
      distance: 220,
      purpose: 'Автомашины сэлбэг',
      fuelUsed: 63,
      tripExpense: 150000,
      status: 'Completed',
      notes: 'Хүргэлтийн баримтын хамт цагтаа хүргэсэн.'
    },
    {
      _id: generateId(),
      tripId: 'TRIP-1004',
      vehicle: vehicles[2]._id,
      driver: drivers[4]._id,
      source: 'Улаанбаатар, Баянзүрх дэд төв',
      destination: 'Улаанбаатар, Налайх дүүрэг',
      startDate: iso('2026-09-19T07:30:00Z'),
      expectedEndDate: iso('2026-09-19T16:00:00Z'),
      actualEndDate: iso('2026-09-19T15:45:00Z'),
      distance: 65,
      purpose: 'Цахим худалдааны хэрэглээний барааны хүргэлт',
      fuelUsed: 14,
      tripExpense: 15000,
      status: 'Completed',
      notes: 'Цахилгаан фургоны туршилтын хүргэлт амжилттай боллоо.'
    },
    {
      _id: generateId(),
      tripId: 'TRIP-1005',
      vehicle: vehicles[5]._id,
      driver: drivers[3]._id,
      source: 'Буянт-Ухаа нисэх буудал',
      destination: 'Тэрэлж жуулчны бааз',
      startDate: iso('2026-09-20T10:00:00Z'),
      expectedEndDate: iso('2026-09-20T19:00:00Z'),
      actualEndDate: iso('2026-09-20T18:40:00Z'),
      distance: 85,
      purpose: 'Гадаадын төлөөлөгчдийг тээвэрлэсэн',
      fuelUsed: 22,
      tripExpense: 40000,
      status: 'Completed',
      notes: 'Үйлчлүүлэгчийн үнэлгээ 5/5.'
    },
    {
      _id: generateId(),
      tripId: 'TRIP-1006',
      vehicle: vehicles[6]._id,
      driver: drivers[1]._id,
      source: 'Улаанбаатар, Налайх замын агуулах',
      destination: 'Мандалговь хот',
      startDate: iso('2026-09-12T08:00:00Z'),
      expectedEndDate: iso('2026-09-12T20:00:00Z'),
      actualEndDate: iso('2026-09-12T19:30:00Z'),
      distance: 300,
      purpose: 'Тоног төхөөрөмжийн сэлбэг',
      fuelUsed: 36,
      tripExpense: 70000,
      status: 'Completed',
      notes: 'Саадгүй хүргэсэн.'
    },
    {
      _id: generateId(),
      tripId: 'TRIP-1007',
      vehicle: vehicles[7]._id,
      driver: drivers[3]._id,
      source: 'Улаанбаатар, Яармаг',
      destination: 'Сайншанд хот',
      startDate: iso('2026-09-08T07:00:00Z'),
      expectedEndDate: iso('2026-09-09T14:00:00Z'),
      actualEndDate: iso('2026-09-09T13:20:00Z'),
      distance: 460,
      purpose: 'Хүнсний болон өдөр тутмын хэрэглээний бараа',
      fuelUsed: 58,
      tripExpense: 130000,
      status: 'Completed',
      notes: 'Замын хураамжийн төлбөр картаар бүртгэгдсэн.'
    },
    {
      _id: generateId(),
      tripId: 'TRIP-1008',
      vehicle: vehicles[0]._id,
      driver: drivers[0]._id,
      source: 'Улаанбаатар, Сонгинохайрхан дүүрэг',
      destination: 'Цэцэрлэг хот, Архангай',
      startDate: iso('2026-09-02T06:00:00Z'),
      expectedEndDate: iso('2026-09-03T14:00:00Z'),
      actualEndDate: iso('2026-09-03T13:10:00Z'),
      distance: 430,
      purpose: 'Ноос, ноолуурын түүхий эд',
      fuelUsed: 120,
      tripExpense: 110000,
      status: 'Completed',
      notes: 'Шууд хүргэлт хийгдсэн.'
    },
    {
      _id: generateId(),
      tripId: 'TRIP-1009',
      vehicle: vehicles[1]._id,
      driver: drivers[1]._id,
      source: 'Улаанбаатар, Тэргүүн агуулах',
      destination: 'Дархан, Худалдааны төв',
      startDate: iso('2026-08-28T09:00:00Z'),
      expectedEndDate: iso('2026-08-28T19:00:00Z'),
      actualEndDate: iso('2026-08-28T18:45:00Z'),
      distance: 220,
      purpose: 'Өндөр нарийвчлалтай багаж хэрэгсэл',
      fuelUsed: 62,
      tripExpense: 90000,
      status: 'Completed',
      notes: 'Хамгаалалттай чингэлэг тээвэр.'
    },
    {
      _id: generateId(),
      tripId: 'TRIP-1010',
      vehicle: vehicles[3]._id,
      driver: drivers[2]._id,
      source: 'Улаанбаатар, Гуравсан төв',
      destination: 'Чойбалсан хот',
      startDate: iso('2026-08-20T08:00:00Z'),
      expectedEndDate: iso('2026-08-22T16:00:00Z'),
      actualEndDate: iso('2026-08-22T15:10:00Z'),
      distance: 660,
      purpose: 'Уул уурхайн тоног төхөөрөмжийн сэлбэг',
      fuelUsed: 185,
      tripExpense: 210000,
      status: 'Completed',
      notes: 'Чухал нийлүүлэлтийн ачаа амжилттай хүргэгдсэн.'
    },
    {
      _id: generateId(),
      tripId: 'TRIP-1011',
      vehicle: vehicles[5]._id,
      driver: drivers[3]._id,
      source: 'Улаанбаатар, Төв автобусны буудал',
      destination: 'Хархорин, Өвөрхангай',
      startDate: iso('2026-08-14T07:00:00Z'),
      expectedEndDate: iso('2026-08-14T19:00:00Z'),
      actualEndDate: iso('2026-08-14T18:20:00Z'),
      distance: 370,
      purpose: 'Хот хоорондын жуулчны бүлгийн тээвэр',
      fuelUsed: 100,
      tripExpense: 85000,
      status: 'Completed',
      notes: 'Кондиционертэй автобусны үйлчилгээ.'
    },
    {
      _id: generateId(),
      tripId: 'TRIP-1012',
      vehicle: vehicles[6]._id,
      driver: drivers[4]._id,
      source: 'Улаанбаатар, Хан-Уул дүүрэг',
      destination: 'Багануур дүүрэг, дэд станц',
      startDate: iso('2026-09-28T08:00:00Z'),
      expectedEndDate: iso('2026-09-29T18:00:00Z'),
      actualEndDate: null,
      distance: 150,
      purpose: 'Нарны панелийн засварын иж бүрдэл хүргэлт',
      fuelUsed: 0,
      tripExpense: 45000,
      status: 'Scheduled',
      notes: 'Удахгүй гарахаар товлосон.'
    },
    {
      _id: generateId(),
      tripId: 'TRIP-1013',
      vehicle: vehicles[9]._id,
      driver: drivers[3]._id,
      source: 'Улаанбаатар, Төв оффис',
      destination: 'Эрдэнэт хот, Уурхайн бүс',
      startDate: iso('2026-09-29T09:00:00Z'),
      expectedEndDate: iso('2026-09-30T17:00:00Z'),
      actualEndDate: null,
      distance: 380,
      purpose: 'Ахлах аудитын үзлэгийн чиглэл',
      fuelUsed: 0,
      tripExpense: 90000,
      status: 'Scheduled',
      notes: 'Компанийн албан ёсны дагалдах машинтай.'
    },
    {
      _id: generateId(),
      tripId: 'TRIP-1014',
      vehicle: vehicles[1]._id,
      driver: drivers[1]._id,
      source: 'Улаанбаатар, Эрдэнэтийн замын агуулах',
      destination: 'Булган хот',
      startDate: iso('2026-08-05T08:00:00Z'),
      expectedEndDate: iso('2026-08-06T18:00:00Z'),
      actualEndDate: iso('2026-08-06T17:40:00Z'),
      distance: 330,
      purpose: 'Барилгын материал, төмөр хийц',
      fuelUsed: 90,
      tripExpense: 100000,
      status: 'Completed',
      notes: 'Жингийн баримт баталгаажсан.'
    },
    {
      _id: generateId(),
      tripId: 'TRIP-1015',
      vehicle: vehicles[4]._id,
      driver: drivers[0]._id,
      source: 'Улаанбаатар, Яармаг',
      destination: 'Налайх, Хөдөө аж ахуйн төв',
      startDate: iso('2026-08-01T06:00:00Z'),
      expectedEndDate: iso('2026-08-02T12:00:00Z'),
      actualEndDate: null,
      distance: 40,
      purpose: 'Хүнсний ногооны яаралтай хүргэлт',
      fuelUsed: 0,
      tripExpense: 0,
      status: 'Cancelled',
      notes: 'Аадар борооны улмаас замын нөхцөл эрсдэлтэй болсон тул цуцалсан.'
    }
  ];

  // 5. Fuel Records (10 records) - prices in MNT per liter, totals computed from quantity * price
  const fuelRecord = (rec) => ({ _id: generateId(), ...rec, totalCost: Math.round(rec.quantity * rec.pricePerLiter) });

  const fuels = [
    fuelRecord({
      fuelRecordId: 'FUEL-1001',
      vehicle: vehicles[0]._id,
      date: iso('2026-09-22T09:30:00Z'),
      fuelType: 'Diesel',
      quantity: 140,
      pricePerLiter: 3050,
      odometerReading: 83900,
      fuelStation: 'Петровис, Улаанбаатар–Дархан чиглэл',
      driver: drivers[0]._id,
      notes: 'Баруун чиглэлийн ачилтын өмнө сав дүүргэсэн.'
    }),
    fuelRecord({
      fuelRecordId: 'FUEL-1002',
      vehicle: vehicles[3]._id,
      date: iso('2026-09-23T07:15:00Z'),
      fuelType: 'Diesel',
      quantity: 130,
      pricePerLiter: 3070,
      odometerReading: 111400,
      fuelStation: 'Шунхлай, Налайх зам',
      driver: drivers[2]._id,
      notes: 'Шатахууны картаар автоматаар төлсөн.'
    }),
    fuelRecord({
      fuelRecordId: 'FUEL-1003',
      vehicle: vehicles[1]._id,
      date: iso('2026-09-15T11:00:00Z'),
      fuelType: 'Diesel',
      quantity: 110,
      pricePerLiter: 3040,
      odometerReading: 51200,
      fuelStation: 'Магнай Трейд, Дарханы эхлэл',
      driver: drivers[1]._id,
      notes: 'Нэмэлт шингэний түвшин шалгасан.'
    }),
    fuelRecord({
      fuelRecordId: 'FUEL-1004',
      vehicle: vehicles[4]._id,
      date: iso('2026-09-10T14:20:00Z'),
      fuelType: 'CNG',
      quantity: 38,
      pricePerLiter: 1450,
      odometerReading: 63800,
      fuelStation: 'Гэм ХХК, Улаанбаатар, Баянгол дүүрэг',
      driver: drivers[0]._id,
      notes: 'Баллоныг бүрэн дүүргэсэн.'
    }),
    fuelRecord({
      fuelRecordId: 'FUEL-1005',
      vehicle: vehicles[5]._id,
      date: iso('2026-09-19T16:00:00Z'),
      fuelType: 'Diesel',
      quantity: 60,
      pricePerLiter: 3060,
      odometerReading: 38400,
      fuelStation: 'МСС, Буянт-Ухаа',
      driver: drivers[3]._id,
      notes: 'Тусгай үйлчилгээний өмнө дүүргэсэн.'
    }),
    fuelRecord({
      fuelRecordId: 'FUEL-1006',
      vehicle: vehicles[6]._id,
      date: iso('2026-09-12T09:00:00Z'),
      fuelType: 'Diesel',
      quantity: 40,
      pricePerLiter: 3050,
      odometerReading: 40900,
      fuelStation: 'Петровис, Мандалговийн зам',
      driver: drivers[1]._id,
      notes: 'Ердийн дизель дүүргэлт.'
    }),
    fuelRecord({
      fuelRecordId: 'FUEL-1007',
      vehicle: vehicles[7]._id,
      date: iso('2026-09-08T08:30:00Z'),
      fuelType: 'Diesel',
      quantity: 60,
      pricePerLiter: 3080,
      odometerReading: 97800,
      fuelStation: 'Шунхлай, Сайншандын зам',
      driver: drivers[3]._id,
      notes: 'Алсын зайн замын өмнөх дүүргэлт.'
    }),
    fuelRecord({
      fuelRecordId: 'FUEL-1008',
      vehicle: vehicles[8]._id,
      date: iso('2026-09-14T10:15:00Z'),
      fuelType: 'Petrol',
      quantity: 30,
      pricePerLiter: 2950,
      odometerReading: 74200,
      fuelStation: 'Магнай Трейд, Хан-Уул дүүрэг',
      driver: drivers[4]._id,
      notes: 'Хотын дотоодын албаны машин.'
    }),
    fuelRecord({
      fuelRecordId: 'FUEL-1009',
      vehicle: vehicles[9]._id,
      date: iso('2026-09-18T12:00:00Z'),
      fuelType: 'Diesel',
      quantity: 35,
      pricePerLiter: 3090,
      odometerReading: 31600,
      fuelStation: 'МСС, Налайх зам',
      driver: drivers[3]._id,
      notes: 'Land Cruiser нэмэлт дүүргэлт.'
    }),
    fuelRecord({
      fuelRecordId: 'FUEL-1010',
      vehicle: vehicles[0]._id,
      date: iso('2026-08-30T15:45:00Z'),
      fuelType: 'Diesel',
      quantity: 140,
      pricePerLiter: 3030,
      odometerReading: 82100,
      fuelStation: 'Петровис, Төв шатахуун түгээх станц',
      driver: drivers[0]._id,
      notes: '8-р сарын төгсгөлийн товлосон дүүргэлт.'
    })
  ];

  // 6. Maintenance Records (7 records) - costs in MNT
  const maintenances = [
    {
      _id: generateId(),
      maintenanceId: 'MNT-1001',
      vehicle: vehicles[4]._id, // VEH-1005 (Porter)
      maintenanceType: 'Engine Service',
      description: 'Хурдны хайрцгийн бүрэн засвар, шүүрч дискний солилт, шатахууны насосны тохируулга',
      serviceDate: iso('2026-09-16T10:00:00Z'),
      nextServiceDate: iso('2026-12-16T10:00:00Z'),
      cost: 3800000,
      serviceCenter: 'Hyundai албан ёсны засварын төв, Улаанбаатар',
      status: 'In Progress',
      notes: 'Сэлбэгийг үйлдвэрлэгчийн агуулахаас захиалсан; маргааш ирэх хүлээлттэй.'
    },
    {
      _id: generateId(),
      maintenanceId: 'MNT-1002',
      vehicle: vehicles[1]._id, // VEH-1002
      maintenanceType: 'Brake Service',
      description: 'Агаарын тоормосны холхивч тохируулга, давхарга солилт, ABS мэдрэгчийн оношилгоо',
      serviceDate: iso('2026-09-28T09:00:00Z'),
      nextServiceDate: iso('2026-10-15T09:00:00Z'), // Due soon!
      cost: 1200000,
      serviceCenter: 'Shacman албан ёсны үйлчилгээний төв, Налайх зам',
      status: 'Scheduled',
      notes: 'Урт замын аяллын өмнөх урьдчилан сэргийлэх засвар.'
    },
    {
      _id: generateId(),
      maintenanceId: 'MNT-1003',
      vehicle: vehicles[0]._id, // VEH-1001
      maintenanceType: 'Regular Service',
      description: '80,000 км-ийн их засвар: синтетик хөдөлгүүрийн тос, шүүлтүүр, нэмэлт шингэний системийн шалгалт',
      serviceDate: iso('2026-08-10T08:30:00Z'),
      nextServiceDate: iso('2026-11-10T08:30:00Z'),
      cost: 1500000,
      serviceCenter: 'Sinotruk албан ёсны төв, Улаанбаатар',
      status: 'Completed',
      notes: 'Хөдөлгүүрийн тохиргоо Euro V стандартад нийцсэн.'
    },
    {
      _id: generateId(),
      maintenanceId: 'MNT-1004',
      vehicle: vehicles[2]._id, // VEH-1003 (BYD T3)
      maintenanceType: 'Regular Service',
      description: 'Цахилгаан батарейны төлөв байдлын оношилгоо, моторын хөргөлтийн шингэн нөхөлт, регенератив тоормосны шалгалт',
      serviceDate: iso('2026-06-25T11:00:00Z'),
      nextServiceDate: iso('2026-12-25T11:00:00Z'),
      cost: 350000,
      serviceCenter: 'BYD албан ёсны цахилгаан тээврийн цех, Улаанбаатар',
      status: 'Completed',
      notes: 'Өндөр хүчдэлийн батарейны элэгдэл 1.2%-иас бага, маш сайн байдалтай.'
    },
    {
      _id: generateId(),
      maintenanceId: 'MNT-1005',
      vehicle: vehicles[3]._id, // VEH-1004
      maintenanceType: 'Tire Replacement',
      description: 'Арын хос тэнхлэгийн радиал дугуй солилт (4 шинэ дугуй) + дугуйн тэнхлэгийн тохируулга',
      serviceDate: iso('2026-08-01T10:00:00Z'),
      nextServiceDate: iso('2026-11-01T10:00:00Z'),
      cost: 4800000,
      serviceCenter: 'Дугуйн төв ХХК, Улаанбаатар',
      status: 'Completed',
      notes: 'Дугуйн сериал дугаарыг баталгаат хугацааны системд бүртгэсэн.'
    },
    {
      _id: generateId(),
      maintenanceId: 'MNT-1006',
      vehicle: vehicles[5]._id, // VEH-1006
      maintenanceType: 'Oil Change',
      description: 'Хурдны хайрцгийн шингэн цэвэрлэгээ, арын дифференциалын тос солилт',
      serviceDate: iso('2026-08-15T09:30:00Z'),
      nextServiceDate: iso('2026-11-15T09:30:00Z'),
      cost: 450000,
      serviceCenter: 'Hyundai автобусны үйлчилгээний төв, Улаанбаатар',
      status: 'Completed',
      notes: 'Тосны дээж цэвэр, металл хөлс илрээгүй.'
    },
    {
      _id: generateId(),
      maintenanceId: 'MNT-1007',
      vehicle: vehicles[7]._id, // VEH-1008
      maintenanceType: 'Repair',
      description: 'Дүүжин пүршний бушинг солилт болон амортизаторын тохируулга',
      serviceDate: iso('2026-06-10T14:00:00Z'),
      nextServiceDate: iso('2026-10-10T14:00:00Z'), // Due soon!
      cost: 900000,
      serviceCenter: 'Toyota албан ёсны засварын төв, Улаанбаатар',
      status: 'Completed',
      notes: 'Унаачлалын тав тух сэргэсэн.'
    }
  ];

  // 7. Expenses (11 records) - amounts in MNT; fuel/maintenance vouchers mirror their source records
  const expenses = [
    {
      _id: generateId(),
      expenseId: 'EXP-1001',
      vehicle: vehicles[0]._id,
      category: 'Fuel',
      amount: fuels[0].totalCost,
      date: fuels[0].date,
      description: 'Шатахуун дүүргэлт 140 л (дизель), Петровис',
      driver: drivers[0]._id,
      trip: trips[0]._id,
      paymentMethod: 'Fuel Card'
    },
    {
      _id: generateId(),
      expenseId: 'EXP-1002',
      vehicle: vehicles[3]._id,
      category: 'Fuel',
      amount: fuels[1].totalCost,
      date: fuels[1].date,
      description: 'Шатахуун дүүргэлт 130 л (дизель), Шунхлай Налайх зам',
      driver: drivers[2]._id,
      trip: trips[1]._id,
      paymentMethod: 'Fuel Card'
    },
    {
      _id: generateId(),
      expenseId: 'EXP-1003',
      vehicle: vehicles[4]._id,
      category: 'Maintenance',
      amount: maintenances[0].cost,
      date: maintenances[0].serviceDate,
      description: 'Хурдны хайрцгийн засвар, шүүрч дискний солилт, Hyundai төв',
      driver: null,
      paymentMethod: 'Company Card'
    },
    {
      _id: generateId(),
      expenseId: 'EXP-1004',
      vehicle: vehicles[3]._id,
      category: 'Maintenance',
      amount: maintenances[4].cost,
      date: maintenances[4].serviceDate,
      description: 'Радиал дугуй солилт (4 ширхэг), Дугуйн төв ХХК',
      driver: null,
      paymentMethod: 'Bank Transfer'
    },
    {
      _id: generateId(),
      expenseId: 'EXP-1005',
      vehicle: vehicles[0]._id,
      category: 'Toll',
      amount: 45000,
      date: iso('2026-09-22T14:00:00Z'),
      description: 'Улаанбаатар–Замын-Үүд чиглэлийн замын хураамж',
      driver: drivers[0]._id,
      trip: trips[0]._id,
      paymentMethod: 'Company Card'
    },
    {
      _id: generateId(),
      expenseId: 'EXP-1006',
      vehicle: vehicles[3]._id,
      category: 'Toll',
      amount: 38000,
      date: iso('2026-09-23T11:30:00Z'),
      description: 'Улаанбаатар–Эрдэнэт чиглэлийн замын хураамж',
      driver: drivers[2]._id,
      trip: trips[1]._id,
      paymentMethod: 'Company Card'
    },
    {
      _id: generateId(),
      expenseId: 'EXP-1007',
      vehicle: vehicles[1]._id,
      category: 'Insurance',
      amount: 1450000,
      date: iso('2026-04-10T10:00:00Z'),
      description: 'Парк тээврийн хэрэгслийн иж бүрэн даатгалын жилийн шинэчлэлт',
      driver: null,
      paymentMethod: 'Bank Transfer'
    },
    {
      _id: generateId(),
      expenseId: 'EXP-1008',
      vehicle: vehicles[0]._id,
      category: 'Trip',
      amount: 120000,
      date: iso('2026-09-22T20:00:00Z'),
      description: 'Жолоочийн өдрийн хоол, зогсоолын болон замын зөвшөөрлийн зардал',
      driver: drivers[0]._id,
      trip: trips[0]._id,
      paymentMethod: 'Cash'
    },
    {
      _id: generateId(),
      expenseId: 'EXP-1009',
      vehicle: vehicles[5]._id,
      category: 'Fuel',
      amount: fuels[4].totalCost,
      date: fuels[4].date,
      description: 'Шатахуун дүүргэлт 60 л (дизель), Hyundai Universe автобус',
      driver: drivers[3]._id,
      paymentMethod: 'Fuel Card'
    },
    {
      _id: generateId(),
      expenseId: 'EXP-1010',
      vehicle: vehicles[1]._id,
      category: 'Repair',
      amount: 180000,
      date: iso('2026-08-18T14:30:00Z'),
      description: 'Кондиционерын хий нөхөлт болон сэнсний моторын сойз солилт',
      driver: drivers[1]._id,
      paymentMethod: 'Company Card'
    },
    {
      _id: generateId(),
      expenseId: 'EXP-1011',
      vehicle: vehicles[7]._id,
      category: 'Other',
      amount: 95000,
      date: iso('2026-09-05T10:00:00Z'),
      description: 'Техникийн хяналтын үзлэг болон GPS төхөөрөмжийн гэрчилгээ шинэчлэлт',
      driver: null,
      paymentMethod: 'Cash'
    }
  ];

  // 8. Notifications (6 records)
  const notifications = [
    {
      _id: generateId(),
      user: null,
      type: 'maintenance_due',
      title: 'Тээврийн хэрэгслийн засвар товлогдлоо',
      message: '4402 УБЕ (Shacman X3000) тээврийн хэрэгслийн тоормосны үйлчилгээ 2026 оны 9-р сарын 28-нд Налайх замын төвд товлогдсон.',
      isRead: false,
      relatedEntity: 'Vehicle',
      relatedEntityId: vehicles[1]._id,
      createdAt: iso('2026-09-24T05:00:00Z')
    },
    {
      _id: generateId(),
      user: null,
      type: 'maintenance_overdue',
      title: 'Засварын хугацаа хэтэрсэн',
      message: '5544 УБЯ тээврийн хэрэгслийн товлосон үйлчилгээ 2026 оны 9-р сарын 15-нд дуусах ёстой байсан. Одоогоор цехэд байна.',
      isRead: false,
      relatedEntity: 'Vehicle',
      relatedEntityId: vehicles[4]._id,
      createdAt: iso('2026-09-24T06:30:00Z')
    },
    {
      _id: generateId(),
      user: null,
      type: 'insurance_expiry',
      title: 'Даатгалын хугацаа дуусахад ойртлоо',
      message: '4402 УБЕ тээврийн хэрэгслийн даатгал 24 хоногийн дараа (2026-10-18) дуусна. Яаралтай сунгахыг зөвлөж байна.',
      isRead: false,
      relatedEntity: 'Vehicle',
      relatedEntityId: vehicles[1]._id,
      createdAt: iso('2026-09-24T07:15:00Z')
    },
    {
      _id: generateId(),
      user: null,
      type: 'license_expiry',
      title: 'Жолоочийн үнэмлэхийн хугацаа дуусахад ойртлоо',
      message: 'Жолооч Н.Эрдэнэбатын мэргэжлийн жолооны үнэмлэх 26 хоногийн дараа (2026-10-20) дуусна.',
      isRead: false,
      relatedEntity: 'Driver',
      relatedEntityId: drivers[1]._id,
      createdAt: iso('2026-09-23T11:00:00Z')
    },
    {
      _id: generateId(),
      user: null,
      type: 'trip_started',
      title: 'Рейс явагдаж байна',
      message: 'TRIP-1001 хөдөллөө: 8821 УБА (Sinotruk HOWO) Улаанбаатараас Замын-Үүд боомт руу.',
      isRead: true,
      relatedEntity: 'Trip',
      relatedEntityId: trips[0]._id,
      createdAt: iso('2026-09-22T08:05:00Z')
    },
    {
      _id: generateId(),
      user: null,
      type: 'trip_completed',
      title: 'Рейс амжилттай дууслаа',
      message: 'TRIP-1003 Улаанбаатарын Автозамын төвд (220 км) ирлээ. Хүргэлтийн баталгаа шалгагдсан.',
      isRead: true,
      relatedEntity: 'Trip',
      relatedEntityId: trips[2]._id,
      createdAt: iso('2026-09-16T17:35:00Z')
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
  console.log(
    `[FLEETNOVA] Successfully seeded: ${users.length} Users, ${drivers.length} Drivers, ${vehicles.length} Vehicles, ` +
    `${trips.length} Trips, ${fuels.length} Fuel logs, ${maintenances.length} Maintenance logs, ` +
    `${expenses.length} Expenses, ${notifications.length} Notifications.`
  );
}

// Allow direct execution via CLI `node seedData.js` or `npm run seed`
if (process.argv[1] && process.argv[1].endsWith('seedData.js')) {
  seedFleetData().then(() => {
    console.log('[FLEETNOVA] CLI Seed execution finished.');
    process.exit(0);
  });
}
