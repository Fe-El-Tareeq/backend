-- Move references from unambiguous legacy English neighborhoods to the new
-- keyed delivery neighborhoods. Al-Rimal is intentionally not mapped because
-- it could mean either Northern or Southern Rimal.
WITH mappings(old_name, new_key) AS (
  VALUES
    ('Al-Nasr', 'AN_NASER'),
    ('Al-Sabra', 'AS_SABRA'),
    ('Al-Shujaeya', 'ASH_SHUJAIYEH'),
    ('Al-Zaytoun', 'AZ_ZAITOUN'),
    ('Tal Al-Hawa', 'TAL_EL_HAWA')
)
UPDATE "users" AS u
SET "neighborhood_id" = target.id
FROM "neighborhoods" legacy
JOIN mappings m ON m.old_name = legacy.name
JOIN "neighborhoods" target ON target.key = m.new_key
WHERE u."neighborhood_id" = legacy.id
  AND legacy.key IS NULL;

WITH mappings(old_name, new_key) AS (
  VALUES
    ('Al-Nasr', 'AN_NASER'),
    ('Al-Sabra', 'AS_SABRA'),
    ('Al-Shujaeya', 'ASH_SHUJAIYEH'),
    ('Al-Zaytoun', 'AZ_ZAITOUN'),
    ('Tal Al-Hawa', 'TAL_EL_HAWA')
)
UPDATE "errands" AS e
SET "neighborhood_id" = target.id
FROM "neighborhoods" legacy
JOIN mappings m ON m.old_name = legacy.name
JOIN "neighborhoods" target ON target.key = m.new_key
WHERE e."neighborhood_id" = legacy.id
  AND legacy.key IS NULL;

WITH mappings(old_name, new_key) AS (
  VALUES
    ('Al-Nasr', 'AN_NASER'),
    ('Al-Sabra', 'AS_SABRA'),
    ('Al-Shujaeya', 'ASH_SHUJAIYEH'),
    ('Al-Zaytoun', 'AZ_ZAITOUN'),
    ('Tal Al-Hawa', 'TAL_EL_HAWA')
)
UPDATE "trips" AS t
SET "neighborhood_id" = target.id
FROM "neighborhoods" legacy
JOIN mappings m ON m.old_name = legacy.name
JOIN "neighborhoods" target ON target.key = m.new_key
WHERE t."neighborhood_id" = legacy.id
  AND legacy.key IS NULL;

UPDATE "neighborhoods"
SET "is_active" = FALSE
WHERE "key" IS NULL;
