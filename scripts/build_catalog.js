import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import canonicalize from 'canonicalize';

const products = [
  // --- KEYBOARDS (6 items) ---
  {
    externalId: 'prod_k2_pro',
    title: 'Keychron K2 Pro Wireless Mechanical Keyboard',
    description: 'Keychron K2 Pro QMK/VIA wireless mechanical keyboard with tactile switches, white backlight, and sound-absorbing foam.',
    category: 'Keyboards',
    merchantId: 'MERCHANT_KEYCHRON',
    merchantName: 'Keychron Official Store',
    paypalMerchantId: 'PPM_KEYCHRON_998',
    basePriceMinor: '9900',
    currency: 'USD',
    minorUnitExponent: 2,
    specifications: {
      backlight: 'White LED',
      connectivity: 'Wireless (Bluetooth 5.1 / Type-C)',
      formFactor: '75%',
      hotSwappable: true,
      switchType: 'Tactile (Keychron K Pro Brown)'
    },
    productUrl: 'https://www.keychron.com/products/keychron-k2-pro',
    catalogSource: 'CHANNEL3_OFFLINE_FIXTURE',
    isVerified: true
  },
  {
    externalId: 'prod_logi_mx_mech',
    title: 'Logitech MX Mechanical Wireless Keyboard',
    description: 'High-performance mechanical keyboard with low-profile tactile quiet switches and smart illumination.',
    category: 'Keyboards',
    merchantId: 'MERCHANT_LOGITECH',
    merchantName: 'Logitech Official',
    paypalMerchantId: 'PPM_LOGITECH_441',
    basePriceMinor: '16999',
    currency: 'USD',
    minorUnitExponent: 2,
    specifications: {
      backlight: 'White LED',
      batteryLifeHours: 360,
      connectivity: 'Wireless (Logi Bolt / Bluetooth)',
      formFactor: 'Full Size',
      switchType: 'Tactile Quiet'
    },
    productUrl: 'https://www.logitech.com/products/keyboards/mx-mechanical.html',
    catalogSource: 'CHANNEL3_OFFLINE_FIXTURE',
    isVerified: true
  },
  {
    externalId: 'prod_q1_pro',
    title: 'Keychron Q1 Pro Custom Mechanical Keyboard',
    description: 'Full metal QMK/VIA wireless custom mechanical keyboard with double-gasket design and RGB backlight.',
    category: 'Keyboards',
    merchantId: 'MERCHANT_KEYCHRON',
    merchantName: 'Keychron Official Store',
    paypalMerchantId: 'PPM_KEYCHRON_998',
    basePriceMinor: '19900',
    currency: 'USD',
    minorUnitExponent: 2,
    specifications: {
      backlight: 'South-facing RGB',
      bodyMaterial: 'Full CNC Aluminum',
      connectivity: 'Wireless (Bluetooth 5.1 / Type-C)',
      formFactor: '75%',
      hotSwappable: true,
      switchType: 'Linear (Keychron K Pro Red)'
    },
    productUrl: 'https://www.keychron.com/products/keychron-q1-pro',
    catalogSource: 'CHANNEL3_OFFLINE_FIXTURE',
    isVerified: true
  },
  {
    externalId: 'prod_k70_max',
    title: 'Corsair K70 MAX RGB Magnetic-Mechanical Keyboard',
    description: 'Magnetic-mechanical gaming keyboard with adjustable Corsair MGX switches and per-key RGB backlighting.',
    category: 'Keyboards',
    merchantId: 'MERCHANT_CORSAIR',
    merchantName: 'Corsair Gaming',
    paypalMerchantId: 'PPM_CORSAIR_505',
    basePriceMinor: '22999',
    currency: 'USD',
    minorUnitExponent: 2,
    specifications: {
      actuationPoint: '0.4mm - 3.6mm adjustable',
      backlight: 'Per-Key RGB',
      connectivity: 'Wired (USB-C)',
      formFactor: 'Full Size',
      pollingRateHz: 8000,
      switchType: 'Corsair MGX Magnetic'
    },
    productUrl: 'https://www.corsair.com/products/k70-max',
    catalogSource: 'CHANNEL3_OFFLINE_FIXTURE',
    isVerified: true
  },
  {
    externalId: 'prod_nuphy_air75_v2',
    title: 'NuPhy Air75 V2 Low-Profile Wireless Keyboard',
    description: 'Ultra-thin low-profile wireless mechanical keyboard with 1000Hz polling rate in 2.4G mode and RGB backlight.',
    category: 'Keyboards',
    merchantId: 'MERCHANT_NUPHY',
    merchantName: 'NuPhy Studio',
    paypalMerchantId: 'PPM_NUPHY_606',
    basePriceMinor: '11995',
    currency: 'USD',
    minorUnitExponent: 2,
    specifications: {
      backlight: 'RGB Backlight and Sidelight',
      batteryCapacityMah: 4000,
      connectivity: 'Tri-Mode (2.4G / Bluetooth 5.1 / USB-C)',
      formFactor: '75%',
      hotSwappable: true,
      switchType: 'Linear (NuPhy Aloe Low-Profile)'
    },
    productUrl: 'https://nuphy.com/products/air75-v2',
    catalogSource: 'CHANNEL3_OFFLINE_FIXTURE',
    isVerified: true
  },
  {
    externalId: 'prod_ergodox_ez',
    title: 'ErgoDox EZ Ergonomic Split Mechanical Keyboard',
    description: 'Open-source ergonomic split keyboard with ortholinear key layout, hot-swappable switches, and tilt/tent kit.',
    category: 'Keyboards',
    merchantId: 'MERCHANT_ERGODOX',
    merchantName: 'ErgoDox EZ',
    paypalMerchantId: 'PPM_ERGODOX_707',
    basePriceMinor: '32500',
    currency: 'USD',
    minorUnitExponent: 2,
    specifications: {
      backlight: 'None',
      connectivity: 'Wired (USB-A / USB-C)',
      formFactor: 'Split Ortholinear',
      hotSwappable: true,
      switchType: 'Clicky (Cherry MX Blue)',
      wristRestsIncluded: true
    },
    productUrl: 'https://ergodox-ez.com/products/ergodox-ez',
    catalogSource: 'CHANNEL3_OFFLINE_FIXTURE',
    isVerified: true
  },

  // --- HEADPHONES (6 items) ---
  {
    externalId: 'prod_sony_xm5',
    title: 'Sony WH-1000XM5 Wireless Noise-Cancelling Headphones',
    description: 'Industry-leading noise cancelling wireless headphones with 2 processors, 8 microphones, and Auto NC Optimizer.',
    category: 'Headphones',
    merchantId: 'MERCHANT_SONY',
    merchantName: 'Sony Electronics',
    paypalMerchantId: 'PPM_SONY_101',
    basePriceMinor: '39999',
    currency: 'USD',
    minorUnitExponent: 2,
    specifications: {
      activeNoiseCancelling: true,
      batteryLifeHours: 30,
      codecSupport: ['LDAC', 'AAC', 'SBC'],
      connectivity: 'Wireless (Bluetooth 5.2 / 3.5mm)',
      driverSizeMm: 30,
      weightGrams: 250
    },
    productUrl: 'https://www.sony.com/electronics/headband-headphones/wh-1000xm5',
    catalogSource: 'CHANNEL3_OFFLINE_FIXTURE',
    isVerified: true
  },
  {
    externalId: 'prod_bose_qc_ultra',
    title: 'Bose QuietComfort Ultra Wireless Headphones',
    description: 'Flagship wireless noise cancelling headphones featuring Bose Immersive Audio spatialized sound and CustomTune technology.',
    category: 'Headphones',
    merchantId: 'MERCHANT_BOSE',
    merchantName: 'Bose Corporation',
    paypalMerchantId: 'PPM_BOSE_202',
    basePriceMinor: '42900',
    currency: 'USD',
    minorUnitExponent: 2,
    specifications: {
      activeNoiseCancelling: true,
      batteryLifeHours: 24,
      codecSupport: ['aptX Adaptive', 'AAC', 'SBC'],
      connectivity: 'Wireless (Bluetooth 5.3)',
      spatialAudio: true,
      weightGrams: 254
    },
    productUrl: 'https://www.bose.com/p/headphones/bose-quietcomfort-ultra-headphones',
    catalogSource: 'CHANNEL3_OFFLINE_FIXTURE',
    isVerified: true
  },
  {
    externalId: 'prod_ath_m50x_bt2',
    title: 'Audio-Technica ATH-M50xBT2 Wireless Studio Monitor Headphones',
    description: 'Critically acclaimed studio sound in wireless format with 45mm large-aperture drivers and dedicated audio DAC.',
    category: 'Headphones',
    merchantId: 'MERCHANT_AUDIOTECHNICA',
    merchantName: 'Audio-Technica',
    paypalMerchantId: 'PPM_ATH_808',
    basePriceMinor: '19900',
    currency: 'USD',
    minorUnitExponent: 2,
    specifications: {
      activeNoiseCancelling: false,
      batteryLifeHours: 50,
      codecSupport: ['LDAC', 'AAC', 'SBC'],
      connectivity: 'Wireless (Bluetooth 5.0 / 3.5mm)',
      design: 'Closed-back Over-Ear',
      driverSizeMm: 45,
      impedanceOhms: 38
    },
    productUrl: 'https://www.audio-technica.com/ath-m50xbt2',
    catalogSource: 'CHANNEL3_OFFLINE_FIXTURE',
    isVerified: true
  },
  {
    externalId: 'prod_senn_hd660s2',
    title: 'Sennheiser HD 660S2 Open-Back Dynamic Headphones',
    description: 'Audiophile open-back headphones engineered for precision listening with revised acoustic suspension and sub-bass extension.',
    category: 'Headphones',
    merchantId: 'MERCHANT_SENNHEISER',
    merchantName: 'Sennheiser Hearing',
    paypalMerchantId: 'PPM_SENNHEISER_909',
    basePriceMinor: '59995',
    currency: 'USD',
    minorUnitExponent: 2,
    specifications: {
      activeNoiseCancelling: false,
      connectivity: 'Wired (6.35mm / 4.4mm balanced)',
      design: 'Open-back Over-Ear',
      driverSizeMm: 38,
      frequencyResponseHz: '8 - 41500',
      impedanceOhms: 300,
      weightGrams: 260
    },
    productUrl: 'https://www.sennheiser-hearing.com/hd-660s2',
    catalogSource: 'CHANNEL3_OFFLINE_FIXTURE',
    isVerified: true
  },
  {
    externalId: 'prod_apple_airpods_max',
    title: 'Apple AirPods Max Wireless Over-Ear Headphones',
    description: 'Premium computational audio headphones with high-fidelity sound, Active Noise Cancellation, and Transparency mode.',
    category: 'Headphones',
    merchantId: 'MERCHANT_APPLE',
    merchantName: 'Apple Authorized Reseller',
    paypalMerchantId: 'PPM_APPLE_010',
    basePriceMinor: '54900',
    currency: 'USD',
    minorUnitExponent: 2,
    specifications: {
      activeNoiseCancelling: true,
      batteryLifeHours: 20,
      chipset: 'Apple H1 (each cup)',
      connectivity: 'Wireless (Bluetooth 5.0)',
      design: 'Closed-back Over-Ear',
      driverSizeMm: 40,
      spatialAudio: true,
      weightGrams: 384
    },
    productUrl: 'https://www.apple.com/airpods-max',
    catalogSource: 'CHANNEL3_OFFLINE_FIXTURE',
    isVerified: true
  },
  {
    externalId: 'prod_beyer_dt770_pro',
    title: 'Beyerdynamic DT 770 PRO Studio Headphones',
    description: 'Benchmark closed-back studio reference headphones for professional recording, mixing, and critical listening.',
    category: 'Headphones',
    merchantId: 'MERCHANT_BEYERDYNAMIC',
    merchantName: 'Beyerdynamic Pro',
    paypalMerchantId: 'PPM_BEYER_111',
    basePriceMinor: '16900',
    currency: 'USD',
    minorUnitExponent: 2,
    specifications: {
      activeNoiseCancelling: false,
      connectivity: 'Wired (3.5mm with 6.35mm adapter)',
      design: 'Closed-back Over-Ear',
      earpadMaterial: 'Velour',
      frequencyResponseHz: '5 - 35000',
      impedanceOhms: 80,
      weightGrams: 270
    },
    productUrl: 'https://global.beyerdynamic.com/dt-770-pro.html',
    catalogSource: 'CHANNEL3_OFFLINE_FIXTURE',
    isVerified: true
  },

  // --- MONITORS (6 items) ---
  {
    externalId: 'prod_dell_u2723qe',
    title: 'Dell UltraSharp U2723QE 27" 4K USB-C Hub Monitor',
    description: '27-inch 4K UHD monitor with IPS Black technology, 2000:1 contrast ratio, 90W USB-C Power Delivery, and RJ45 ethernet.',
    category: 'Monitors',
    merchantId: 'MERCHANT_DELL',
    merchantName: 'Dell Official Store',
    paypalMerchantId: 'PPM_DELL_303',
    basePriceMinor: '57999',
    currency: 'USD',
    minorUnitExponent: 2,
    specifications: {
      aspectRatio: '16:9',
      colorGamut: '98% DCI-P3',
      contrastRatio: '2000:1',
      panelType: 'IPS Black',
      ports: ['USB-C 90W PD', 'DisplayPort 1.4', 'HDMI 2.0', 'RJ45'],
      refreshRateHz: 60,
      resolution: '3840x2160 (4K UHD)',
      screenSizeInches: 27
    },
    productUrl: 'https://www.dell.com/en-us/shop/dell-ultrasharp-27-4k-usb-c-hub-monitor-u2723qe/apd/210-bdpf',
    catalogSource: 'CHANNEL3_OFFLINE_FIXTURE',
    isVerified: true
  },
  {
    externalId: 'prod_lg_27gp950',
    title: 'LG 27GP950-B 27" UltraGear 4K Gaming Monitor',
    description: 'High-performance 4K Nano IPS gaming monitor with 144Hz refresh rate (OC 160Hz), 1ms response, HDMI 2.1, and VESA DisplayHDR 600.',
    category: 'Monitors',
    merchantId: 'MERCHANT_LG',
    merchantName: 'LG Electronics',
    paypalMerchantId: 'PPM_LG_404',
    basePriceMinor: '69999',
    currency: 'USD',
    minorUnitExponent: 2,
    specifications: {
      aspectRatio: '16:9',
      hdr: 'VESA DisplayHDR 600',
      panelType: 'Nano IPS',
      ports: ['HDMI 2.1 (x2)', 'DisplayPort 1.4 DSC', 'USB 3.0 Hub'],
      refreshRateHz: 144,
      resolution: '3840x2160 (4K UHD)',
      responseTimeMs: 1,
      screenSizeInches: 27,
      syncTechnology: 'NVIDIA G-SYNC Compatible / AMD FreeSync Premium Pro'
    },
    productUrl: 'https://www.lg.com/us/monitors/lg-27gp950-b-gaming-monitor',
    catalogSource: 'CHANNEL3_OFFLINE_FIXTURE',
    isVerified: true
  },
  {
    externalId: 'prod_asus_pa329cv',
    title: 'ASUS ProArt PA329CV 32" 4K Professional Monitor',
    description: 'Color-accurate 32-inch 4K HDR monitor factory calibrated for Delta E < 2 with 100% sRGB / Rec. 709 and 90W USB-C.',
    category: 'Monitors',
    merchantId: 'MERCHANT_ASUS',
    merchantName: 'ASUS Official',
    paypalMerchantId: 'PPM_ASUS_212',
    basePriceMinor: '64900',
    currency: 'USD',
    minorUnitExponent: 2,
    specifications: {
      aspectRatio: '16:9',
      colorAccuracy: 'Delta E < 2',
      colorGamut: '100% sRGB / 100% Rec. 709',
      hdr: 'HDR10 / VESA DisplayHDR 400',
      panelType: 'IPS',
      ports: ['USB-C 90W PD', 'DisplayPort 1.2', 'HDMI 2.0 (x2)'],
      refreshRateHz: 60,
      resolution: '3840x2160 (4K UHD)',
      screenSizeInches: 32
    },
    productUrl: 'https://www.asus.com/displays-desktops/monitors/proart/proart-display-pa329cv',
    catalogSource: 'CHANNEL3_OFFLINE_FIXTURE',
    isVerified: true
  },
  {
    externalId: 'prod_samsung_neo_g9',
    title: 'Samsung Odyssey Neo G9 49" Curved Gaming Monitor',
    description: 'Super ultrawide 49-inch Dual QHD gaming monitor with Quantum Mini-LED, 240Hz refresh rate, 1ms response, and 1000R curvature.',
    category: 'Monitors',
    merchantId: 'MERCHANT_SAMSUNG',
    merchantName: 'Samsung Electronics',
    paypalMerchantId: 'PPM_SAMSUNG_313',
    basePriceMinor: '129999',
    currency: 'USD',
    minorUnitExponent: 2,
    specifications: {
      aspectRatio: '32:9',
      curvature: '1000R',
      hdr: 'Quantum HDR 2000',
      panelType: 'Quantum Mini-LED VA',
      ports: ['DisplayPort 1.4', 'HDMI 2.1 (x2)', 'USB 3.0 Hub'],
      refreshRateHz: 240,
      resolution: '5120x1440 (Dual QHD)',
      responseTimeMs: 1,
      screenSizeInches: 49
    },
    productUrl: 'https://www.samsung.com/us/computing/monitors/gaming/49-odyssey-neo-g9-g95na-gaming-monitor-ls49ag952nnxza',
    catalogSource: 'CHANNEL3_OFFLINE_FIXTURE',
    isVerified: true
  },
  {
    externalId: 'prod_benq_ew3270u',
    title: 'BenQ EW3270U 32" 4K HDR Entertainment Monitor',
    description: '32-inch 4K monitor with High Dynamic Range, Brightness Intelligence Plus technology, 3000:1 native contrast, and USB-C connectivity.',
    category: 'Monitors',
    merchantId: 'MERCHANT_BENQ',
    merchantName: 'BenQ Direct',
    paypalMerchantId: 'PPM_BENQ_414',
    basePriceMinor: '34999',
    currency: 'USD',
    minorUnitExponent: 2,
    specifications: {
      aspectRatio: '16:9',
      colorGamut: '95% DCI-P3',
      contrastRatio: '3000:1',
      eyeCare: 'Brightness Intelligence Plus (B.I.+)',
      hdr: 'HDR10',
      panelType: 'VA',
      ports: ['USB-C', 'DisplayPort 1.4', 'HDMI 2.0 (x2)'],
      refreshRateHz: 60,
      resolution: '3840x2160 (4K UHD)',
      screenSizeInches: 32
    },
    productUrl: 'https://www.benq.com/en-us/monitor/entertainment/ew3270u.html',
    catalogSource: 'CHANNEL3_OFFLINE_FIXTURE',
    isVerified: true
  },
  {
    externalId: 'prod_alienware_aw3423dwf',
    title: 'Alienware AW3423DWF 34" Curved QD-OLED Gaming Monitor',
    description: '34-inch curved ultrawide QD-OLED gaming monitor with infinite contrast, 165Hz refresh rate, 0.1ms response time, and AMD FreeSync Premium Pro.',
    category: 'Monitors',
    merchantId: 'MERCHANT_ALIENWARE',
    merchantName: 'Alienware Official',
    paypalMerchantId: 'PPM_ALIENWARE_515',
    basePriceMinor: '79999',
    currency: 'USD',
    minorUnitExponent: 2,
    specifications: {
      aspectRatio: '21:9',
      contrastRatio: '1000000:1 (Infinite)',
      curvature: '1800R',
      hdr: 'VESA DisplayHDR True Black 400',
      panelType: 'Quantum Dot OLED (QD-OLED)',
      ports: ['DisplayPort 1.4 (x2)', 'HDMI 2.0', 'USB 3.2 Gen 1 Hub'],
      refreshRateHz: 165,
      resolution: '3440x1440 (UWQHD)',
      responseTimeMs: 0.1,
      screenSizeInches: 34,
      syncTechnology: 'AMD FreeSync Premium Pro'
    },
    productUrl: 'https://www.dell.com/en-us/shop/alienware-34-curved-qd-oled-gaming-monitor-aw3423dwf/apd/210-bfrp',
    catalogSource: 'CHANNEL3_OFFLINE_FIXTURE',
    isVerified: true
  }
];

// Calculate RFC 8785 specHash for each product
const enrichedProducts = products.map((product) => {
  const canonicalSpec = canonicalize(product.specifications);
  const specHash = crypto.createHash('sha256').update(canonicalSpec).digest('hex');
  return {
    ...product,
    specHash
  };
});

const outputPath = path.resolve('data', 'catalog_fixture.json');
fs.writeFileSync(outputPath, JSON.stringify(enrichedProducts, null, 2), 'utf-8');
console.log(`Successfully generated ${enrichedProducts.length} verified products to ${outputPath}`);
