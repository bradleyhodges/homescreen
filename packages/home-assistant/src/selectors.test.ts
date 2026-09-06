import { describe, expect, it } from "vitest";
import type { HassEntities, HassEntity } from "home-assistant-js-websocket";
import { selectDomain, selectEntities, selectQuery } from "./selectors";

const entity = (id: string, name: string): HassEntity => ({
  entity_id: id,
  state: "off",
  attributes: { friendly_name: name },
  last_changed: "",
  last_updated: "",
  context: { id: "", parent_id: null, user_id: null },
});
const entities: HassEntities = {
  "light.desk": entity("light.desk", "Desk Light"),
  "sensor.light_level": entity("sensor.light_level", "Brightness"),
};
describe("entity selectors", () => {
  it("matches domains exactly", () =>
    expect(selectDomain(entities, "light")).toEqual([entities["light.desk"]]));
  it("preserves requested order and skips missing entities", () =>
    expect(
      selectEntities(entities, [
        "missing.id",
        "sensor.light_level",
        "light.desk",
      ]),
    ).toEqual([entities["sensor.light_level"], entities["light.desk"]]));
  it("searches names and ids case-insensitively", () => {
    expect(selectQuery(entities, " DESK ")).toEqual([entities["light.desk"]]);
    expect(selectQuery(entities, "sensor.")).toEqual([
      entities["sensor.light_level"],
    ]);
    expect(selectQuery(entities, "unknown")).toEqual([]);
    expect(selectQuery(entities, "")).toHaveLength(2);
  });
});
