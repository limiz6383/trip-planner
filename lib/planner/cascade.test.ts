import { test } from "node:test";
import assert from "node:assert/strict";
import { cascadeAfterEdit, type CascadeActivity } from "./cascade.ts";

const act = (
  id: string,
  start: string,
  hours: number,
  type = "culture",
  locked = false
): CascadeActivity => ({
  activity_id: id,
  start_time: start,
  estimated_time_hours: hours,
  activity_type: type,
  locked,
  sort_order: 0,
});

const times = (acts: CascadeActivity[]) => acts.map((a) => `${a.activity_id}@${a.start_time}`);

const day = [
  act("breakfast", "08:00", 1, "food"),
  act("concert", "10:00", 2, "entertainment"),
  act("lunch", "12:30", 1, "food"),
  act("museum", "14:00", 2),
  act("dinner", "18:00", 1.5, "food"),
];

test("moving the concert to 8:15pm moves only the concert", () => {
  const { activities, changed } = cascadeAfterEdit(day, { ...day[1], start_time: "20:15" });
  assert.deepEqual(times(activities), [
    "breakfast@08:00",
    "lunch@12:30",
    "museum@14:00",
    "dinner@18:00",
    "concert@20:15",
  ]);
  assert.deepEqual(changed, []);
});

test("a moved activity pushes only what it now overlaps, chaining forward", () => {
  const { activities, changed } = cascadeAfterEdit(day, { ...day[1], start_time: "13:30" });
  assert.deepEqual(times(activities), [
    "breakfast@08:00",
    "lunch@12:30",
    "concert@13:30",
    "museum@15:30",
    "dinner@18:00",
  ]);
  assert.deepEqual(changed, [{ activity_id: "museum", start_time: "15:30" }]);
});

test("a later arrival keeps the rest of the day after it", () => {
  const arrival = [
    act("arrive", "09:00", 1.5, "transport"),
    act("lunch", "11:00", 1, "food"),
    act("walk", "13:00", 2, "outdoor"),
    act("dinner", "19:00", 1.5, "food"),
  ];
  const { activities } = cascadeAfterEdit(arrival, { ...arrival[0], start_time: "15:00" });
  assert.deepEqual(times(activities), [
    "arrive@15:00",
    "lunch@16:30",
    "walk@17:30",
    "dinner@19:30",
  ]);
});

test("locked activities never move", () => {
  const withLock = [...day.slice(0, 3), act("museum", "14:00", 2, "culture", true), day[4]];
  const { activities } = cascadeAfterEdit(withLock, { ...withLock[1], start_time: "13:30" });
  assert.ok(times(activities).includes("museum@14:00"));
});

test("a duration-only change still shifts the rest of the day", () => {
  const { activities } = cascadeAfterEdit(day, { ...day[1], estimated_time_hours: 3 });
  assert.deepEqual(times(activities), [
    "breakfast@08:00",
    "concert@10:00",
    "lunch@13:30",
    "museum@15:00",
    "dinner@19:00",
  ]);
});
