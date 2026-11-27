-- Decision 7g (11 Mehr 1405), DEC-0245: the fixed price is retired. Every advert keeps its
-- amount and becomes negotiable; the enum value EXACT stays for history and is never written.
UPDATE "animal_listing" SET "price_mode" = 'NEGOTIABLE' WHERE "price_mode" = 'EXACT';
