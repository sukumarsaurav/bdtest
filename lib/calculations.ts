'use client';

export interface PCInputs {
  routeName: string;
  owKm: number;
  rtPerMonth: number;
  buses: number;
  marginPct: number;
  busType: 'Sleeper' | 'Hybrid' | 'Seater';
  berths: number;
  seats: number;

  // D/H config
  dhModel: '2D1H' | '1D1H';
  dhCostPerKm: number;

  // Chassis + body
  chassisCost: number;
  bodyCost: number;
  chassisName: string;
  bodyName: string;

  // Financing
  financingPct: number;
  interestRate: number;
  loanTermMonths: number;

  // Fuel
  dieselPrice: number;
  mileage: number;
  adbluePerKm: number;

  // Tolls
  tollPerOWTrip: number;

  // Per-trip costs
  waterPerRT: number;
  laundryPerRT: number;
  parkingPerRT: number;

  // Per-month costs
  dashcamPerMonth: number;
  uniformPerMonth: number;

  // Per-km costs
  tyrePerKm: number;
  maintenancePerKm: number;
  adminPerKm: number;
  liasoningPerKm: number;
  challanPerKm: number;

  // Insurance & registration
  insurancePctOfVehicle: number;
  registrationPerYear: number;

  // AITP
  aitpApplicable: boolean;
  aitpFrequency: 'monthly' | 'quarterly' | 'yearly';
  aitpAnnualCost: number;

  // Van pickup
  vanEnabled: boolean;
  pickupEnabled: boolean;
  pickupCostPerRT: number;
  dropEnabled: boolean;
  dropCostPerRT: number;
  vanType: 'dedicated' | 'merged';
  vanSharingBuses: number;

  // Region & state tax
  region: 'South' | 'North';
  selectedStates: string[];
  stateTaxOverrides: Record<string, number>;

  // GST
  gstSlab: 5 | 18;
}

export interface PCResult {
  components: { name: string; perKm: number; pctOfTotal: number }[];
  totalCostPerKm: number;
  marginPerKm: number;
  recommendedMinG: number;
  gstOnMinG: number;
  totalMinGInclGst: number;
  monthlyKmPerBus: number;
  operatingDays: number;
  monthlyCostPerBus: number;
  totalMonthlyAllBuses: number;
  annualCommitment: number;
  vehicleCost: number;
  monthlyEMI: number;
  emiPerKm: number;
}

function computeStateTax(inputs: PCInputs): number {
  const { selectedStates, berths, seats, stateTaxOverrides } = inputs;
  let totalMonthly = 0;

  for (const state of selectedStates) {
    switch (state) {
      case 'Tamil Nadu':
      case 'Karnataka': {
        const quarterly = 4500 * berths + 3500 * seats;
        totalMonthly += quarterly / 3;
        break;
      }
      case 'Kerala': {
        const quarterly = 3000 * (berths + seats);
        totalMonthly += quarterly / 3;
        break;
      }
      case 'Andhra Pradesh':
      case 'Telangana':
        totalMonthly += 0;
        break;
      default: {
        // North flat states - use override or 0
        const flat = stateTaxOverrides[state] ?? 0;
        totalMonthly += flat;
        break;
      }
    }
  }

  return totalMonthly;
}

function computeAITP(inputs: PCInputs): number {
  const { aitpAnnualCost, aitpFrequency } = inputs;
  let effectiveAnnual = aitpAnnualCost;

  if (aitpFrequency === 'yearly') {
    effectiveAnnual = aitpAnnualCost * 0.95;
  } else if (aitpFrequency === 'quarterly') {
    effectiveAnnual = aitpAnnualCost * 0.98;
  }

  return effectiveAnnual / 12;
}

function computeVanCost(inputs: PCInputs): number {
  const {
    pickupEnabled,
    pickupCostPerRT,
    dropEnabled,
    dropCostPerRT,
    vanSharingBuses,
    owKm,
  } = inputs;

  const totalVanPerRT =
    (pickupEnabled ? pickupCostPerRT : 0) + (dropEnabled ? dropCostPerRT : 0);
  const costPerBusPerRT = totalVanPerRT / (vanSharingBuses || 1);
  return costPerBusPerRT / (owKm * 2);
}

