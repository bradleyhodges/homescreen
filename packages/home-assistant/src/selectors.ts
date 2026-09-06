import type { HassEntities, HassEntity } from "home-assistant-js-websocket";

/** Missing IDs are omitted; requested order is retained. */
export function selectEntities(
    entities: HassEntities,
    ids?: readonly string[],
): HassEntity[] {
    return ids
        ? ids.flatMap((id) => (entities[id] ? [entities[id]] : []))
        : Object.values(entities);
}

/** Match the domain before the entity ID's first dot. */
export function selectDomain(
    entities: HassEntities,
    domain: string,
): HassEntity[] {
    return Object.values(entities).filter(
        (entity) => entity.entity_id.split(".")[0] === domain,
    );
}

/** Search entity IDs and friendly names with a case-insensitive substring. */
export function selectQuery(
    entities: HassEntities,
    query: string,
): HassEntity[] {
    const search = query.trim().toLocaleLowerCase();
    return Object.values(entities).filter(
        (entity) =>
            entity.entity_id.toLocaleLowerCase().includes(search) ||
            String(entity.attributes.friendly_name ?? "")
                .toLocaleLowerCase()
                .includes(search),
    );
}
