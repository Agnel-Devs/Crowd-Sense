const express = require("express");
const cors = require("cors");
const { nanoid } = require("nanoid");
const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

/* ---------- shared math: same rules the frontend used, now server-side ---------- */
function computeStatus(loc, demand) {
  const midWait = (demand / 100) * loc.peak_wait_min;
  const waitLow = Math.max(0, Math.round(midWait * 0.8));
  const waitHigh = Math.max(waitLow + 1, Math.round(midWait * 1.25));
  let statusKey = "quiet";
  if (midWait > loc.moderate_max) statusKey = "busy";
  else if (midWait > loc.quiet_max) statusKey = "moderate";
  return { waitLow, waitHigh, statusKey };
}

/* ================= WIFI-DERIVED OCCUPANCY ================= */

// Poller script (see wifiPoller.js) calls this every few minutes per location.
app.post("/api/wifi/ingest", (req, res) => {
  const { locationId, deviceCount } = req.body;
  const loc = db.prepare("SELECT * FROM locations WHERE id=?").get(locationId);
  if (!loc) return res.status(404).json({ error: "unknown location" });

  db.prepare("INSERT INTO wifi_snapshots (location_id, device_count) VALUES (?,?)")
    .run(locationId, deviceCount);

  // Roll the new reading into that hour's pattern as an exponential moving
  // average (alpha=0.3), so predictions improve over time instead of being
  // overwritten by one noisy reading.
  const demand = Math.min(100, Math.round((deviceCount / loc.capacity_devices) * 100));
  const pattern = JSON.parse(loc.pattern);
  const hour = new Date().getHours();
  pattern[hour] = Math.round(pattern[hour] * 0.7 + demand * 0.3);
  db.prepare("UPDATE locations SET pattern=? WHERE id=?").run(JSON.stringify(pattern), locationId);

  res.json({ ok: true, demand });
});

// Frontend calls this on load + on "Refresh".
app.get("/api/locations", (req, res) => {
  const locs = db.prepare("SELECT * FROM locations").all();
  const out = locs.map(loc => {
    const latest = db.prepare(
      "SELECT device_count, recorded_at FROM wifi_snapshots WHERE location_id=? ORDER BY id DESC LIMIT 1"
    ).get(loc.id);

    const pattern = JSON.parse(loc.pattern);
    const hour = new Date().getHours();
    // Live demand = latest WiFi reading if fresh (<15 min old), else fall back
    // to the learned hourly pattern — so the board still works before any
    // WiFi data has come in, and degrades gracefully if the poller drops.
    const isFresh = latest && (Date.now() - new Date(latest.recorded_at + "Z").getTime()) < 15 * 60 * 1000;
    const demand = isFresh
      ? Math.min(100, Math.round((latest.device_count / loc.capacity_devices) * 100))
      : pattern[hour];

    const { waitLow, waitHigh, statusKey } = computeStatus(loc, demand);
    return {
      id: loc.id, name: loc.name, category: loc.category, hours: loc.hours,
      avgVisit: loc.avg_visit_min, quietMax: loc.quiet_max, moderateMax: loc.moderate_max,
      peakWait: loc.peak_wait_min, pattern, demand, waitLow, waitHigh, statusKey,
      source: isFresh ? "wifi" : "predicted",
      deviceCount: latest ? latest.device_count : null,
    };
  });
  res.json(out);
});

/* ================= MEETING ROOM TOKEN SYSTEM ================= */

function expireStaleBookings() {
  // Lazy expiry: any 'booked' room not checked in within 10 min of start becomes no_show.
  db.prepare(`
    UPDATE bookings SET status='no_show'
    WHERE status='booked' AND datetime(start_time, '+10 minutes') < datetime('now')
  `).run();
}

app.get("/api/rooms", (req, res) => {
  expireStaleBookings();
  const rooms = db.prepare("SELECT * FROM rooms").all();
  const out = rooms.map(r => {
    const current = db.prepare(`
      SELECT * FROM bookings WHERE room_id=? AND status IN ('booked','checked_in')
      AND datetime('now') BETWEEN datetime(start_time) AND datetime(end_time)
      ORDER BY start_time LIMIT 1
    `).get(r.id);
    return { ...r, occupied: !!current, currentBooking: current || null };
  });
  res.json(out);
});