function computeEMI(
  loanAmount: number,
  annualRate: number,
  termMonths: number
): number {
  if (loanAmount <= 0 || termMonths <= 0) return 0;
  if (annualRate <= 0) return loanAmount / termMonths;

  const r = annualRate / 12 / 100;
  const n = termMonths;
  const factor = Math.pow(1 + r, n);
  return (loanAmount * r * factor) / (factor - 1);
}

export function calculatePC(inputs: PCInputs): PCResult {
  const {
    owKm,
    rtPerMonth,
    buses,
    marginPct,
    dieselPrice,
    mileage,
    adbluePerKm,
    dhCostPerKm,
    tollPerOWTrip,
    tyrePerKm,
    maintenancePerKm,
    adminPerKm,
    liasoningPerKm,
    challanPerKm,
    insurancePctOfVehicle,
    registrationPerYear,
    waterPerRT,
    laundryPerRT,
    parkingPerRT,
    dashcamPerMonth,
    uniformPerMonth,
    chassisCost,
    bodyCost,
    financingPct,
    interestRate,
    loanTermMonths,
    aitpApplicable,
    vanEnabled,
    gstSlab,
  } = inputs;

  const monthlyKmPerBus = owKm * 2 * rtPerMonth;
  const totalMonthlyKm = monthlyKmPerBus * buses;
  const operatingDays = rtPerMonth * 3;
  const vehicleCost = chassisCost + bodyCost;
  const loanAmount = (vehicleCost * financingPct) / 100;
  const monthlyEMI = computeEMI(loanAmount, interestRate, loanTermMonths);
  const emiPerKm = monthlyKmPerBus > 0 ? monthlyEMI / monthlyKmPerBus : 0;

  if (monthlyKmPerBus === 0) {
    return {
      components: [],
      totalCostPerKm: 0,
      marginPerKm: 0,
      recommendedMinG: 0,
      gstOnMinG: 0,
      totalMinGInclGst: 0,
      monthlyKmPerBus: 0,
      operatingDays: 0,
      monthlyCostPerBus: 0,
      totalMonthlyAllBuses: 0,
      annualCommitment: 0,
      vehicleCost,
      monthlyEMI: 0,
      emiPerKm: 0,
    };
  }

  const rtKm = owKm * 2;
  const stateTaxMonthly = computeStateTax(inputs);
  const aitpMonthly = aitpApplicable ? computeAITP(inputs) : 0;
  const vanPerKm = vanEnabled ? computeVanCost(inputs) : 0;

  const componentDefs: { name: string; perKm: number }[] = [
    { name: 'Fuel', perKm: mileage > 0 ? dieselPrice / mileage : 0 },
    { name: 'AdBlue', perKm: adbluePerKm },
    { name: 'EMI', perKm: emiPerKm },
    { name: 'D/H Salary', perKm: dhCostPerKm },
    { name: 'Tolls', perKm: owKm > 0 ? tollPerOWTrip / owKm : 0 },
    { name: 'Tyres', perKm: tyrePerKm },
    { name: 'Maintenance', perKm: maintenancePerKm },
    { name: 'Admin', perKm: adminPerKm },
    { name: 'Liasoning', perKm: liasoningPerKm },
    { name: 'Challan', perKm: challanPerKm },
    {
      name: 'Insurance',
      perKm: ((vehicleCost * insurancePctOfVehicle) / 100 / 12) / monthlyKmPerBus,
    },
    {
      name: 'Registration',
      perKm: registrationPerYear / 12 / monthlyKmPerBus,
    },
    { name: 'Water', perKm: rtKm > 0 ? waterPerRT / rtKm : 0 },
    { name: 'Laundry', perKm: rtKm > 0 ? laundryPerRT / rtKm : 0 },
    { name: 'Parking', perKm: rtKm > 0 ? parkingPerRT / rtKm : 0 },
    { name: 'Dashcam', perKm: dashcamPerMonth / monthlyKmPerBus },
    { name: 'Uniform', perKm: uniformPerMonth / monthlyKmPerBus },
    { name: 'State Tax', perKm: stateTaxMonthly / monthlyKmPerBus },
    { name: 'Van', perKm: vanPerKm },
    { name: 'AITP', perKm: aitpMonthly / monthlyKmPerBus },
  ];

  const totalCostPerKm = componentDefs.reduce((sum, c) => sum + c.perKm, 0);

  const components = componentDefs.map((c) => ({
    name: c.name,
    perKm: parseFloat(c.perKm.toFixed(4)),
    pctOfTotal: totalCostPerKm > 0
      ? parseFloat(((c.perKm / totalCostPerKm) * 100).toFixed(1))
      : 0,
  }));

  const marginPerKm = (totalCostPerKm * marginPct) / 100;
  const recommendedMinG = totalCostPerKm + marginPerKm;
  const gstOnMinG = (recommendedMinG * gstSlab) / 100;
  const totalMinGInclGst = recommendedMinG + gstOnMinG;

  const monthlyCostPerBus = totalCostPerKm * monthlyKmPerBus;
  const totalMonthlyAllBuses = (monthlyCostPerBus * buses) / 100000; // in ₹L
  const annualCommitment = (monthlyCostPerBus * buses * 12) / 10000000; // in ₹Cr

  return {
    components,
    totalCostPerKm: parseFloat(totalCostPerKm.toFixed(2)),
    marginPerKm: parseFloat(marginPerKm.toFixed(2)),
    recommendedMinG: parseFloat(recommendedMinG.toFixed(2)),
    gstOnMinG: parseFloat(gstOnMinG.toFixed(2)),
    totalMinGInclGst: parseFloat(totalMinGInclGst.toFixed(2)),
    monthlyKmPerBus,
    operatingDays,
    monthlyCostPerBus: Math.round(monthlyCostPerBus),
    totalMonthlyAllBuses: parseFloat(totalMonthlyAllBuses.toFixed(2)),
    annualCommitment: parseFloat(annualCommitment.toFixed(2)),
    vehicleCost,
    monthlyEMI: Math.round(monthlyEMI),
    emiPerKm: parseFloat(emiPerKm.toFixed(2)),
  };
}

