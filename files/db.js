const { DatabaseSync } = require("node:sqlite"); // built into Node 22+, no native build needed
const db = new DatabaseSync("campus.db");

db.exec(`
CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  name TEXT, category TEXT, hours TEXT,
  avg_visit_min INTEGER,      -- how long the service typically takes (drives thresholds)
  quiet_max INTEGER,          -- minutes: at/under this = quiet
  moderate_max INTEGER,       -- minutes: at/under this = moderate, above = busy
  peak_wait_min INTEGER,      -- estimated wait at 100% demand
  capacity_devices INTEGER,   -- device count on this location's WiFi AP(s) that ~= 100% demand
  pattern TEXT                -- JSON array[24], rolling hourly demand average (0-100)
);

CREATE TABLE IF NOT EXISTS wifi_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id TEXT, device_count INTEGER, recorded_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY, name TEXT, type TEXT, capacity INTEGER
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT, token TEXT UNIQUE, requester_name TEXT, purpose TEXT,
  start_time TEXT, end_time TEXT,
  status TEXT DEFAULT 'booked',   -- booked | checked_in | completed | cancelled | no_show
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// Seed locations once. avg_visit_min / quiet_max / moderate_max / peak_wait_min
// mirror the frontend's per-service logic — this is the single source of truth now.
const seedLocations = [
  ["mainCanteen", "Main Canteen", "Food", "7:00a – 9:00p", 6, 5, 10, 16, 180, [4,3,3,3,3,4,10,28,45,38,30,55,92,88,50,30,35,58,72,60,35,20,10,6]],
  ["cafeLibSide", "Library Side Cafe", "Food", "8:00a – 8:00p", 4, 3, 6, 9, 90, [3,2,2,2,3,5,8,20,35,48,55,60,65,58,62,70,75,68,50,35,22,14,8,5]],
  ["centralLib", "Central Library", "Study", "8:00a – 10:00p", 10, 8, 18, 30, 400, [2,2,2,2,3,5,10,22,35,45,55,62,58,60,68,78,85,80,72,58,40,25,12,5]],
  ["printShop", "Print & Copy Shop", "Admin", "9:00a – 6:00p", 2, 3, 6, 10, 40, [1,1,1,1,1,2,5,15,30,42,38,44,40,46,52,60,55,35,20,10,5,3,2,1]],
  ["gym", "Campus Gym", "Sports", "6:00a – 10:00p", 12, 8, 16, 24, 120, [2,2,2,2,3,15,45,60,35,20,15,18,25,20,18,25,55,78,88,70,42,20,8,4]],
  ["adminOffice", "Admin Office", "Admin", "9:00a – 5:00p", 10, 8, 16, 26, 60, [0,0,0,0,0,0,2,10,55,72,65,68,40,58,62,55,30,10,2,0,0,0,0,0]],
];
const insertLoc = db.prepare(`INSERT OR IGNORE INTO locations
  (id,name,category,hours,avg_visit_min,quiet_max,moderate_max,peak_wait_min,capacity_devices,pattern)
  VALUES (?,?,?,?,?,?,?,?,?,?)`);
for (const l of seedLocations) insertLoc.run(l[0],l[1],l[2],l[3],l[4],l[5],l[6],l[7],l[8],JSON.stringify(l[9]));

const seedRooms = [
  ["meetingRoomA", "Meeting Room A (CS Block)", "meeting_room", 8],
  ["confHall", "Main Conference Hall", "conference_hall", 120],
  ["meetingRoomB", "Meeting Room B (Admin Block)", "meeting_room", 12],
];
const insertRoom = db.prepare(`INSERT OR IGNORE INTO rooms (id,name,type,capacity) VALUES (?,?,?,?)`);
for (const r of seedRooms) insertRoom.run(...r);

module.exports = db;
