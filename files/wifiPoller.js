/**
 * Runs separately from the API server (cron / pm2 / systemd timer).
 * Job: ask the WiFi controller "how many devices are on this AP right now",
 * map AP -> campus location, POST the count to /api/wifi/ingest.
 *
 * MOCK_MODE=true works with no real controller — useful for the hackathon
 * demo. Flip it off and fill in your controller's details to go live.
 */
const MOCK_MODE = process.env.MOCK_MODE !== "false";
const API_BASE = process.env.API_BASE || "http://localhost:4000";

// Map each AP (by MAC or name in your controller) to a campus location id.
const AP_TO_LOCATION = {
  "AP-Canteen-01": "mainCanteen",
  "AP-LibCafe-01": "cafeLibSide",
  "AP-Library-01": "centralLib",
  "AP-Library-02": "centralLib",
  "AP-PrintShop-01": "printShop",
  "AP-Gym-01": "gym",
  "AP-AdminOffice-01": "adminOffice",
};

async function getDeviceCountsPerAP() {
  if (MOCK_MODE) {
    // Simulated live device counts, for demoing without hardware access.
    const out = {};
    for (const ap in AP_TO_LOCATION) out[ap] = Math.floor(Math.random() * 60);
    return out;
  }

  // ---- Real integration example: Ubiquiti UniFi Network Controller ----
  // GET {controller}/api/s/{site}/stat/sta  -> list of currently connected clients,
  // each with an `ap_mac`. Count clients grouped by ap_mac, filtered to the
  // student/campus SSID (exclude staff & IoT SSIDs so counts reflect footfall).
  //
  // const res = await fetch(`${process.env.UNIFI_CONTROLLER}/api/s/default/stat/sta`, {
  //   headers: { Cookie: process.env.UNIFI_SESSION_COOKIE },
  // });
  // const { data: clients } = await res.json();
  // const counts = {};
  // for (const c of clients) {
  //   if (c.essid !== process.env.STUDENT_SSID) continue;
  //   counts[c.ap_mac] = (counts[c.ap_mac] || 0) + 1;
  // }
  // return counts;  // keys should match AP_TO_LOCATION's keys (use ap_mac there instead)

  // Other common options if not on UniFi:
  //  - Aruba Central API: GET /monitoring/v1/aps/{serial}/clients
  //  - Generic SNMP: walk dot11AssociatedStations OID per AP
  //  - Cisco Meraki Dashboard API: GET /networks/{id}/wireless/clients

  throw new Error("Set MOCK_MODE=true or implement the real controller call above.");
}

async function pollOnce() {
  const perAP = await getDeviceCountsPerAP();
  const perLocation = {};
  for (const [ap, count] of Object.entries(perAP)) {
    const loc = AP_TO_LOCATION[ap];
    if (!loc) continue;
    perLocation[loc] = (perLocation[loc] || 0) + count;
  }

  for (const [locationId, deviceCount] of Object.entries(perLocation)) {
    await fetch(`${API_BASE}/api/wifi/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationId, deviceCount }),
    });
    console.log(`${locationId}: ${deviceCount} devices`);
  }
}

pollOnce();
setInterval(pollOnce, 3 * 60 * 1000); // every 3 minutes