export function getDefaultInputs(): PCInputs {
  return {
    routeName: '',
    owKm: 500,
    rtPerMonth: 13,
    buses: 2,
    marginPct: 5,
    busType: 'Sleeper',
    berths: 36,
    seats: 0,

    dhModel: '2D1H',
    dhCostPerKm: 7.5,

    chassisCost: 3200000,
    bodyCost: 2500000,
    chassisName: 'BharatBenz 1624',
    bodyName: 'MG Body',

    financingPct: 85,
    interestRate: 10,
    loanTermMonths: 48,

    dieselPrice: 92,
    mileage: 3.6,
    adbluePerKm: 1.0,

    tollPerOWTrip: 3500,

    waterPerRT: 500,
    laundryPerRT: 1500,
    parkingPerRT: 300,

    dashcamPerMonth: 1500,
    uniformPerMonth: 500,

    tyrePerKm: 1.0,
    maintenancePerKm: 1.2,
    adminPerKm: 0.3,
    liasoningPerKm: 0.3,
    challanPerKm: 0.55,

    insurancePctOfVehicle: 1.5,
    registrationPerYear: 25000,

    aitpApplicable: false,
    aitpFrequency: 'yearly',
    aitpAnnualCost: 120000,

    vanEnabled: false,
    pickupEnabled: true,
    pickupCostPerRT: 2000,
    dropEnabled: true,
    dropCostPerRT: 2000,
    vanType: 'dedicated',
    vanSharingBuses: 1,

    region: 'South',
    selectedStates: ['Karnataka', 'Tamil Nadu'],
    stateTaxOverrides: {},

    gstSlab: 5,
  };
}