app.get("/api/rooms/:id/bookings", (req, res) => {
  expireStaleBookings();
  const rows = db.prepare(
    "SELECT id,requester_name,purpose,start_time,end_time,status,token FROM bookings WHERE room_id=? ORDER BY start_time"
  ).all(req.params.id);
  res.json(rows);
});

// Book a room -> returns a token (share this / turn into a QR code for check-in).
app.post("/api/rooms/:id/bookings", (req, res) => {
  const { requesterName, purpose, startTime, endTime } = req.body;
  if (!requesterName || !startTime || !endTime) return res.status(400).json({ error: "missing fields" });

  const overlap = db.prepare(`
    SELECT 1 FROM bookings WHERE room_id=? AND status IN ('booked','checked_in')
    AND NOT (datetime(end_time) <= datetime(?) OR datetime(start_time) >= datetime(?))
  `).get(req.params.id, startTime, endTime);
  if (overlap) return res.status(409).json({ error: "room already booked in that window" });

  const token = nanoid(8).toUpperCase();
  db.prepare(`INSERT INTO bookings (room_id, token, requester_name, purpose, start_time, end_time)
    VALUES (?,?,?,?,?,?)`).run(req.params.id, token, requesterName, purpose || "", startTime, endTime);

  res.json({ token, roomId: req.params.id, startTime, endTime });
});

// Check in at the room using the token (e.g. scanned from a QR code at the door).
app.post("/api/bookings/:token/checkin", (req, res) => {
  const booking = db.prepare("SELECT * FROM bookings WHERE token=?").get(req.params.token);
  if (!booking) return res.status(404).json({ error: "invalid token" });
  if (booking.status !== "booked") return res.status(409).json({ error: `booking is ${booking.status}` });

  db.prepare("UPDATE bookings SET status='checked_in' WHERE id=?").run(booking.id);
  res.json({ ok: true, booking: { ...booking, status: "checked_in" } });
});

app.delete("/api/bookings/:id", (req, res) => {
  db.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

/* ================= DATA LOG (read-only view into the DB) ================= */

// Every booking ever made, newest first — proves booking input is persisted.
app.get("/api/admin/bookings", (req, res) => {
  const rows = db.prepare(`
    SELECT b.id, b.requester_name, b.purpose, b.start_time, b.end_time, b.status, b.token, b.created_at,
           r.name AS room_name
    FROM bookings b JOIN rooms r ON r.id = b.room_id
    ORDER BY b.created_at DESC LIMIT 100
  `).all();
  res.json(rows);
});

// Option 1: just the latest reading per location — "what's happening right now".
app.get("/api/admin/wifi-current", (req, res) => {
  const rows = db.prepare(`
    SELECT w.location_id, l.name AS location_name, w.device_count, w.recorded_at
    FROM wifi_snapshots w JOIN locations l ON l.id = w.location_id
    WHERE w.id IN (SELECT MAX(id) FROM wifi_snapshots GROUP BY location_id)
    ORDER BY l.name
  `).all();
  res.json(rows);
});

// Option 2: average traffic for one hour-of-day across all logged history — "what's typical at 2pm".
app.get("/api/admin/wifi-by-hour", (req, res) => {
  const hour = parseInt(req.query.hour, 10);
  if (isNaN(hour) || hour < 0 || hour > 23) return res.status(400).json({ error: "hour must be 0-23" });

  const rows = db.prepare(`
    SELECT w.location_id, l.name AS location_name,
           ROUND(AVG(w.device_count)) AS avg_devices, COUNT(*) AS reading_count
    FROM wifi_snapshots w JOIN locations l ON l.id = w.location_id
    WHERE CAST(strftime('%H', w.recorded_at) AS INTEGER) = ?
    GROUP BY w.location_id
    ORDER BY l.name
  `).all(hour);
  res.json(rows);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Campus backend running on :${PORT}`));
