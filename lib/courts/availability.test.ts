import { describe, expect, it } from "vitest";

import { freeSlotsByCourt, merge, openIntervals, slotStarts, subtract, type Interval } from "./availability";

const TZ = "America/Mexico_City"; // UTC-6, sin horario de verano desde 2022
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-06:00`).getTime();
const hhmm = (ms: number) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(ms);

// 2027-02-01 es lunes.
const LUNES = "2027-02-01";
const HOURS = [
  { day_of_week: 1, open_time: "07:00:00", close_time: "14:00:00" },
  { day_of_week: 1, open_time: "16:00:00", close_time: "22:00:00" },
  { day_of_week: 2, open_time: "07:00:00", close_time: "22:00:00" },
];

describe("openIntervals", () => {
  it("convierte el horario semanal del día a instantes con la zona del club", () => {
    const open = openIntervals(HOURS, LUNES, TZ);
    expect(open).toEqual([
      { start: at(LUNES, "07:00"), end: at(LUNES, "14:00") },
      { start: at(LUNES, "16:00"), end: at(LUNES, "22:00") },
    ]);
  });

  it("un día sin horario está cerrado", () => {
    expect(openIntervals(HOURS, "2027-02-07", TZ)).toEqual([]); // domingo
  });
});

describe("merge y subtract", () => {
  it("une intervalos encimados o contiguos", () => {
    expect(merge([{ start: 5, end: 8 }, { start: 0, end: 5 }, { start: 7, end: 10 }])).toEqual([{ start: 0, end: 10 }]);
  });

  it("resta reservas y bloqueos de las franjas abiertas", () => {
    const open: Interval[] = [{ start: 0, end: 100 }];
    const busy: Interval[] = [{ start: 10, end: 20 }, { start: 15, end: 30 }, { start: 90, end: 120 }];
    expect(subtract(open, busy)).toEqual([{ start: 0, end: 10 }, { start: 30, end: 90 }]);
  });

  it("un bloqueo de todo el día deja la cancha sin huecos", () => {
    expect(subtract([{ start: 10, end: 20 }], [{ start: 0, end: 100 }])).toEqual([]);
  });
});

describe("slotStarts", () => {
  it("ofrece inicios cada `step` donde cabe el partido completo", () => {
    const free = [{ start: at(LUNES, "07:00"), end: at(LUNES, "10:00") }];
    expect(slotStarts(free, 90, 30).map((s) => hhmm(s.start))).toEqual(["07:00", "07:30", "08:00", "08:30"]);
  });

  it("descarta los horarios que ya pasaron", () => {
    const free = [{ start: at(LUNES, "07:00"), end: at(LUNES, "10:00") }];
    expect(slotStarts(free, 90, 30, at(LUNES, "08:00")).map((s) => hhmm(s.start))).toEqual(["08:00", "08:30"]);
  });
});

describe("freeSlotsByCourt", () => {
  it("combina horario, bloqueos y reservas por cancha", () => {
    const slots = freeSlotsByCourt(
      [
        {
          courtId: "c1",
          hours: HOURS,
          blocks: [{ start: at(LUNES, "07:00"), end: at(LUNES, "12:00") }],
          bookings: [{ start: at(LUNES, "16:00"), end: at(LUNES, "17:30") }],
        },
      ],
      LUNES,
      TZ,
      { durationMin: 90, stepMin: 30 },
    );
    const starts = slots.get("c1")!.map((s) => hhmm(s.start));
    // Mañana: libre 12:00-14:00 → 12:00 y 12:30. Tarde: libre 17:30-22:00.
    expect(starts.slice(0, 3)).toEqual(["12:00", "12:30", "17:30"]);
    expect(starts.at(-1)).toBe("20:30");
  });
});
